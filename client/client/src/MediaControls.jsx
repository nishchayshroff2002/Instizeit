export default function MediaControls({ localStream }) {
  const toggleTrack = (kind) => {
    localStream.getTracks()
      .filter(t => t.kind === kind)
      .forEach(t => t.enabled = !t.enabled);
  };

  return (
    <div style={controlsStyle}>
      <button onClick={() => toggleTrack("audio")}>🎤</button>
      <button onClick={() => toggleTrack("video")}>📷</button>
      <button onClick={() => window.location.reload()}>🚪 Leave</button>
    </div>
  );
}

const controlsStyle = {
  position: "fixed",
  bottom: 20,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 20
};
