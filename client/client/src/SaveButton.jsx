import { useRef } from "react";

export default function SaveButton({ ytextRef }) {
  // Persist file handle across saves
  const fileHandleRef = useRef(null);

  const saveDocument = async () => {
    if (!ytextRef.current) return;

    try {
      // First save → ask user where to save
      if (!fileHandleRef.current) {
        fileHandleRef.current = await window.showSaveFilePicker({
          suggestedName: "meeting-notes.txt",
          types: [
            {
              description: "Text Files",
              accept: { "text/plain": [".txt"] }
            }
          ]
        });
      }

      const text = ytextRef.current.toString();

      // Write to SAME file
      const writable = await fileHandleRef.current.createWritable();
      await writable.write(text);
      await writable.close();
    } catch (err) {
      console.log("Save cancelled or failed", err);
    }
  };

  return (
    <button onClick={saveDocument}>
      💾 Save
    </button>
  );
}
