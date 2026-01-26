import { useState } from "react";

export default function MediaControls({ localStream, onLeave }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const toggleTrack = (kind) => {
    if (!localStream) return;
    localStream.getTracks()
      .filter(t => t.kind === kind)
      .forEach(t => {
        t.enabled = !t.enabled; // Toggle hardware track
      });

    if (kind === "audio") setIsMuted(!isMuted);
    if (kind === "video") setIsVideoOff(!isVideoOff);
  };

  return (
    <div style={controlsStyle}>
      <button 
        style={{...btnStyle, backgroundColor: isMuted ? "#ff4d4d" : "#fff", color: isMuted ? "#fff" : "#000"}} 
        onClick={() => toggleTrack("audio")}
      >
        {isMuted ? "🔇 Unmute" : "🎤 Mute"}
      </button>

      <button 
        style={{...btnStyle, backgroundColor: isVideoOff ? "#ff4d4d" : "#fff", color: isVideoOff ? "#fff" : "#000"}} 
        onClick={() => toggleTrack("video")}
      >
        {isVideoOff ? "🎥 Start Video" : "📷 Stop Video"}
      </button>

      <button 
        style={{...btnStyle, backgroundColor: "#000", color: "#fff", border: "none"}} 
        onClick={onLeave}
      >
        🚪 Leave Meeting
      </button>
    </div>
  );
}

const controlsStyle = {
  display: "flex",
  gap: "20px",
  alignItems: "center"
};

const btnStyle = {
  padding: "10px 20px",
  cursor: "pointer",
  borderRadius: "8px",
  border: "1px solid #ccc",
  fontWeight: "bold",
  transition: "all 0.2s ease"
};