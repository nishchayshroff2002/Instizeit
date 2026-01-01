import Editor from "./Editor";
import VideoGrid from "./VideoGrid";

export default function Meeting() {
  return (
    <div style={layout}>
      <div style={left}><Editor /></div>
      <div style={right}><VideoGrid roomId="room1" /></div>
    </div>
  );
}

const layout = {
  display: "flex",
  height: "100vh"
};

const left = {
  width: "50%",
  borderRight: "1px solid #ccc"
};

const right = {
  width: "50%",
  padding: 10
};
