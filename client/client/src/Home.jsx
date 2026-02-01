import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  function startMeeting() {
    const roomId = crypto.randomUUID();
    navigate(`/meet/${roomId}`);
  }

  return (
    <div style={containerStyle}>
      {/* Soft gradient blobs for a "Cloud" feel */}
      <div style={blob1}></div>
      <div style={blob2}></div>
      
      <div style={glassCardStyle}>
        <div style={iconCircle}>
          <span style={{ fontSize: "32px" }}>💠</span>
        </div>
        
        <h1 style={titleStyle}>
          Collaborate <span style={highlightText}>Effortlessly</span>
        </h1>
        
        <p style={descriptionStyle}>
          A high-performance workspace for teams who value clarity.
        </p>

        <button 
          onClick={startMeeting} 
          style={primaryBtn}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = "#2d3436";
            e.target.style.transform = "scale(1.02)";
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = "#000";
            e.target.style.transform = "scale(1)";
          }}
        >
          Start New Meeting
        </button>
      </div>
    </div>
  );
}

/* ───────── Arctic Glass Styles ───────── */

const containerStyle = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100vh",
  width: "100vw",
  backgroundColor: "#f0f2f5", 
  fontFamily: "'Inter', system-ui, sans-serif",
  position: "relative",
  overflow: "hidden",
};

const blob1 = {
  position: "absolute",
  width: "500px",
  height: "500px",
  background: "rgba(108, 92, 231, 0.15)",
  filter: "blur(100px)",
  top: "-10%",
  right: "10%",
  borderRadius: "50%",
};

const blob2 = {
  position: "absolute",
  width: "400px",
  height: "400px",
  background: "rgba(0, 206, 201, 0.1)",
  filter: "blur(80px)",
  bottom: "5%",
  left: "5%",
  borderRadius: "50%",
};

const glassCardStyle = {
  position: "relative",
  zIndex: 1,
  background: "rgba(255, 255, 255, 0.7)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.8)",
  padding: "50px 40px",
  borderRadius: "32px",
  width: "90%",
  maxWidth: "460px",
  textAlign: "center",
  boxShadow: "0 20px 40px rgba(0,0,0,0.04)",
};

const iconCircle = {
  width: "70px",
  height: "70px",
  backgroundColor: "#fff",
  borderRadius: "20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0 auto 25px",
  boxShadow: "0 8px 16px rgba(0,0,0,0.05)",
};

const titleStyle = {
  fontSize: "36px",
  color: "#2d3436",
  margin: "0 0 15px 0",
  fontWeight: "800",
  letterSpacing: "-1px",
};

const highlightText = {
  color: "#6c5ce7",
};

const descriptionStyle = {
  fontSize: "16px",
  color: "#636e72",
  lineHeight: "1.6",
  marginBottom: "35px",
};

const primaryBtn = {
  backgroundColor: "#000",
  color: "#fff",
  border: "none",
  padding: "18px 40px",
  borderRadius: "16px",
  fontSize: "17px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.3s ease",
  width: "100%",
};

const infoRow = {
  display: "flex",
  justifyContent: "center",
  gap: "12px",
  marginTop: "30px",
};

const pill = {
  fontSize: "12px",
  color: "#b2bec3",
  padding: "4px 12px",
  borderRadius: "100px",
  border: "1px solid #dfe6e9",
  fontWeight: "500",
};