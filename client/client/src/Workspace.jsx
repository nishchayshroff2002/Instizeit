import React, { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import SaveButton from "./SaveButton";

export default function Workspace({ roomId, ws }) {
  const [activeTab, setActiveTab] = useState("editor");
  const [themeColor, setThemeColor] = useState("#6c5ce7");

  const ydocRef = useRef(new Y.Doc());
  const ytextRef = useRef(ydocRef.current.getText("shared-text"));
  const ypathsRef = useRef(ydocRef.current.getArray("shared-paths"));

  useEffect(() => {
    const socket = ws.current;
    if (!socket) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "yjs-update" || message.type === "yjs-init") {
          const update = new Uint8Array(message.update);
          // Apply update from other clients
          Y.applyUpdate(ydocRef.current, update, "remote");
        }
      } catch (err) {}
    };

    socket.addEventListener("message", handleMessage);
    const onUpdate = (update, origin) => {
      if (origin !== "remote" && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "yjs-update", update: Array.from(update) }));
      }
    };

    ydocRef.current.on("update", onUpdate);
    return () => {
      socket.removeEventListener("message", handleMessage);
      ydocRef.current.off("update", onUpdate);
    };
  }, [ws]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div style={globalHeaderStyle}>
        <div style={tabBarStyle}>
          <button 
            onClick={() => setActiveTab("editor")} 
            style={activeTab === "editor" ? {...activeTabStyle, color: themeColor, borderTopColor: themeColor} : tabStyle}
          >📝 Editor</button>
          <button 
            onClick={() => setActiveTab("sketch")} 
            style={activeTab === "sketch" ? {...activeTabStyle, color: themeColor, borderTopColor: themeColor} : tabStyle}
          >🎨 Sketch</button>
        </div>
        <div style={toolbarRightStyle}>
          <input 
            type="color" 
            value={themeColor} 
            onChange={(e) => setThemeColor(e.target.value)} 
            style={colorInputStyle} 
          />
          <SaveButton ytextRef={ytextRef} activeTab={activeTab} themeColor={themeColor} />
        </div>
      </div>

      <div style={{ flex: 1, position: "relative", backgroundColor: "#fff", overflow: "hidden" }}>
        <div style={{ display: activeTab === "editor" ? "block" : "none", height: "100%" }}>
          <EditorPart ytext={ytextRef.current} color={themeColor} />
        </div>
        <div style={{ display: activeTab === "sketch" ? "block" : "none", height: "100%" }}>
          <SketchPart ydoc={ydocRef.current} ypaths={ypathsRef.current} color={themeColor} />
        </div>
      </div>
    </div>
  );
}

/* ───────── EDITOR COMPONENT ───────── */

function EditorPart({ ytext, color }) {
  const editorRef = useRef(null);

  // Helper to find the cursor position in a contentEditable div
  const getCaretCharacterOffsetWithin = (element) => {
    let caretOffset = 0;
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      caretOffset = preCaretRange.toString().length;
    }
    return caretOffset;
  };

  // Helper to set the cursor position after rerendering
  const setCaretPosition = (element, offset) => {
    const range = document.createRange();
    const sel = window.getSelection();
    let charCount = 0;
    let found = false;

    const traverseNodes = (node) => {
      if (found) return;
      if (node.nodeType === 3) { // Text node
        const nextCharCount = charCount + node.length;
        if (!found && offset <= nextCharCount) {
          range.setStart(node, offset - charCount);
          range.collapse(true);
          found = true;
        }
        charCount = nextCharCount;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverseNodes(node.childNodes[i]);
        }
      }
    };

    traverseNodes(element);
    if (found) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const handleInput = (e) => {
    const newText = e.target.innerText;
    const oldText = ytext.toString();
    
    // Calculate what changed (simple diff)
    if (newText.length > oldText.length) {
      const offset = getCaretCharacterOffsetWithin(editorRef.current);
      const addedText = newText.slice(offset - (newText.length - oldText.length), offset);
      ytext.insert(offset - addedText.length, addedText, { color: color });
    } else if (newText.length < oldText.length) {
      const offset = getCaretCharacterOffsetWithin(editorRef.current);
      ytext.delete(offset, oldText.length - newText.length);
    }
  };

  useEffect(() => {
    const render = () => {
      if (!editorRef.current) return;
      
      // Save cursor position
      const savedOffset = getCaretCharacterOffsetWithin(editorRef.current);

      const delta = ytext.toDelta();
      const html = delta.map(op => {
        const segmentColor = op.attributes?.color || "#2d3436";
        return `<span style="color: ${segmentColor}">${op.insert.replace(/\n/g, "<br/>")}</span>`;
      }).join("");

      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html;
        // Restore cursor position
        if (document.activeElement === editorRef.current) {
          setCaretPosition(editorRef.current, savedOffset);
        }
      }
    };

    ytext.observe(render);
    render();
    return () => ytext.unobserve(render);
  }, [ytext]);

  return (
    <div style={{ height: "100%", padding: "20px", boxSizing: "border-box" }}>
      <div 
        ref={editorRef} 
        contentEditable 
        suppressContentEditableWarning 
        onInput={handleInput}
        style={{ 
          height: "100%", 
          outline: "none", 
          fontFamily: "monospace", 
          borderLeft: `4px solid ${color}`, 
          paddingLeft: "15px", 
          overflowY: "auto",
          whiteSpace: "pre-wrap"
        }} 
      />
    </div>
  );
}

/* ───────── SKETCH COMPONENT ───────── */

function SketchPart({ ydoc, ypaths, color }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;

      ypaths.toArray().forEach(path => {
        if (!path.points || path.points.length < 2) return;
        ctx.strokeStyle = path.color || "#000";
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        path.points.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      });
    };

    const ro = new ResizeObserver(() => { 
      if (containerRef.current) {
        canvas.width = containerRef.current.clientWidth; 
        canvas.height = containerRef.current.clientHeight; 
        render(); 
      }
    });

    ro.observe(containerRef.current);
    ypaths.observe(render);
    return () => ro.disconnect();
  }, [ypaths]);

  const getCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  return (
    <div ref={containerRef} style={{ height: "100%", width: "100%", position: "relative", touchAction: "none" }}>
      <canvas 
        ref={canvasRef} 
        onPointerDown={(e) => { 
          isDrawing.current = true; 
          ypaths.push([{ points: [getCoords(e)], color: color }]); 
        }}
        onPointerMove={(e) => {
          if (!isDrawing.current) return;
          ydoc.transact(() => {
            const index = ypaths.length - 1;
            const lastPath = ypaths.get(index);
            ypaths.delete(index);
            ypaths.insert(index, [{ ...lastPath, points: [...lastPath.points, getCoords(e)] }]);
          });
        }}
        onPointerUp={() => { isDrawing.current = false; }}
        style={{ cursor: "crosshair", display: "block" }} 
      />
    </div>
  );
}

/* ───────── STYLES ───────── */

const globalHeaderStyle = { display: "flex", justifyContent: "space-between", padding: "0 15px", background: "#f8f9fa", borderBottom: "1px solid #eee", alignItems: "center", height: "50px" };
const tabBarStyle = { display: "flex", gap: "5px", height: "100%" };
const toolbarRightStyle = { display: "flex", alignItems: "center", gap: "15px" };
const tabStyle = { padding: "0 20px", border: "none", background: "none", cursor: "pointer", borderTop: "3px solid transparent" };
const activeTabStyle = { ...tabStyle, background: "#fff", fontWeight: "600" };
const colorInputStyle = { width: "32px", height: "32px", border: "2px solid #ddd", borderRadius: "8px", cursor: "pointer" };