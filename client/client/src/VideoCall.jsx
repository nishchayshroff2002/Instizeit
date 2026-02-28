import { useEffect, useRef, useState } from "react";

export default function VideoGrid({ roomId, ws, username, initialPeers, onStreamReady }) {
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const myId = useRef(sessionStorage.getItem("username") || username);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  // 1. React to the peer list - FIXED WITH TIE-BREAKER
  useEffect(() => {
    if (initialPeers && initialPeers.length > 0) {
      initialPeers.forEach((peerId) => {
        if (peerId !== myId.current && !peerConnections.current.has(peerId)) {
          
          /** * TIE-BREAKER LOGIC:
           * If my name is "godo" and yours is "mahek", godo < mahek is true.
           * Godo will be the offerer (Caller).
           * Mahek will see mahek < godo is false and will wait to receive the offer.
           */
          const isOfferer = myId.current.localeCompare(peerId) < 0; 
          
          createPeer(peerId, isOfferer); 
        }
      });
    }
  }, [initialPeers]);

  useEffect(() => {
    const socket = ws.current;
    if (!socket) return;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        
        if (onStreamReady) onStreamReady(stream);

        peerConnections.current.forEach((pc, peerId) => {
          // Check if tracks are already added to avoid duplicate track errors
          const senders = pc.getSenders().map(s => s.track);
          stream.getTracks().forEach((track) => {
             if (!senders.includes(track)) pc.addTrack(track, stream);
          });
          
          // Only renegotiate if we are the "polite" owner or the initiator
          // To keep it simple, we check signaling state
          if (pc.signalingState === "stable") {
            renegotiate(pc, peerId);
          }
        });
      })
      .catch((err) => console.error("Camera error:", err));

    const handleVideoMessage = async (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.type === "peer-left" || data.type === "peer-left-alert") {
        const idToRemove = data.peerId;
        const pc = peerConnections.current.get(idToRemove);
        if (pc) pc.close();
        peerConnections.current.delete(idToRemove);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(idToRemove);
          return next;
        });
        return;
      }

      if (data.type === "webrtc-signal") {
        const { from, signal } = data;
        let pc = peerConnections.current.get(from);

        // If we get a signal from someone we don't have a PC for, create it as a Receiver (false)
        if (!pc) pc = createPeer(from, false);

        if (signal.type === "offer") {
          // Safety: If we are already in the middle of an offer, only the "polite" one should rollback
          // For now, setting remote description usually works if isOfferer logic is respected
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
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(candidate).catch(e => console.warn("ICE error", e));
          } else {
            queueCandidate(from, candidate);
          }
        }
      }
    };

    socket.addEventListener("message", handleVideoMessage);
    return () => {
      socket.removeEventListener("message", handleVideoMessage);
      // Don't close PCs here if you want the video to persist during re-renders
      // only close if component unmounts for real
    };
  }, [ws]);

  function renegotiate(pc, peerId) {
    // Only start negotiation if state is stable to avoid InvalidStateError
    if (pc.signalingState !== "stable") return;

    pc.createOffer().then((offer) => {
      return pc.setLocalDescription(offer).then(() => {
        if (ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: "webrtc-signal", to: peerId, from: myId.current, signal: offer }));
        }
      });
    }).catch(e => console.error("Renegotiation failed", e));
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

    // If we are the designated initiator, start the offer
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
    list.forEach((c) => pc.addIceCandidate(c).catch(e => console.error("Delayed ICE error", e)));
    pendingCandidates.current.delete(peerId);
  }

  // --- STYLES REMAIN SAME ---
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