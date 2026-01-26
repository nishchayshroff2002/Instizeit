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
    if (wsRef.current) wsRef.current.close();
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
    }
    navigate("/home");
  };

  if (connection) {
    return (
      <div style={page}>
        <div style={content}>
          {/* LEFT SECTION: 75% of screen for the Doc/Editor */}
          <div style={left}>
            <div style={scrollContainer}>
              <Editor roomId={roomId} ws={wsRef} username={username} />
            </div>
          </div>

          {/* RIGHT SECTION: 25% of screen for Videos */}
          <div style={right}>
            <div style={videoScrollContainer}>
              <VideoGrid 
                roomId={roomId} 
                ws={wsRef} 
                username={username} 
                initialPeers={peers} 
                onStreamReady={(stream) => setActiveStream(stream)}
              />
            </div>
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

/* ───────── Layout Styles ───────── */

const page = { 
  height: "100vh", 
  width: "100vw", 
  display: "flex", 
  flexDirection: "column", 
  backgroundColor: "#1a1a1a", 
  color: "white",
  overflow: "hidden" 
};

const content = { 
  flex: 1, 
  display: "flex", 
  width: "100%", 
  overflow: "hidden" 
};

const left = { 
  width: "75%", // 3/4 of the screen
  borderRight: "1px solid #333", 
  display: "flex", 
  flexDirection: "column",
  backgroundColor: "#fff", // Usually editors look better on white/light
  color: "#000"
};

const right = { 
  width: "25%", // Smaller video block
  display: "flex", 
  flexDirection: "column",
  backgroundColor: "#121212"
};

const scrollContainer = {
  flex: 1,
  overflowY: "auto",
  height: "100%"
};

// Specialized container for videos to stack them vertically if the sidebar is thin
const videoScrollContainer = {
  flex: 1,
  overflowY: "auto",
  padding: "10px",
  display: "flex",
  flexDirection: "column"
};

const controls = { 
  height: "80px", 
  width: "100%", 
  display: "flex", 
  justifyContent: "center", 
  alignItems: "center", 
  borderTop: "1px solid #333", 
  backgroundColor: "#111",
  zIndex: 10
};