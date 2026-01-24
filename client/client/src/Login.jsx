import { useState } from "react";
import { useNavigate } from "react-router-dom";
export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const SERVER_ADDRESS = import.meta.env.VITE_SERVER_ADDRESS;

  const handleSubmit = async (e) => {
    e.preventDefault();
    localStorage.setItem("username", username);
    const res = await fetch(`http://${SERVER_ADDRESS}/insert/user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    console.log(data);
    if(localStorage.getItem("redirectUrl")){
      navigate(localStorage.getItem("redirectUrl"))
    }
    else{
      navigate("/home")
    }
  };

  return (
    <div>
      <h2>Login</h2>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">Login</button>
      </form>
    </div>
  );
}
