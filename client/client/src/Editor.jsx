import { useEffect, useRef } from "react";
import * as Y from "yjs";
import SaveButton from "./SaveButton";

export default function Editor({ roomId, ws }) {
  const textareaRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);

  useEffect(() => {
    const socket = ws.current;
    if (!socket) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const ytext = ydoc.getText("shared-text");
    ytextRef.current = ytext;
    const textarea = textareaRef.current;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "yjs-init" || message.type === "yjs-update") {
        const update = new Uint8Array(message.update);
        Y.applyUpdate(ydoc, update, "remote");

        const cursor = textarea.selectionStart;
        textarea.value = ytext.toString();

        if (message.type === "yjs-update") {
          textarea.selectionStart = textarea.selectionEnd = Math.min(cursor, textarea.value.length);
        }
      }
    };

    socket.addEventListener("message", handleMessage);

    ydoc.on("update", (update, origin) => {
      if (origin !== "remote" && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "yjs-update",
            update: Array.from(update),
          })
        );
      }
    });

    return () => {
      socket.removeEventListener("message", handleMessage);
      ydoc.destroy();
    };
  }, [ws, roomId]);

  const handleInput = () => {
    const ytext = ytextRef.current;
    const textarea = textareaRef.current;
    ydocRef.current.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, textarea.value);
    }, "local");
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