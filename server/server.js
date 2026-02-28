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

app.post("/insert/user", async(req, res) => {
  const { username, password } = req.body;
  try {
    const existingPassword = await db.getPassword(username)
    if(existingPassword === password){
      return res.status(200).json({ message: "User already exists" });
    } else if(existingPassword === ""){
       db.insertUser(username, password);
       return res.status(201).json({ message: "User created" });
    } else {
      return res.status(400).json({ message: "Incorrect password" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

const roomStates = new Map();

const getOrCreateRoomState = (roomId) => {
    if (!roomStates.has(roomId)) {
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
    const { roomId, senderId, data } = JSON.parse(message);
    const state = roomStates.get(roomId);
    if (!state) return;

    switch (data.type) {
        case "webrtc-signal":
            if (state.peers.has(data.to)) {
                const target = state.peers.get(data.to);
                if (target.readyState === WebSocket.OPEN) {
                    target.send(JSON.stringify({ ...data, from: senderId }));
                }
            }
            break;

        case "new-peer-alert":
        case "peer-left-alert":
            state.peers.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
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
    let heartbeatInterval = null;

    ws.on("message", async (msg) => {
        const data = JSON.parse(msg.toString());

        if (data.type === "new-client") {
            peerId = data.from;
            const lockKey = `lock:${roomId}:${peerId}`;

            const lockAcquired = await pub.set(lockKey, "active", "NX", "EX", 60);

            if (!lockAcquired) {
                ws.send(JSON.stringify({ type: "already-connected" }));
                peerId = null;
                return;
            }

            heartbeatInterval = setInterval(() => {
                pub.expire(lockKey, 60);
            }, 20000);

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
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            await pub.del(`lock:${roomId}:${peerId}`);

            state.peers.delete(peerId);
            await db.deleteRoomUserMapping(peerId);
            
            pub.publish("ROOM_EVENTS", JSON.stringify({
                roomId, senderId: peerId, data: { type: "peer-left-alert", peerId }
            }));

            setTimeout(async () => {
                const currentPeers = await db.getUsernamesInRoom(roomId);
                if (currentPeers.length === 0) {
                    await db.cleanupRoomIfEmpty(roomId);
                    if (state.peers.size === 0) roomStates.delete(roomId);
                }
            }, 2000);
        }
    });
});

server.listen(1234, () => console.log("🚀 Server active on port 1234 with Atomic Redis Lock"));