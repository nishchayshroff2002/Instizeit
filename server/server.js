const http = require("http");
const WebSocket = require("ws");
const Y = require("yjs");
const { v4: uuid } = require("uuid");

const { encodeStateAsUpdate, applyUpdate } = Y;

// ─────────────────────────────────────────
// In-memory stores
// ─────────────────────────────────────────
const docs = new Map();          // room → Y.Doc
const rooms = new Map();         // room → Map<peerId, ws>

// ─────────────────────────────────────────
function getYDoc(room) {
  if (!docs.has(room)) docs.set(room, new Y.Doc());
  return docs.get(room);
}

function getRoom(room) {
  if (!rooms.has(room)) rooms.set(room, new Map());
  return rooms.get(room);
}

// ─────────────────────────────────────────
const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  const room = new URL(req.url, "http://localhost").pathname.slice(1);
  const peerId = uuid();

  const ydoc = getYDoc(room);
  const peers = getRoom(room);

  peers.set(peerId, ws);

  console.log(`✅ ${peerId} joined room ${room}`);

  // Send peerId to client
  ws.send(JSON.stringify({
    type: "peer-id",
    peerId
  }));

  // Send existing peers to new user
  ws.send(JSON.stringify({
    type: "peers",
    peers: [...peers.keys()].filter(id => id !== peerId)
  }));

  // Send Yjs state
  ws.send(JSON.stringify({
    type: "yjs-init",
    update: Array.from(encodeStateAsUpdate(ydoc))
  }));

  // Notify others that a new peer joined
  peers.forEach((client, id) => {
    if (id !== peerId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "peer-joined",
        peerId
      }));
    }
  });

  ws.on("message", msg => {
    const data = JSON.parse(msg.toString());

    // ───── YJS
    if (data.type === "yjs-update") {
      applyUpdate(ydoc, new Uint8Array(data.update));

      peers.forEach((client, id) => {
        if (id !== peerId && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }

    // ───── WEBRTC SIGNALING
    if (data.type === "webrtc-signal") {
      const target = peers.get(data.to);
      if (target && target.readyState === WebSocket.OPEN) {
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
    console.log(`❌ ${peerId} left room ${room}`);

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
  console.log("🚀 Server running at ws://localhost:1234");
});
