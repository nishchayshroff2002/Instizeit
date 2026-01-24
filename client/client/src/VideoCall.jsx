import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function VideoGrid({ roomId }) {
  // ─────────────────────────────
  // Refs
  // ─────────────────────────────
  const localVideoRef = useRef(null);
  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());

  // user identity (from localStorage)
  const myId = useRef(localStorage.getItem("username"));

  // ─────────────────────────────
  // State
  // ─────────────────────────────
  const [remoteStreams, setRemoteStreams] = useState([]);

  const navigate = useNavigate();
  const SERVER_ADDRESS = import.meta.env.VITE_SERVER_ADDRESS;

  // ─────────────────────────────
  // Auth + redirect guard
  // ─────────────────────────────
  useEffect(() => {
    if (!myId.current) {
      localStorage.setItem("redirectUrl", `/meet/${roomId}`);
      navigate("/");
    }
  }, [navigate, roomId]);

  // ─────────────────────────────
  // WebSocket + WebRTC setup
  // ─────────────────────────────
  useEffect(() => {
    if (!myId.current) return;

    const ws = new WebSocket(`ws://${SERVER_ADDRESS}/${roomId}`);
    wsRef.current = ws;

    // Get camera
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        localVideoRef.current.srcObject = stream;
      })
      .catch((err) => console.error("Camera error:", err));

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "webrtc-signal",
          join: true,
          from: myId.current,
        })
      );
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      // existing peers
      if (data.type === "peers") {
        data.peers.forEach((peerId) => {
          waitForStream(() => createPeer(peerId, true));
        });
        return;
      }

      if (data.type !== "webrtc-signal") return;

      const { from, signal } = data;
      let pc = peerConnections.current.get(from);

      if (!pc) {
        await waitForStream(() => {
          pc = createPeer(from, false);
        });
      }

      if (signal.type === "offer") {
        await pc.setRemoteDescription(signal);
        flushCandidates(from, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(
          JSON.stringify({
            type: "webrtc-signal",
            to: from,
            from: myId.current,
            signal: answer,
          })
        );
      }

      if (signal.type === "answer") {
        await pc.setRemoteDescription(signal);
        flushCandidates(from, pc);
      }

      if (signal.candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(signal);
        } else {
          queueCandidate(from, signal);
        }
      }
    };

    return () => ws.close();
  }, [roomId, SERVER_ADDRESS]);

  // ─────────────────────────────
  // Helpers
  // ─────────────────────────────
  function waitForStream(fn) {
    if (localStreamRef.current) return fn();
    setTimeout(() => waitForStream(fn), 100);
  }

  function queueCandidate(peerId, candidate) {
    if (!pendingCandidates.current.has(peerId)) {
      pendingCandidates.current.set(peerId, []);
    }
    pendingCandidates.current.get(peerId).push(candidate);
  }

  function flushCandidates(peerId, pc) {
    const list = pendingCandidates.current.get(peerId);
    if (!list) return;
    list.forEach((c) => pc.addIceCandidate(c));
    pendingCandidates.current.delete(peerId);
  }

  function createPeer(peerId, createOffer) {
    if (peerConnections.current.has(peerId)) {
      return peerConnections.current.get(peerId);
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnections.current.set(peerId, pc);

    localStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsRef.current.send(
          JSON.stringify({
            type: "webrtc-signal",
            to: peerId,
            from: myId.current,
            signal: e.candidate,
          })
        );
      }
    };

    pc.ontrack = (e) => {
      setRemoteStreams((prev) => {
        if (prev.find((s) => s.id === e.streams[0].id)) return prev;
        return [...prev, e.streams[0]];
      });
    };

    if (createOffer) {
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        wsRef.current.send(
          JSON.stringify({
            type: "webrtc-signal",
            to: peerId,
            from: myId.current,
            signal: offer,
          })
        );
      });
    }

    return pc;
  }

  // ─────────────────────────────
  // UI
  // ─────────────────────────────
  return (
    <div style={gridStyle}>
      {/* Local video */}
      <div style={tileStyle}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          style={videoStyle}
        />
        <div style={nameStyle}>{myId.current} (You)</div>
      </div>

      {/* Remote videos */}
      {remoteStreams.map((stream, index) => (
        <div key={stream.id} style={tileStyle}>
          <video
            autoPlay
            playsInline
            style={videoStyle}
            ref={(el) => el && (el.srcObject = stream)}
          />
          <div style={nameStyle}>User {index + 1}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────
// Styles
// ─────────────────────────────
const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "12px",
  width: "100%",
};

const tileStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const videoStyle = {
  width: "100%",
  height: "200px",
  background: "black",
  borderRadius: "8px",
};

const nameStyle = {
  marginTop: "6px",
  fontSize: "14px",
  color: "#fff",
  background: "rgba(0,0,0,0.6)",
  padding: "4px 8px",
  borderRadius: "4px",
};
