import { useState } from "react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const SERVER_ADDRESS = import.meta.env.VITE_SERVER_ADDRESS;

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch(`http://${SERVER_ADDRESS}/insert/user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      console.log("Server response:", data);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  return (
    <div style={container}>
      <h2>Login</h2>

      <form onSubmit={handleSubmit} style={form}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={input}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={input}
        />

        <button type="submit" style={button}>
          Login
        </button>
      </form>
    </div>
  );
}
