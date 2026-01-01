// server/server.js
const http = require("http");
const WebSocket = require("ws");
const Y = require("yjs");

const { encodeStateAsUpdate, applyUpdate } = Y;

// ─────────────────────────────────────────
// In-memory stores
// ─────────────────────────────────────────
const docs = new Map();      // room → Y.Doc
const rooms = new Map();     // room → Set<ws>

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function getYDoc(room) {
  if (!docs.has(room)) {
    docs.set(room, new Y.Doc());
  }
  return docs.get(room);
}

function getRoom(room) {
  if (!rooms.has(room)) {
    rooms.set(room, new Set());
  }
  return rooms.get(room);
}

// ─────────────────────────────────────────
// HTTP + WebSocket Server
// ─────────────────────────────────────────
const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  const room = new URL(req.url, "http://localhost").pathname.slice(1);

  const ydoc = getYDoc(room);
  const clients = getRoom(room);
  clients.add(ws);

  console.log(`✅ Client joined room: ${room}`);

  // ───── Send initial Yjs document state
  ws.send(JSON.stringify({
    type: "yjs-init",
    update: Array.from(encodeStateAsUpdate(ydoc))
  }));

  // ─────────────────────────────────────
  // Handle incoming messages
  // ─────────────────────────────────────
  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    // ───── YJS DOCUMENT UPDATE
    if (data.type === "yjs-update") {
      const update = new Uint8Array(data.update);
      applyUpdate(ydoc, update);

      // Broadcast to others in room
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "yjs-update",
            update: data.update
          }));
        }
      });
    }

    // ───── WEBRTC SIGNALING
    if (data.type === "webrtc-signal") {
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "webrtc-signal",
            signal: data.signal
          }));
        }
      });
    }
  });

  // ─────────────────────────────────────
  // Cleanup on disconnect
  // ─────────────────────────────────────
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`❌ Client left room: ${room}`);

    if (clients.size === 0) {
      rooms.delete(room);
      docs.delete(room);
      console.log(`🧹 Room ${room} destroyed`);
    }
  });
});

server.listen(1234, () => {
  console.log("🚀 Server running at ws://localhost:1234");
});
