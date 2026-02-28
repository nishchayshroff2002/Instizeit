import { useEffect, useRef, useState } from "react";

export default function VideoGrid({ roomId, ws, username, initialPeers, onStreamReady }) {
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const myId = useRef(sessionStorage.getItem("username") || username);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  // Track negotiation state to prevent collisions
  const makingOffer = useRef(new Map());

  // 1. Initial Peer Setup
  useEffect(() => {
    if (initialPeers && initialPeers.length > 0) {
      initialPeers.forEach((peerId) => {
        if (peerId !== myId.current && !peerConnections.current.has(peerId)) {
          // Tie-breaker: lexicographical comparison
          const isOfferer = myId.current.localeCompare(peerId) < 0;
          createPeer(peerId, isOfferer);
        }
      });
    }
  }, [initialPeers]);

  // 2. Media Stream and Signaling
  useEffect(() => {
    const socket = ws.current;
    if (!socket) return;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        if (onStreamReady) onStreamReady(stream);

        // Add tracks to all existing peer connections
        peerConnections.current.forEach((pc) => {
          const senders = pc.getSenders().map((s) => s.track);
          stream.getTracks().forEach((track) => {
            if (!senders.includes(track)) pc.addTrack(track, stream);
          });
        });
      })
      .catch((err) => console.error("Camera error:", err));

    const handleVideoMessage = async (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.type === "peer-left" || data.type === "peer-left-alert") {
        const idToRemove = data.peerId;
        cleanupPeer(idToRemove);
        return;
      }

      if (data.type === "webrtc-signal") {
        const { from, signal } = data;
        let pc = peerConnections.current.get(from);
        
        // If unknown peer, create as "impolite" (receiver side)
        if (!pc) {
          const isOfferer = myId.current.localeCompare(from) < 0;
          pc = createPeer(from, isOfferer);
        }

        try {
          if (signal.type === "offer") {
            // PERFECT NEGOTIATION: Handle offer collisions
            const isOfferer = myId.current.localeCompare(from) < 0;
            const collision = makingOffer.current.get(from) || pc.signalingState !== "stable";

            // If we are the "impolite" peer and there's a collision, we ignore the incoming offer
            if (collision && !isOfferer) {
              return; 
            }

            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.send(JSON.stringify({ type: "webrtc-signal", to: from, from: myId.current, signal: pc.localDescription }));
            
            flushCandidates(from, pc);
          } else if (signal.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            flushCandidates(from, pc);
          } else if (signal.candidate) {
            const candidate = new RTCIceCandidate(signal);
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(candidate).catch(e => {});
            } else {
              queueCandidate(from, candidate);
            }
          }
        } catch (err) {
          console.error("Signaling error:", err);
        }
      }
    };

    socket.addEventListener("message", handleVideoMessage);
    return () => socket.removeEventListener("message", handleVideoMessage);
  }, [ws]);

  function createPeer(peerId, isOfferer) {
    if (peerConnections.current.has(peerId)) return peerConnections.current.get(peerId);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peerConnections.current.set(peerId, pc);
    makingOffer.current.set(peerId, false);

    // Triggered automatically when tracks are added
    pc.onnegotiationneeded = async () => {
      try {
        // Only the designated "Offerer" initiates to prevent glare
        if (isOfferer) {
          makingOffer.current.set(peerId, true);
          await pc.setLocalDescription();
          ws.current.send(JSON.stringify({ 
            type: "webrtc-signal", 
            to: peerId, 
            from: myId.current, 
            signal: pc.localDescription 
          }));
        }
      } catch (err) {
        console.error("Negotiation Error:", err);
      } finally {
        makingOffer.current.set(peerId, false);
      }
    };

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

    // Add existing local tracks immediately
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    return pc;
  }

  function cleanupPeer(id) {
    const pc = peerConnections.current.get(id);
    if (pc) {
      pc.close();
      peerConnections.current.delete(id);
      makingOffer.current.delete(id);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function queueCandidate(peerId, candidate) {
    if (!pendingCandidates.current.has(peerId)) pendingCandidates.current.set(peerId, []);
    pendingCandidates.current.get(peerId).push(candidate);
  }

  function flushCandidates(peerId, pc) {
    const list = pendingCandidates.current.get(peerId);
    if (!list) return;
    list.forEach((c) => pc.addIceCandidate(c).catch(() => {}));
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