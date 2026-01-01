import { useEffect, useRef } from "react";

export default function VideoCall({ roomId = "room1", pcRef, localVideoRef }) {
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:1234/${roomId}`);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    pcRef.current = pc;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
      });

    pc.ontrack = e => {
      remoteVideoRef.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        ws.send(JSON.stringify({
          type: "webrtc-signal",
          signal: e.candidate
        }));
      }
    };

    ws.onmessage = async e => {
      const { type, signal } = JSON.parse(e.data);
      if (type !== "webrtc-signal") return;

      if (signal.type === "offer") {
        await pc.setRemoteDescription(signal);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "webrtc-signal", signal: answer }));
      } else if (signal.type === "answer") {
        await pc.setRemoteDescription(signal);
      } else if (signal.candidate) {
        await pc.addIceCandidate(signal);
      }
    };

    ws.onopen = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: "webrtc-signal", signal: offer }));
    };

    return () => {
      ws.close();
      pc.close();
    };
  }, [roomId]);

  return (
    <div style={{ display: "flex", gap: 10 }}>
      <video ref={localVideoRef} autoPlay muted playsInline width="200" />
      <video ref={remoteVideoRef} autoPlay playsInline width="400" />
    </div>
  );
}
import { useEffect, useRef, useState } from "react";

export default function VideoGrid({ roomId }) {
  const localVideoRef = useRef(null);
  const wsRef = useRef(null);

  const localStreamRef = useRef(null);
  const peerConnections = useRef(new Map()); // peerId -> RTCPeerConnection
  const [remoteStreams, setRemoteStreams] = useState([]);

  const myId = useRef(crypto.randomUUID());

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:1234/${roomId}`);
    wsRef.current = ws;

    // 🎥 Get camera + mic
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        localStreamRef.current = stream;
        localVideoRef.current.srcObject = stream;
      });

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type !== "webrtc-signal") return;

      const { from, signal } = data;

      let pc = peerConnections.current.get(from);

      if (!pc) {
        pc = createPeer(from);
      }

      if (signal.type === "offer") {
        await pc.setRemoteDescription(signal);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(JSON.stringify({
          type: "webrtc-signal",
          to: from,
          from: myId.current,
          signal: answer
        }));
      }

      if (signal.type === "answer") {
        await pc.setRemoteDescription(signal);
      }

      if (signal.candidate) {
        await pc.addIceCandidate(signal);
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "webrtc-signal",
        join: true,
        from: myId.current
      }));
    };

    return () => ws.close();
  }, [roomId]);

  function createPeer(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peerConnections.current.set(peerId, pc);

    localStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = e => {
      if (e.candidate) {
        wsRef.current.send(JSON.stringify({
          type: "webrtc-signal",
          to: peerId,
          from: myId.current,
          signal: e.candidate
        }));
      }
    };

    pc.ontrack = e => {
      setRemoteStreams(prev => {
        if (prev.find(s => s.id === e.streams[0].id)) return prev;
        return [...prev, e.streams[0]];
      });
    };

    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({
        type: "webrtc-signal",
        to: peerId,
        from: myId.current,
        signal: offer
      }));
    });

    return pc;
  }

  return (
    <div style={gridStyle}>
      <video ref={localVideoRef} autoPlay muted playsInline />
      {remoteStreams.map(stream => (
        <video
          key={stream.id}
          autoPlay
          playsInline
          ref={el => el && (el.srcObject = stream)}
        />
      ))}
    </div>
  );
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "10px",
  width: "100%",
  height: "100%"
};
