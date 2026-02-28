import Workspace from "./Workspace"; 
import VideoGrid from "./VideoCall";
import MediaControls from "./MediaControls";
import AlreadyInRoom from "./AlreadyInRoom";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

/* ───────── STYLES ───────── */
const page = { height: "100vh", width: "100vw", display: "flex", flexDirection: "column", backgroundColor: "#f0f2f5", fontFamily: "'Inter', sans-serif", overflow: "hidden", position: "relative" };
const blob1 = { position: "absolute", width: "600px", height: "600px", background: "rgba(108, 92, 231, 0.08)", filter: "blur(100px)", top: "-10%", left: "-10%", borderRadius: "50%" };
const blob2 = { position: "absolute", width: "400px", height: "400px", background: "rgba(0, 206, 201, 0.08)", filter: "blur(80px)", bottom: "10%", right: "10%", borderRadius: "50%" };
const header = { height: "60px", padding: "0 25px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10, flexShrink: 0 };
const roomBadge = { backgroundColor: "rgba(255,255,255,0.7)", padding: "6px 14px", borderRadius: "100px", fontSize: "13px", color: "#2d3436", fontWeight: "600", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: "8px" };
const dot = { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#00ce4c" };
const userDisplay = { fontSize: "14px", color: "#636e72" };
const content = { flex: 1, display: "flex", padding: "10px 20px 100px 20px", gap: "20px", zIndex: 1, overflow: "hidden", height: "calc(100vh - 160px)" };
const leftSection = { flex: 3, display: "flex", flexDirection: "column", height: "100%" };
const editorWrapper = { flex: 1, backgroundColor: "#fff", borderRadius: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.04)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.8)", display: "flex" };
const rightSection = { flex: 1, display: "flex", flexDirection: "column", maxWidth: "400px", minWidth: "300px", height: "100%" };
const videoWrapper = { flex: 1, background: "rgba(255, 255, 255, 0.4)", backdropFilter: "blur(20px)", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.6)", display: "flex", flexDirection: "column", overflow: "hidden" };
const sidebarTitle = { fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", color: "#6c5ce7", padding: "20px", margin: 0, borderBottom: "1px solid rgba(0,0,0,0.05)" };
const videoScrollContainer = { flex: 1, overflowY: "auto", padding: "15px" };
const controlsDock = { position: "absolute", bottom: "25px", left: "50%", transform: "translateX(-50%)", padding: "10px 30px", background: "rgba(45, 52, 54, 0.9)", backdropFilter: "blur(15px)", borderRadius: "20px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center" };
const styleSheet = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .video-container video { width: 100%; border-radius: 12px; background: #2d3436; margin-bottom: 10px; }`;

export default function MeetingLayout() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const username = sessionStorage.getItem("username");
  const wsRef = useRef(null);
  const SERVER_ADDRESS = import.meta.env.VITE_SERVER_ADDRESS;

  const [connection, setConnection] = useState(false);
  const [isAlreadyConnected, setIsAlreadyConnected] = useState(false);
  const [peers, setPeers] = useState([]);
  const [activeStream, setActiveStream] = useState(null);

  useEffect(() => {
    if (!username) {
      navigate(`/?redirectUrl=/meet/${roomId}`);
      return;
    }

    let isClosedByCleanup = false; 
    const socket = new WebSocket(`ws://${SERVER_ADDRESS}/${roomId}`);
    wsRef.current = socket;

    socket.onopen = () => {
      if (!isClosedByCleanup && socket.readyState === WebSocket.OPEN) {
        console.log("WebSocket connected. Sending new-client...");
        socket.send(JSON.stringify({ type: "new-client", from: username }));
        setConnection(true);
      }
    };

    socket.onmessage = (event) => {
      if (isClosedByCleanup) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "already-connected") {
          setIsAlreadyConnected(true);
          socket.close();
        }
        if (data.type === "peers") setPeers(data.peers);
        if (data.type === "new-peer-alert") {
          setPeers(prev => [...new Set([...prev, data.peerId])]);
        }
        if (data.type === "peer-left-alert") {
          setPeers(prev => prev.filter(id => id !== data.peerId));
        }
      } catch (e) {
        console.error("WS Message Error:", e);
      }
    };

    socket.onerror = (err) => {
      if (!isClosedByCleanup) console.error("WS Socket Error:", err);
    };

    return () => {
      isClosedByCleanup = true;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [roomId, username, SERVER_ADDRESS, navigate]);

  const handleLeave = () => {
    if (wsRef.current) wsRef.current.close();
    if (activeStream) activeStream.getTracks().forEach(track => track.stop());
    navigate("/home");
  };

  if (isAlreadyConnected) return <AlreadyInRoom />;
  if (!connection) return <div style={page}><div style={{margin: "auto"}}>Connecting...</div></div>;

  return (
    <div style={page}>
      <style>{styleSheet}</style>
      <div style={blob1}></div>
      <div style={blob2}></div>
      <div style={header}>
        <div style={roomBadge}><span style={dot}></span> Room: {roomId.slice(0, 8)}...</div>
        <div style={userDisplay}>Logged in as <b>{username}</b></div>
      </div>

      <div style={content}>
        <div style={leftSection}>
          <div style={editorWrapper}>
            <Workspace roomId={roomId} ws={wsRef} />
          </div>
        </div>

        <div style={rightSection}>
          <div style={videoWrapper}>
            <h3 style={sidebarTitle}>Participants</h3>
            <div style={videoScrollContainer} className="video-container">
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

      <div style={controlsDock}>
        <MediaControls localStream={activeStream} onLeave={handleLeave} />
      </div>
    </div>
  );
}