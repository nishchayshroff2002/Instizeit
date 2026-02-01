const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const Y = require("yjs");
const { v4: uuid } = require("uuid");
const db = require("./db");
const cors = require("cors");
require("dotenv").config();

db.initDB();

const { encodeStateAsUpdate, applyUpdate } = Y;

const app = express();
app.use(express.json());
app.use(cors({
  origin: `http://${process.env.CLIENT_ADDRESS}`, 
  credentials: true,
}));

app.post("/insert/user", async(req, res) => {
  const { username, password } = req.body;
  try {
    const exists = await db.checkUser(username, password);
    if (!exists) {
      db.insertUser(username, password);
      return res.status(201).json({ message: "User created" });
    }
    return res.status(200).json({ message: "User already exists" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

const docs = new Map();   
const rooms = new Map();  

function getYDoc(room) {
  if (!docs.has(room)) docs.set(room, new Y.Doc());
  return docs.get(room);
}

function getRoom(room) {
  if (!rooms.has(room)) rooms.set(room, new Map());
  return rooms.get(room);
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  const room = req.url.slice(1);
  const ydoc = getYDoc(room);
  const peers = getRoom(room);
  
  // 1. Define peerId at the connection level so all handlers can see it
  let peerId = null; 

  ws.on("message", msg => {
    const data = JSON.parse(msg.toString());

    if (data.type === "new-client"){
      peerId = data.from; // 2. Assign the value here
      if (peers.has(peerId)) {
        peerId = null;
         ws.send(JSON.stringify({
          type: "already-connected"
         }));
        return;
      }
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
    }

    // 3. Guard: If we haven't received 'new-client' yet, ignore other messages
    if (!peerId) return;

    if (data.type === "yjs-update") {
  // 1. Update the server's copy of the document
    applyUpdate(ydoc, new Uint8Array(data.update));

    // 2. Broadcast to everyone EXCEPT the sender
    peers.forEach((client, id) => {
      // id is the string (username/uuid), client is the socket
      if (id !== peerId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
}

    if (data.type === "webrtc-signal") {
      const target = peers.get(data.to);
      if (target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({
          type: "webrtc-signal",
          from: peerId, // Now peerId is accessible
          signal: data.signal
        }));
      }
    }
  });

  ws.on("close", () => {
    // 4. Ensure we have a peerId before trying to clean up
    if (peerId) {
      peers.delete(peerId);
      console.log(`❌ ${peerId} left room ${room}`);

      peers.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "peer-left",
            peerId: peerId
          }));
        }
      });
    }

    if (peers.size === 0) {
      rooms.delete(room);
      docs.delete(room);
    }
  });
});

server.listen(1234, () => {
  console.log("🚀 HTTP + WS server running on http://localhost:1234");
});