import { useNavigate, useParams } from "react-router-dom";

export default function AlreadyInRoom() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const username = sessionStorage.getItem("username") || "User";

  return (
    <div style={containerStyle}>
      {/* Background Blobs */}
      <div style={blob1}></div>
      <div style={blob2}></div>
      
      <div style={glassCardStyle}>
        {/* Brand Header */}
        <div style={brandContainer}>
          <h1 style={brandName}>insteiziet</h1>
          <div style={brandUnderline}></div>
        </div>

        <div style={statusSection}>
          <div style={avatarContainer}>
            <div style={pulseCircle}></div>
            <span style={{ fontSize: "40px", zIndex: 2 }}>👤</span>
          </div>
          
          <h2 style={titleStyle}>Already Connected</h2>
          <p style={descriptionStyle}>
            Hey <b>{username}</b>, it looks like you are already active in room:
            <br />
            <span style={roomHighlight}>{roomId?.slice(0, 8)}...</span>
          </p>
        </div>

        <div style={buttonGroup}>
          <button 
            onClick={() => navigate(`/home`)} 
            style={primaryBtn}
            onMouseOver={(e) => e.target.style.backgroundColor = "#5b4bc4"}
            onMouseOut={(e) => e.target.style.backgroundColor = "#6c5ce7"}
          >
            Go to Home Page
          </button>
    
        </div>
      </div>

      <style>{pulseAnimation}</style>
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
  margin: 0,
};

const brandContainer = { textAlign: "center", marginBottom: "30px" };
const brandName = {
  fontSize: "28px", fontWeight: "900", color: "#6c5ce7", 
  margin: 0, letterSpacing: "-1.5px", textTransform: "lowercase"
};
const brandUnderline = {
  width: "20px", height: "4px", backgroundColor: "#00ce4c", 
  margin: "4px auto 0", borderRadius: "2px"
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
  maxWidth: "400px",
  textAlign: "center",
  boxShadow: "0 20px 40px rgba(0,0,0,0.04)",
};

const statusSection = { marginBottom: "35px" };

const avatarContainer = {
  position: "relative",
  width: "80px",
  height: "80px",
  margin: "0 auto 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#fff",
  borderRadius: "24px",
  boxShadow: "0 10px 20px rgba(0,0,0,0.05)",
};

const pulseCircle = {
  position: "absolute",
  width: "100%",
  height: "100%",
  borderRadius: "24px",
  backgroundColor: "rgba(0, 206, 76, 0.2)",
  animation: "pulse 2s infinite",
};

const titleStyle = { fontSize: "22px", color: "#2d3436", fontWeight: "700", margin: "0 0 10px 0" };
const descriptionStyle = { fontSize: "15px", color: "#636e72", lineHeight: "1.5", margin: 0 };
const roomHighlight = { color: "#6c5ce7", fontWeight: "600", fontSize: "13px" };

const buttonGroup = { display: "flex", flexDirection: "column", gap: "12px" };

const primaryBtn = {
  backgroundColor: "#6c5ce7", color: "#fff", border: "none", padding: "16px",
  borderRadius: "14px", fontSize: "16px", fontWeight: "600", cursor: "pointer", transition: "all 0.3s ease"
};

const blob1 = {
  position: "absolute", width: "500px", height: "500px", background: "rgba(108, 92, 231, 0.12)",
  filter: "blur(100px)", top: "-10%", right: "10%", borderRadius: "50%", zIndex: 0
};

const blob2 = {
  position: "absolute", width: "400px", height: "400px", background: "rgba(0, 206, 201, 0.08)",
  filter: "blur(80px)", bottom: "5%", left: "5%", borderRadius: "50%", zIndex: 0
};

const pulseAnimation = `
@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  70% { transform: scale(1.15); opacity: 0; }
  100% { transform: scale(0.95); opacity: 0; }
}`;