import Editor from "./Editor";
import VideoGrid from "./VideoCall";
import MediaControls from "./MediaControls";

export default function MeetingLayout({ roomId = "room1" }) {
  return (
    <div style={page}>
      <div style={content}>
        <div style={left}>
          <Editor roomId={roomId} />
        </div>

        <div style={right}>
          <VideoGrid roomId={roomId} />
        </div>
      </div>

      <div style={controls}>
        <MediaControls />
      </div>
    </div>
  );
}

/* ───────── styles ───────── */

const page = {
  height: "100vh",
  display: "flex",
  flexDirection: "column"
};

const content = {
  flex: 1,
  display: "flex"
};

const left = {
  width: "50%",
  borderRight: "1px solid #ccc"
};

const right = {
  width: "50%",
  padding: 10
};

const controls = {
  height: 70,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  borderTop: "1px solid #ccc"
};
