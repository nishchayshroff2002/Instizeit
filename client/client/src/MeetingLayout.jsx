import Editor from "./Editor";
import VideoGrid from "./VideoCall";
import MediaControls from "./MediaControls";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

export default function MeetingLayout() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const username = sessionStorage.getItem("username");
  const wsRef = useRef(null);
  const SERVER_ADDRESS = import.meta.env.VITE_SERVER_ADDRESS;
  
  const [connection, setConnection] = useState(false);
  const [peers, setPeers] = useState([]); 

  useEffect(() => {
    if (!username) {
      const redirectUrl = `/meet/${roomId}`;
      navigate(`/?redirectUrl=${redirectUrl}`);
      return;
    }

    let isMounted = true;
    const socket = new WebSocket(`ws://${SERVER_ADDRESS}/${roomId}`);
    wsRef.current = socket;

    socket.onopen = () => {
      if (isMounted && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "new-client", from: username }));
        setConnection(true);
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Centralized peer list management
        if (data.type === "peers") {
          setPeers(data.peers);
        }
        // Sync peer removal locally for the list
        if (data.type === "peer-left") {
          setPeers(prev => prev.filter(id => id !== data.peerId));
        }
      } catch (e) {
        // Binary Yjs data is ignored here
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket Error:", error);
    };

    return () => {
      isMounted = false;
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    };
  }, [roomId, username, SERVER_ADDRESS, navigate]);

  if (connection) {
    return (
      <div style={page}>
        <div style={content}>
          <div style={left}>
            <Editor roomId={roomId} ws={wsRef} username={username} />
          </div>

          <div style={right}>
            <VideoGrid 
              roomId={roomId} 
              ws={wsRef} 
              username={username} 
              initialPeers={peers} 
            />
          </div>
        </div>

        <div style={controls}>
          <MediaControls />
        </div>
      </div>
    );
  } else {
    return (
      <div style={page}>
        <div style={content}>
          <div style={left}>
            <p>Connecting to server...</p>
          </div>
        </div>
      </div>
    );
  }
}

/* ───────── styles ───────── */
const page = { height: "100vh", display: "flex", flexDirection: "column" };
const content = { flex: 1, display: "flex" };
const left = { width: "50%", borderRight: "1px solid #ccc" };
const right = { width: "50%", padding: 10 };
const controls = { height: 70, display: "flex", justifyContent: "center", alignItems: "center", borderTop: "1px solid #ccc" };