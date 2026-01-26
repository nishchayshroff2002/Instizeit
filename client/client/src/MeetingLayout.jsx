import Editor from "./Editor";
import VideoGrid from "./VideoCall";
import MediaControls from "./MediaControls";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

export default function MeetingLayout() {
  const { roomId } = useParams(); // 👈 comes from URL
  const navigate = useNavigate();
  const username = sessionStorage.getItem("username");
  const wsRef = useRef(null);
  const SERVER_ADDRESS = import.meta.env.VITE_SERVER_ADDRESS;
  const [connection, setConnection] = useState(false);
  useEffect(() => {
  if (!username) {
    const redirectUrl =`/meet/${roomId}`;
    navigate(`/?redirectUrl=${redirectUrl}`);
    return;
  }

  let isMounted = true;
  // Use a local variable to track if we should actually initiate
  const socket = new WebSocket(`ws://${SERVER_ADDRESS}/${roomId}`);
  wsRef.current = socket;

  socket.onopen = () => {
    // Only proceed if the component is still actually mounted
    if (isMounted && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "new-client", from: username }));
      setConnection(true);
    } else {
      socket.close();
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket Error:", error);
  };

  return () => {
    isMounted = false;
    // Only close if it's actually open or connecting
    // This reduces the "Closed before established" noise in the console
    if (socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
  };
}, [roomId, username, SERVER_ADDRESS]); // Remove 'navigate' to reduce re-runs
  // Render Logic
  if (connection) {
    return (
      <div style={page}>
        <div style={content}>
          <div style={left}>
            <Editor roomId={roomId} ws={wsRef}  />
          </div>

          <div style={right}>
            {/* Fixed typo: changed wsref to wsRef */}
            <VideoGrid roomId={roomId} ws={wsRef} username={username} />
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
            <p>Connecting to ws...</p>
          </div>
        </div>
      </div>
    );
  }
}

/* ───────── styles ───────── */

const page = {
  height: "100vh",
  display: "flex",
  flexDirection: "column",
};

const content = {
  flex: 1,
  display: "flex",
};

const left = {
  width: "50%",
  borderRight: "1px solid #ccc",
};

const right = {
  width: "50%",
  padding: 10,
};

const controls = {
  height: 70,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  borderTop: "1px solid #ccc",
};