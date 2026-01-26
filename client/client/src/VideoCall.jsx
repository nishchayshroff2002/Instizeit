import { useEffect, useRef, useState } from "react";

export default function VideoGrid({ roomId, ws, username, initialPeers, onStreamReady }) {
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const myId = useRef(sessionStorage.getItem("username") || username);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  // 1. React to the peer list
  useEffect(() => {
    if (initialPeers && initialPeers.length > 0) {
      initialPeers.forEach((peerId) => {
        if (peerId !== myId.current && !peerConnections.current.has(peerId)) {
          createPeer(peerId, true); 
        }
      });
    }
  }, [initialPeers]);

  useEffect(() => {
    const socket = ws.current;
    if (!socket) return;

    // 2. Camera Access with Late-Binding
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        
        // Notify Parent (MeetingLayout) that stream is ready
        if (onStreamReady) onStreamReady(stream);

        // Push tracks to any existing connections
        peerConnections.current.forEach((pc, peerId) => {
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          renegotiate(pc, peerId);
        });
      })
      .catch((err) => console.error("Camera error:", err));

    // 3. Handle Signaling
    const handleVideoMessage = async (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.type === "peer-left") {
        const pc = peerConnections.current.get(data.peerId);
        if (pc) pc.close();
        peerConnections.current.delete(data.peerId);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(data.peerId);
          return next;
        });
        return;
      }

      if (data.type === "webrtc-signal") {
        const { from, signal } = data;
        let pc = peerConnections.current.get(from);

        if (!pc) pc = createPeer(from, false);

        if (signal.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          flushCandidates(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.send(JSON.stringify({ type: "webrtc-signal", to: from, from: myId.current, signal: answer }));
        } 
        else if (signal.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          flushCandidates(from, pc);
        } 
        else if (signal.candidate) {
          const candidate = new RTCIceCandidate(signal);
          if (pc.remoteDescription) {
            await pc.addIceCandidate(candidate);
          } else {
            queueCandidate(from, candidate);
          }
        }
      }
    };

    socket.addEventListener("message", handleVideoMessage);
    return () => {
      socket.removeEventListener("message", handleVideoMessage);
      peerConnections.current.forEach(pc => pc.close());
    };
  }, [ws]);

  function renegotiate(pc, peerId) {
    pc.createOffer().then((offer) => {
      pc.setLocalDescription(offer);
      if (ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "webrtc-signal", to: peerId, from: myId.current, signal: offer }));
      }
    });
  }

  function createPeer(peerId, isOfferer) {
    if (peerConnections.current.has(peerId)) return peerConnections.current.get(peerId);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peerConnections.current.set(peerId, pc);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "webrtc-signal", to: peerId, from: myId.current, signal: e.candidate }));
      }
    };

    pc.ontrack = (e) => {
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(peerId, e.streams[0]);
        return next;
      });
    };

    if (isOfferer) renegotiate(pc, peerId);
    return pc;
  }

  function queueCandidate(peerId, candidate) {
    if (!pendingCandidates.current.has(peerId)) pendingCandidates.current.set(peerId, []);
    pendingCandidates.current.get(peerId).push(candidate);
  }

  function flushCandidates(peerId, pc) {
    const list = pendingCandidates.current.get(peerId);
    if (!list) return;
    list.forEach((c) => pc.addIceCandidate(c).catch(e => console.error(e)));
    pendingCandidates.current.delete(peerId);
  }

  return (
    <div style={gridStyle}>
      <div style={tileStyle}>
        <video ref={localVideoRef} autoPlay muted playsInline style={videoStyle} />
        <div style={nameStyle}>{myId.current} (You)</div>
      </div>
      {Array.from(remoteStreams.entries()).map(([pId, stream]) => (
        <RemoteVideoTile key={pId} pId={pId} stream={stream} />
      ))}
    </div>
  );
}

function RemoteVideoTile({ pId, stream }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div style={tileStyle}>
      <video ref={videoRef} autoPlay playsInline style={videoStyle} />
      <div style={nameStyle}>{pId}</div>
    </div>
  );
}

const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "12px", width: "100%" };
const tileStyle = { display: "flex", flexDirection: "column", alignItems: "center" };
const videoStyle = { width: "100%", height: "200px", background: "black", borderRadius: "8px", objectFit: "cover" };
const nameStyle = { marginTop: "6px", fontSize: "12px", color: "#fff", background: "rgba(0,0,0,0.6)", padding: "2px 8px", borderRadius: "4px" };