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
app.use(cors({ origin: `http://${process.env.CLIENT_ADDRESS}`, credentials: true }));

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
            console.log(`Webrtc message reddis broadcasrt from ${senderId} to ${data.to}`)
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
            console.warn(`⚠️ DB Update Retry ${attempt}/${MAX_SAVE_RETRIES} for ${roomId} in ${Math.round(delay)}ms`);
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

// --- WEBSOCKET SERVER ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
    const roomId = req.url.slice(1);
    console.log(`\n✨ Socket Connected: ${roomId}`);
    const state = getOrCreateRoomState(roomId);
    
    let peerId = null;
    let heartbeatInterval = null;

    ws.on("message", async (msg) => {
        try {
            const data = JSON.parse(msg.toString());

            if (data.type === "new-client") {
                peerId = data.from;
                console.log(`👤 Joining: ${peerId}`);

                const exists = await db.checkRoom(roomId);
                if (!exists) {
                    console.log(`📝 Initializing Room ${roomId} in DB...`);
                    await db.insertRoom(roomId, state.doc, state.version);
                }

                const lockKey = `lock:${roomId}:${peerId}`;
                const lockAcquired = await pub.set(lockKey, "active", "NX", "EX", 60);

                if (!lockAcquired) {
                    console.log(`🚫 Conflict: ${peerId} already in room.`);
                    ws.send(JSON.stringify({ type: "already-connected" }));
                    peerId = null;
                    return;
                }

                await db.insertRoomUserMapping(roomId, peerId);
                state.peers.set(peerId, ws);
                
                heartbeatInterval = setInterval(() => pub.expire(lockKey, 60), 20000);

                pub.publish("ROOM_EVENTS", JSON.stringify({
                    roomId, senderId: peerId, data: { type: "new-peer-alert", peerId }
                }));

                const usernames = await db.getUsernamesInRoom(roomId);
                ws.send(JSON.stringify({
                    type: "peers",
                    peers: usernames.filter(id => id !== peerId)
                }));

                ws.send(JSON.stringify({
                    type: "yjs-init",
                    update: Array.from(Y.encodeStateAsUpdate(state.doc))
                }));
                return;
            }

            if (!peerId) return;

            if (data.type === "yjs-update") {
                Y.applyUpdate(state.doc, new Uint8Array(data.update));

                // 🔄 PERIODIC DB READ
                if (Date.now() - state.readTimestamp > DB_READ_INTERVAL_MS) {
                    console.log(`🔍 DB Refresh: Checking for external updates for Room ${roomId}`);
                    const dbDetails = await db.getRoomDetails(roomId);
                    if (dbDetails && dbDetails.ydoc_blob) {
                        Y.applyUpdate(state.doc, new Uint8Array(dbDetails.ydoc_blob));
                        state.version = dbDetails.version;
                    }
                    state.readTimestamp = Date.now();
                    data.update = Array.from(Y.encodeStateAsUpdate(state.doc));
                }

                state.peers.forEach((client, id) => {
                    if (id !== peerId && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });

                // 🔄 PERIODIC DB WRITE
                if (Date.now() - state.updateTimestamp > DB_UPDATE_INTERVAL_MS) {
                    updateToDbWithRetry(roomId, state.doc, state.version);
                    state.updateTimestamp = Date.now();
                    state.version++; 
                }
            }

            if (data.type === "webrtc-signal") {
                pub.publish("ROOM_EVENTS", JSON.stringify({ roomId, senderId: peerId, data }));
            }

        } catch (err) {
            console.error("❌ WS Message Error:", err);
        }
    });

    ws.on("close", async () => {
        if (peerId) {
            console.log(`👋 Disconnected: ${peerId}`);
            
            // 1. Stop Heartbeat & Remove Redis Lock
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            await pub.del(`lock:${roomId}:${peerId}`);
            
            // 2. Final DB Sync (Save last changes before leaving)
            await updateToDbWithRetry(roomId, state.doc, state.version);

            // 3. Remove User from mapping
            state.peers.delete(peerId);
            await db.deleteRoomUserMapping(peerId);
            
            // 4. Broadcast departure
            pub.publish("ROOM_EVENTS", JSON.stringify({
                roomId, senderId: peerId, data: { type: "peer-left-alert", peerId }
            }));

            // 🧹 CLEANUP: If room is empty, delete from DB
            setTimeout(async () => {
                const currentPeers = await db.getUsernamesInRoom(roomId);
                if (currentPeers.length === 0) {
                    console.log(`🧹 Room ${roomId} is empty. Running Cleanup...`);
                    await db.cleanupRoomIfEmpty(roomId);
                    
                    // Also clear local memory if no users are connected to this POD
                    if (state.peers.size === 0) {
                        roomStates.delete(roomId);
                        console.log(`🗑️ Memory cleared for Room ${roomId}`);
                    }
                }
            }, 2000); // 2 second delay to prevent cleanup during a quick page refresh
        }
    });
});

server.listen(1234, () => console.log("🚀 Server running on port 1234"));