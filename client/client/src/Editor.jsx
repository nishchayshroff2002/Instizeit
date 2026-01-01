import { useEffect, useRef } from "react";
import * as Y from "yjs";
import SaveButton from "./SaveButton";

export default function Editor() {
  const textareaRef = useRef(null);
  const wsRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);

  useEffect(() => {
    // 1️⃣ Create Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // 2️⃣ Shared text type
    const ytext = ydoc.getText("shared-text");
    ytextRef.current = ytext;

    // 3️⃣ Connect to WebSocket room
    const ws = new WebSocket("ws://localhost:1234/room1");
    wsRef.current = ws;

    const textarea = textareaRef.current;

    // 4️⃣ Handle incoming messages
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // ───── Initial document sync
      if (message.type === "yjs-init") {
        const update = new Uint8Array(message.update);
        Y.applyUpdate(ydoc, update);
        textarea.value = ytext.toString();
      }

      // ───── Remote CRDT updates
      if (message.type === "yjs-update") {
        const cursor = textarea.selectionStart;
        const update = new Uint8Array(message.update);

        Y.applyUpdate(ydoc, update);

        textarea.value = ytext.toString();
        textarea.selectionStart =
          textarea.selectionEnd =
          Math.min(cursor, textarea.value.length);
      }

      // ───── WebRTC signaling (future use)
      if (message.type === "webrtc-signal") {
        console.log("📡 WebRTC signal received:", message.signal);
        // pc.setRemoteDescription / pc.addIceCandidate later
      }
    };

    // 5️⃣ Send local CRDT updates
    ydoc.on("update", (update) => {
      ws.send(
        JSON.stringify({
          type: "yjs-update",
          update: Array.from(update),
        })
      );
    });

    return () => {
      ws.close();
      ydoc.destroy();
    };
  }, []);

  // 6️⃣ Update CRDT when user types
  const handleInput = () => {
    const ytext = ytextRef.current;
    const textarea = textareaRef.current;

    ydocRef.current.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, textarea.value);
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>CRDT Collaborative Editor</h2>
      <SaveButton ytextRef={ytextRef} />
      <textarea
        ref={textareaRef}
        onInput={handleInput}
        placeholder="Start typing..."
        style={{ width: "100%", height: "80vh", fontSize: 16 }}
      />
    </div>
  );
}
