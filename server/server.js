const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const Y = require("yjs");
const db = require("./db");
const cors = require("cors");
const Redis = require("ioredis");
require("dotenv").config();

db.initDB();

const pub = new Redis(process.env.REDIS_URL);
const sub = new Redis(process.env.REDIS_URL);

const DB_READ_INTERVAL_MS = 700;
const DB_UPDATE_INTERVAL_MS = 1000;
const MAX_SAVE_RETRIES = 3;
const JITTER_RANGE_MS = 1000;

const app = express();
app.use(express.json());
app.use(cors({ origin: `${process.env.CLIENT_ADDRESS}`, credentials: true }));

// --- HTTP ENDPOINTS ---
app.post("/insert/user", async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingPassword = await db.getPassword(username);
        if (existingPassword === password) return res.status(200).json({ message: "User already exists" });
        if (existingPassword === "") {
            await db.insertUser(username, password);
            return res.status(201).json({ message: "User created" });
        }
        return res.status(400).json({ message: "Incorrect password" });
    } catch (err) {
        console.error("❌ Auth Error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

const roomStates = new Map();

const getOrCreateRoomState = (roomId) => {
    if (!roomStates.has(roomId)) {
        console.log(`🏠 Creating new in-memory state for Room: ${roomId}`);
        roomStates.set(roomId, {
            doc: new Y.Doc(),
            version: 0,
            readTimestamp: Date.now(),
            updateTimestamp: Date.now(),
            peers: new Map() 
        });
    }
    return roomStates.get(roomId);
};

// --- GLOBAL REDIS LISTENER ---
sub.subscribe("ROOM_EVENTS");
sub.on("message", (channel, message) => {
    try {
        const { roomId, senderId, data } = JSON.parse(message);
        const state = roomStates.get(roomId);
        if (!state) return;

        if (data.type === "new-peer-alert" || data.type === "peer-left-alert") {
            console.log(`📢 Redis Broadcast: ${data.type} for user ${data.peerId}`);
            state.peers.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(data));
                }
            });
        }
        
        if (data.type === "webrtc-signal") {
            const target = state.peers.get(data.to);
            if (target && target.readyState === WebSocket.OPEN) {
                target.send(JSON.stringify({ ...data, from: senderId }));
            }
        }
    } catch (e) {
        console.error("❌ Redis Message Error:", e);
    }
});

// --- DB SYNC HELPER ---
async function updateToDbWithRetry(roomId, ydoc, version) {
    console.log(`💾 Attempting DB Update: Room ${roomId} (v${version})`);
    for (let attempt = 1; attempt <= MAX_SAVE_RETRIES; attempt++) {
        try {
            await db.updateRoom(ydoc, version, roomId);
            console.log(`✅ DB Update Success: Room ${roomId}`);
            return;
        } catch (err) {
            if (attempt === MAX_SAVE_RETRIES) {
                console.error(`❌ Failed to save room ${roomId} after ${MAX_SAVE_RETRIES} attempts`);
                return;
            }
            const delay = Math.random() * JITTER_RANGE_MS;
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

// --- WEBSOCKET SERVER ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
    const roomId = req.url.slice(1);
    const state = getOrCreateRoomState(roomId);
    
    let heartbeatInterval = null;

    ws.on("message", async (msg) => {
        try {
            const data = JSON.parse(msg.toString());

            if (data.type === "new-client") {
                // Bind identity to this specific socket instance
                ws.peerId = data.from;
                ws.roomId = roomId;

                console.log(`👤 Joining: ${ws.peerId}`);

                const exists = await db.checkRoom(roomId);
                if (!exists) {
                    await db.insertRoom(roomId, state.doc, state.version);
                }

                const lockKey = `lock:${roomId}:${ws.peerId}`;
                const lockAcquired = await pub.set(lockKey, "active", "NX", "EX", 60);

                if (!lockAcquired) {
                    console.log(`🚫 Conflict: ${ws.peerId} already in room.`);
                    ws.send(JSON.stringify({ type: "already-connected" }));
                    ws.peerId = null; // Prevent close event from running cleanup
                    return;
                }

                await db.insertRoomUserMapping(roomId, ws.peerId);
                state.peers.set(ws.peerId, ws);
                
                heartbeatInterval = setInterval(() => pub.expire(lockKey, 60), 20000);

                pub.publish("ROOM_EVENTS", JSON.stringify({
                    roomId, senderId: ws.peerId, data: { type: "new-peer-alert", peerId: ws.peerId }
                }));

                const usernames = await db.getUsernamesInRoom(roomId);
                ws.send(JSON.stringify({
                    type: "peers",
                    peers: usernames.filter(id => id !== ws.peerId)
                }));

                ws.send(JSON.stringify({
                    type: "yjs-init",
                    update: Array.from(Y.encodeStateAsUpdate(state.doc))
                }));
                return;
            }

            // Ensure this socket has an identity before processing other messages
            if (!ws.peerId) return;

            if (data.type === "yjs-update") {
                Y.applyUpdate(state.doc, new Uint8Array(data.update));

                if (Date.now() - state.readTimestamp > DB_READ_INTERVAL_MS) {
                    const dbDetails = await db.getRoomDetails(roomId);
                    if (dbDetails && dbDetails.ydoc_blob) {
                        Y.applyUpdate(state.doc, new Uint8Array(dbDetails.ydoc_blob));
                        state.version = dbDetails.version;
                    }
                    state.readTimestamp = Date.now();
                    data.update = Array.from(Y.encodeStateAsUpdate(state.doc));
                }

                state.peers.forEach((client, id) => {
                    if (id !== ws.peerId && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });

                if (Date.now() - state.updateTimestamp > DB_UPDATE_INTERVAL_MS) {
                    updateToDbWithRetry(roomId, state.doc, state.version);
                    state.updateTimestamp = Date.now();
                    state.version++; 
                }
            }

            if (data.type === "webrtc-signal") {
                pub.publish("ROOM_EVENTS", JSON.stringify({ roomId, senderId: ws.peerId, data }));
            }

        } catch (err) {
            console.error("❌ WS Message Error:", err);
        }
    });

    ws.on("close", async () => {
        // Use the ID bound to THIS socket
        if (ws.peerId) {
            console.log(`👋 Disconnected: ${ws.peerId}`);
            
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            await pub.del(`lock:${ws.roomId}:${ws.peerId}`);
            
            await updateToDbWithRetry(ws.roomId, state.doc, state.version);

            state.peers.delete(ws.peerId);
            await db.deleteRoomUserMapping(ws.peerId);
            
            pub.publish("ROOM_EVENTS", JSON.stringify({
                roomId: ws.roomId, 
                senderId: ws.peerId, 
                data: { type: "peer-left-alert", peerId: ws.peerId }
            }));

            setTimeout(async () => {
                const currentPeers = await db.getUsernamesInRoom(ws.roomId);
                if (currentPeers.length === 0) {
                    console.log(`🧹 Room ${ws.roomId} is empty. Running Cleanup...`);
                    await db.cleanupRoomIfEmpty(ws.roomId);
                    
                    if (state.peers.size === 0) {
                        roomStates.delete(ws.roomId);
                        console.log(`🗑️ Memory cleared for Room ${ws.roomId}`);
                    }
                }
            }, 2000);
        }
    });
});

server.listen(1234, () => console.log("🚀 Server running on port 1234"));