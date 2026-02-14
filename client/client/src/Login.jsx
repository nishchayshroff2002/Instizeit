import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({ message: "", type: "" }); // types: 'success', 'error', 'neutral'
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const SERVER_ADDRESS = import.meta.env.VITE_SERVER_ADDRESS;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ message: "Verifying credentials...", type: "neutral" });

    try {
      const res = await fetch(`http://${SERVER_ADDRESS}/insert/user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.status === 200) {
        // User exists and password is correct
        setStatus({ message: "Welcome back, user.", type: "success" });
        sessionStorage.setItem("username", username);
        setTimeout(() => {
          const redirectUrl = searchParams.get('redirectUrl');
          navigate(redirectUrl || "/home");
        }, 1200);
      } 
      else if (res.status === 201) {
        // New user created
        setStatus({ message: "New user initialized. Welcome.", type: "success" });
        sessionStorage.setItem("username", username);
        setTimeout(() => {
          const redirectUrl = searchParams.get('redirectUrl');
          navigate(redirectUrl || "/home");
        }, 1200);
      } 
      else if (res.status === 400) {
        // User exists but password was wrong
        setStatus({ message: "Access Denied: Incorrect password.", type: "error" });
      } else {
        setStatus({ message: data.message || "Authentication failed.", type: "error" });
      }
    } catch (err) {
      console.error("Login error:", err);
      setStatus({ message: "Connection lost. Is the server running?", type: "error" });
    }
  };

  return (
    <div style={containerStyle}>
      {/* Background Blobs */}
      <div style={blob1}></div>
      <div style={blob2}></div>
      
      <div style={glassCardStyle}>
        {/* Brand Header */}
        <div style={brandContainer}>
          <h1 style={brandName}>Insteiziet</h1>
          <div style={brandUnderline}></div>
        </div>

        <div style={{ textAlign: "left", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, color: "#2d3436", fontSize: "24px", fontWeight: "700" }}>Sign In</h2>
          <p style={{ color: "#636e72", fontSize: "14px", marginTop: "4px" }}>Access the collaborative terminal</p>
        </div>

        {/* Status Prompt */}
        {status.message && (
          <div style={{
            ...statusBox,
            backgroundColor: status.type === "error" ? "#fff5f5" : (status.type === "success" ? "#f0fff4" : "#f0f2f5"),
            color: status.type === "error" ? "#e53e3e" : (status.type === "success" ? "#2f855a" : "#6c5ce7"),
            border: `1px solid ${status.type === "error" ? "#feb2b2" : (status.type === "success" ? "#c6f6d5" : "#dfe6e9")}`
          }}>
            {status.message}
          </div>
        )}

        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={inputGroup}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              placeholder="operator_name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={inputGroup}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <button 
            type="submit" 
            style={buttonStyle}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#5b4bc4")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#6c5ce7")}
          >
            Authenticate
          </button>
        </form>
      </div>
    </div>
  );
}

/* ───────── Styles ───────── */

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

const brandContainer = {
  textAlign: "center",
  marginBottom: "30px",
};

const brandName = {
  fontSize: "32px",
  fontWeight: "900",
  color: "#6c5ce7",
  margin: 0,
  letterSpacing: "-1.5px",
  textTransform: "lowercase",
};

const brandUnderline = {
  width: "24px",
  height: "4px",
  backgroundColor: "#00ce4c",
  margin: "4px auto 0",
  borderRadius: "2px",
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
  zIndex: 0,
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
  zIndex: 0,
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
  boxShadow: "0 20px 40px rgba(0,0,0,0.04)",
};

const statusBox = {
  padding: "12px",
  borderRadius: "12px",
  fontSize: "13px",
  fontWeight: "600",
  marginBottom: "20px",
  textAlign: "center",
  transition: "all 0.3s ease",
};

const formStyle = { display: "flex", flexDirection: "column", gap: "20px" };
const inputGroup = { textAlign: "left" };
const labelStyle = { 
  fontSize: "11px", fontWeight: "700", color: "#6c5ce7", 
  marginBottom: "8px", display: "block", textTransform: "uppercase", letterSpacing: "1px" 
};

const inputStyle = {
  width: "100%", padding: "14px", borderRadius: "12px", border: "1px solid #dfe6e9",
  backgroundColor: "rgba(255,255,255,0.8)", outline: "none", fontSize: "15px", boxSizing: "border-box"
};

const buttonStyle = {
  backgroundColor: "#6c5ce7", color: "#fff", border: "none", padding: "16px",
  borderRadius: "12px", fontSize: "16px", fontWeight: "600", cursor: "pointer", 
  marginTop: "10px", transition: "all 0.3s ease"
};