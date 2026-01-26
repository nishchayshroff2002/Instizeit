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
  const [activeStream, setActiveStream] = useState(null);

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
        if (data.type === "peers") {
          setPeers(data.peers);
        }
        if (data.type === "peer-left") {
          setPeers(prev => prev.filter(id => id !== data.peerId));
        }
      } catch (e) { }
    };

    return () => {
      isMounted = false;
      if (socket.readyState !== WebSocket.CLOSED) socket.close();
    };
  }, [roomId, username, SERVER_ADDRESS, navigate]);

  const handleLeave = () => {
    // 1. Close WebSocket (Triggers server peer-left broadcast)
    if (wsRef.current) {
      wsRef.current.close();
    }

    // 2. Shut down hardware tracks (Turns off camera light)
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
    }

    // 3. Navigate away
    navigate("/");
  };

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
              onStreamReady={(stream) => setActiveStream(stream)}
            />
          </div>
        </div>

        <div style={controls}>
          <MediaControls localStream={activeStream} onLeave={handleLeave} />
        </div>
      </div>
    );
  } else {
    return (
      <div style={page}>
        <div style={{...content, justifyContent: "center", alignItems: "center"}}>
          <p>Connecting to server...</p>
        </div>
      </div>
    );
  }
}

const page = { height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#1a1a1a", color: "white" };
const content = { flex: 1, display: "flex", overflow: "hidden" };
const left = { width: "50%", borderRight: "1px solid #333" };
const right = { width: "50%", padding: 10, overflowY: "auto" };
const controls = { height: 80, display: "flex", justifyContent: "center", alignItems: "center", borderTop: "1px solid #333", backgroundColor: "#111" };