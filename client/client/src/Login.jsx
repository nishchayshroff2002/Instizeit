import { useState } from "react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    // For now, just log values
    console.log("Username:", username);
    console.log("Password:", password);

    // Later you will send this to backend
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
