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
        if (data.type === "peers") setPeers(data.peers);
        if (data.type === "peer-left") {
          setPeers((prev) => prev.filter((id) => id !== data.peerId));
        }
      } catch (e) {}
    };

    return () => {
      isMounted = false;
      if (socket.readyState !== WebSocket.CLOSED) socket.close();
    };
  }, [roomId, username, SERVER_ADDRESS, navigate]);

  const handleLeave = () => {
    if (wsRef.current) wsRef.current.close();
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
    }
    navigate("/home");
  };

  if (!connection) {
    return (
      <div style={page}>
        <div style={loaderContainer}>
          <div style={spinner}></div>
          <p style={{ color: "#6c5ce7", fontWeight: "600" }}>Establishing Secure Connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      {/* Background Decor */}
      <div style={blob1}></div>
      <div style={blob2}></div>

      {/* Top Header */}
      <div style={header}>
        <div style={roomBadge}>
          <span style={dot}></span> Room: {roomId.slice(0, 8)}...
        </div>
        <div style={userDisplay}>Logged in as <b>{username}</b></div>
      </div>

      <div style={content}>
        {/* LEFT SECTION: Editor with floating effect */}
        <div style={leftSection}>
          <div style={editorWrapper}>
            <Editor roomId={roomId} ws={wsRef} username={username} />
          </div>
        </div>

        {/* RIGHT SECTION: Video Sidebar */}
        <div style={rightSection}>
          <div style={videoWrapper}>
            <h3 style={sidebarTitle}>Participants</h3>
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
      </div>

      {/* FLOATING CONTROLS */}
      <div style={controlsDock}>
        <MediaControls localStream={activeStream} onLeave={handleLeave} />
      </div>
    </div>
  );
}

/* ───────── Arctic Workspace Styles ───────── */

const page = {
  height: "100vh",
  width: "100vw",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#f0f2f5",
  fontFamily: "'Inter', sans-serif",
  overflow: "hidden",
  position: "relative",
};

const blob1 = {
  position: "absolute",
  width: "600px",
  height: "600px",
  background: "rgba(108, 92, 231, 0.08)",
  filter: "blur(100px)",
  top: "-10%",
  left: "-10%",
  borderRadius: "50%",
};

const blob2 = {
  position: "absolute",
  width: "400px",
  height: "400px",
  background: "rgba(0, 206, 201, 0.08)",
  filter: "blur(80px)",
  bottom: "10%",
  right: "10%",
  borderRadius: "50%",
};

const header = {
  height: "60px",
  padding: "0 25px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  zIndex: 10,
};

const roomBadge = {
  backgroundColor: "rgba(255,255,255,0.7)",
  padding: "6px 14px",
  borderRadius: "100px",
  fontSize: "13px",
  color: "#2d3436",
  fontWeight: "600",
  backdropFilter: "blur(10px)",
  border: "1px solid rgba(255,255,255,0.5)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const dot = { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#00ce4c" };

const userDisplay = { fontSize: "14px", color: "#636e72" };

const content = {
  flex: 1,
  display: "flex",
  padding: "10px 20px 100px 20px", // Bottom padding for floating controls
  gap: "20px",
  zIndex: 1,
  overflow: "hidden",
};

const leftSection = {
  flex: 3, // 75%
  display: "flex",
  flexDirection: "column",
};

const editorWrapper = {
  flex: 1,
  backgroundColor: "#fff",
  borderRadius: "24px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.8)",
};

const rightSection = {
  flex: 1, // 25%
  display: "flex",
  flexDirection: "column",
  maxWidth: "350px",
};

const videoWrapper = {
  flex: 1,
  background: "rgba(255, 255, 255, 0.4)",
  backdropFilter: "blur(20px)",
  borderRadius: "24px",
  border: "1px solid rgba(255,255,255,0.6)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const sidebarTitle = {
  fontSize: "14px",
  textTransform: "uppercase",
  letterSpacing: "1px",
  color: "#6c5ce7",
  padding: "20px",
  margin: 0,
  borderBottom: "1px solid rgba(0,0,0,0.05)",
};

const videoScrollContainer = {
  flex: 1,
  overflowY: "auto",
  padding: "15px",
};

const controlsDock = {
  position: "absolute",
  bottom: "25px",
  left: "50%",
  transform: "translateX(-50%)",
  padding: "10px 30px",
  background: "rgba(45, 52, 54, 0.9)", // Dark glass for controls to pop
  backdropFilter: "blur(15px)",
  borderRadius: "20px",
  boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
  zIndex: 100,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const loaderContainer = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  gap: "20px",
};

const spinner = {
  width: "40px",
  height: "40px",
  border: "4px solid rgba(108, 92, 231, 0.1)",
  borderTop: "4px solid #6c5ce7",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
};

// Add this to your Global CSS or a <style> tag
const styleSheet = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`;