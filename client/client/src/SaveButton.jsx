import React from "react";

export default function SaveButton({ ytextRef, activeTab, themeColor }) {
  const saveDocument = async () => {
    try {
      if (activeTab === "editor") {
        await saveTextFile();
      } else {
        await saveImageFile();
      }
    } catch (err) {
      console.log("Save operation stopped:", err.message);
    }
  };

  const saveTextFile = async () => {
    if (!ytextRef.current) return;
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: "document.txt",
      types: [{ description: "Plain Text", accept: { "text/plain": [".txt"] } },
              { description: "Markdown", accept: { "text/markdown": [".md"] } }]
    });
    const writable = await fileHandle.createWritable();
    await writable.write(ytextRef.current.toString());
    await writable.close();
  };

  const saveImageFile = async () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: "sketch.png",
      types: [{ description: "PNG Image", accept: { "image/png": [".png"] } }]
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  };

  return (
    <button onClick={saveDocument} style={{ ...buttonStyle, backgroundColor: themeColor }}>
      💾 Export {activeTab === "editor" ? "Notes" : "Drawing"}
    </button>
  );
}

const buttonStyle = {
  padding: "8px 16px",
  color: "white",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: "bold",
  transition: "filter 0.2s"
};