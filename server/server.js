const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const Y = require("yjs");
const db = require("./db");
const cors = require("cors");
const Redis = require("ioredis");
require("dotenv").config();

db.initDB();

// --- Redis Setup ---
const pub = new Redis(process.env.REDIS_URL);
const sub = new Redis(process.env.REDIS_URL);

const DB_READ_INTERVAL_MS = 700;
const DB_UPDATE_INTERVAL_MS = 1000;
const MAX_SAVE_RETRIES = 3;
const JITTER_RANGE_MS = 1000;

const app = express();
app.use(express.json());
app.use(cors({ origin: `http://${process.env.CLIENT_ADDRESS}`, credentials: true }));

const roomStates = new Map();

const getOrCreateRoomState = (roomId) => {
    if (!roomStates.has(roomId)) {
        roomStates.set(roomId, {
            doc: new Y.Doc(),
            version: 0,
            readTimestamp: Date.now(),
            updateTimestamp: Date.now(),
            peers: new Map() // username -> socket
        });
    }
    return roomStates.get(roomId);
};

// --- GLOBAL REDIS LISTENER ---
sub.subscribe("ROOM_EVENTS");
sub.on("message", (channel, message) => {
    const { roomId, senderId, data } = JSON.parse(message);
    const state = roomStates.get(roomId);
    if (!state) return;

    switch (data.type) {
        case "presence-check":
            // Respond if the user is on THIS pod
            if (state.peers.has(data.username)) {
                pub.publish("ROOM_EVENTS", JSON.stringify({
                    roomId, senderId: "system", data: { type: "presence-ack", username: data.username }
                }));
            }
            break;

        case "webrtc-signal":
            const target = state.peers.get(data.to);
            if (target && target.readyState === WebSocket.OPEN) {
                target.send(JSON.stringify({ ...data, from: senderId }));
            }
            break;

        case "new-peer-alert":
        case "peer-left-alert":
            state.peers.forEach((ws, id) => {
                if (id !== senderId && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(data));
                }
            });
            break;
    }
});

async function updateToDbWithRetry(roomId, ydoc, version) {
    for (let attempt = 1; attempt <= MAX_SAVE_RETRIES; attempt++) {
        try {
            await db.updateRoom(ydoc, version, roomId);
            return;
        } catch (err) {
            if (attempt === MAX_SAVE_RETRIES) return;
            const delay = Math.random() * JITTER_RANGE_MS;
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", async (ws, req) => {
    const roomId = req.url.slice(1);
    const state = getOrCreateRoomState(roomId);
    
    try {
        const exists = await db.checkRoom(roomId);
        if (!exists) await db.insertRoom(roomId, state.doc, state.version);
    } catch (e) { console.error("Room init error", e); }

    let peerId = null;

    ws.on("message", async (msg) => {
        const data = JSON.parse(msg.toString());

        if (data.type === "new-client") {
            peerId = data.from;

            // 1. Check DB for existing mapping
            const dbPeers = await db.getUsernamesInRoom(roomId);
            
            if (dbPeers.includes(peerId)) {
                // 2. Redis Ping Test to verify if user is alive on another pod
                let isAliveElsewhere = false;
                const verify = (chan, m) => {
                    const r = JSON.parse(m);
                    if (r.data.type === "presence-ack" && r.data.username === peerId) isAliveElsewhere = true;
                };
                sub.on("message", verify);
                pub.publish("ROOM_EVENTS", JSON.stringify({ roomId, data: { type: "presence-check", username: peerId } }));

                await new Promise(res => setTimeout(res, 450)); // Timeout for cross-pod response
                sub.off("message", verify);

                if (isAliveElsewhere) {
                    ws.send(JSON.stringify({ type: "already-connected" }));
                    peerId = null;
                    return;
                }
            }

            // 3. Setup user state
            state.peers.set(peerId, ws);
            await db.insertRoomUserMapping(roomId, peerId);
            
            pub.publish("ROOM_EVENTS", JSON.stringify({
                roomId, senderId: peerId, data: { type: "new-peer-alert", peerId }
            }));

            ws.send(JSON.stringify({
                type: "peers",
                peers: (await db.getUsernamesInRoom(roomId)).filter(id => id !== peerId)
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
                if (id !== peerId && client.readyState === WebSocket.OPEN) {
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
            pub.publish("ROOM_EVENTS", JSON.stringify({
                roomId, senderId: peerId, data: data
            }));
        }
    });

    ws.on("close", async () => {
        if (peerId) {
            state.peers.delete(peerId);
            await db.deleteRoomUserMapping(peerId);
            
            pub.publish("ROOM_EVENTS", JSON.stringify({
                roomId, senderId: peerId, data: { type: "peer-left-alert", peerId }
            }));

            // Final Cleanup: If this was the last user globally, delete room from DB
            setTimeout(async () => {
                const currentPeers = await db.getUsernamesInRoom(roomId);
                if (currentPeers.length === 0) {
                    await db.cleanupRoomIfEmpty(roomId);
                    if (state.peers.size === 0) roomStates.delete(roomId);
                    console.log(`🧹 Cleaned up empty room: ${roomId}`);
                }
            }, 2000); // 2s buffer for refreshes/reconnects
        }
    });
});

server.listen(1234, () => console.log("🚀 Server active on port 1234 with Redis/Postgres Sync"));