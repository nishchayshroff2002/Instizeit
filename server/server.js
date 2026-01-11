const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const Y = require("yjs");
const { v4: uuid } = require("uuid");
const db = require("./db");
require("dotenv").config();

db.initDB();

const { encodeStateAsUpdate, applyUpdate } = Y;

// ─────────────────────────────
// Express
// ─────────────────────────────
const app = express();
app.use(express.json());

app.get("/insert/user", (req, res) => {
  const username = req.body.username;
  
});

// ─────────────────────────────
// In-memory stores
// ─────────────────────────────
const docs = new Map();   // room → Y.Doc
const rooms = new Map();  // room → Map<peerId, ws>

function getYDoc(room) {
  if (!docs.has(room)) docs.set(room, new Y.Doc());
  return docs.get(room);
}

function getRoom(room) {
  if (!rooms.has(room)) rooms.set(room, new Map());
  return rooms.get(room);
}

// ─────────────────────────────
// HTTP + WebSocket
// ─────────────────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  const room = req.url.slice(1); // simple & correct for now
  const peerId = uuid();

  const ydoc = getYDoc(room);
  const peers = getRoom(room);
  peers.set(peerId, ws);

  console.log(`✅ ${peerId} joined room ${room}`);

  ws.send(JSON.stringify({
    type: "peers",
    peers: [...peers.keys()].filter(id => id !== peerId)
  }));

  ws.send(JSON.stringify({
    type: "yjs-init",
    update: Array.from(encodeStateAsUpdate(ydoc))
  }));

  ws.on("message", msg => {
    const data = JSON.parse(msg.toString());

    if (data.type === "yjs-update") {
      applyUpdate(ydoc, new Uint8Array(data.update));

      peers.forEach((client, id) => {
        if (id !== peerId && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }

    if (data.type === "webrtc-signal") {
      const target = peers.get(data.to);
      if (target?.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({
          type: "webrtc-signal",
          from: peerId,
          signal: data.signal
        }));
      }
    }
  });

  ws.on("close", () => {
    peers.delete(peerId);

    peers.forEach(client => {
      client.send(JSON.stringify({
        type: "peer-left",
        peerId
      }));
    });

    if (peers.size === 0) {
      rooms.delete(room);
      docs.delete(room);
    }
  });
});

server.listen(1234, () => {
  console.log("🚀 HTTP + WS server running on http://localhost:1234");
});
