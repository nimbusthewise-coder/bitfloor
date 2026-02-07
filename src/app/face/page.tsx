"use client";

import { useState } from "react";
import FacePicker from "@/components/FacePicker";

export default function FacePage() {
  const [selectedFace, setSelectedFace] = useState<number[] | null>(null);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      fontFamily: "'Press Start 2P', monospace",
    }}>
      <h1 style={{ 
        color: "#fff", 
        fontSize: "12px", 
        marginBottom: 20,
        textAlign: "center",
      }}>
        BITFLOOR FACE PICKER
      </h1>
      
      <FacePicker 
        onSelect={(config) => {
          setSelectedFace(config);
          console.log("Selected face DNA:", config);
        }}
      />

      {selectedFace && (
        <div style={{
          marginTop: 20,
          color: "#0f0",
          fontSize: "10px",
          textAlign: "center",
        }}>
          <div>Selected DNA:</div>
          <div style={{ 
            background: "#111", 
            padding: "8px 16px", 
            marginTop: 8,
            border: "1px solid #0f0",
            fontFamily: "monospace",
          }}>
            [{selectedFace.join(", ")}]
          </div>
        </div>
      )}
    </div>
  );
}
