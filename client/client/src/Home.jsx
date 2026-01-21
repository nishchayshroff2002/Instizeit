import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  function startMeeting() {
    // Create a simple unique room id
    const roomId = crypto.randomUUID();

    // Go to meet link
    navigate(`/meet/${roomId}`);
  }

  return (
    <div style={container}>
      <h1 style={title}>Start a meeting now</h1>

      <button onClick={startMeeting} style={button}>
        Start a Meeting
      </button>
    </div>
  );
}
