import { useEffect, useRef, useState } from "react";

export default function VideoGrid({ roomId }) {
  const localVideoRef = useRef(null);
  const wsRef = useRef(null);

  const localStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());

  const [remoteStreams, setRemoteStreams] = useState([]);
  const myId = useRef(crypto.randomUUID());
  const SERVER_ADDRESS = import.meta.env.VITE_SERVER_ADDRESS;
  useEffect(() => {
    const ws = new WebSocket(`ws://${SERVER_ADDRESS}/${roomId}`);
    wsRef.current = ws;

    // 🎥 Get camera FIRST
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        localStreamRef.current = stream;
        localVideoRef.current.srcObject = stream;
      })
      .catch(err => console.error("Camera error:", err));

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "webrtc-signal",
        join: true,
        from: myId.current
      }));
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      // Existing peers
      if (data.type === "peers") {
        data.peers.forEach(peerId => {
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

        ws.send(JSON.stringify({
          type: "webrtc-signal",
          to: from,
          from: myId.current,
          signal: answer
        }));
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
  }, [roomId]);

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
    list.forEach(c => pc.addIceCandidate(c));
    pendingCandidates.current.delete(peerId);
  }

  // ─────────────────────────────
  function createPeer(peerId, createOffer) {
    if (peerConnections.current.has(peerId)) {
      return peerConnections.current.get(peerId);
    }

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

    if (createOffer) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        wsRef.current.send(JSON.stringify({
          type: "webrtc-signal",
          to: peerId,
          from: myId.current,
          signal: offer
        }));
      });
    }

    return pc;
  }

  return (
    <div style={gridStyle}>
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        style={videoStyle}
      />

      {remoteStreams.map(stream => (
        <video
          key={stream.id}
          autoPlay
          playsInline
          style={videoStyle}
          ref={el => el && (el.srcObject = stream)}
        />
      ))}
    </div>
  );
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "10px",
  width: "100%",
  height: "100%"
};

const videoStyle = {
  width: "100%",
  height: "200px",
  background: "black",
  borderRadius: "8px"
};
