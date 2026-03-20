import React, { useState } from "react";
import ReactMarkdown from "react-markdown";



function InteractiveSpan({ children, index, active, toggle }) {
  return (
    <span
      onClick={() => toggle(index)}
      className={`cursor-pointer ${
        active ? "bg-yellow-200" : "hover:bg-gray-200"
      }`}
    >
      {children}
    </span>
  );
}



function MarkdownRenderer() {
  const [active, setActive] = useState(null);
  const [hovered, setHovered] = useState(null);

  const text_chunks_ar = [
    {id:0, text:"# Title of the paper"},
    {id:1, text:"First sentence."},
    {id:2, text:"Second sentence."},
  ];

  const toggle = (i) => {
    setActive((prev) => (prev === i ? null : i));
  };

  return (
    <div className="space-y-4">
      {text_chunks_ar.map((chunk) => {
        const isActive = active === chunk.id;
        const isHovered = hovered === chunk.id;
        const handleClick = (e) => {
          console.log("Clicked chunk:", chunk.id, "isActive before:", isActive);
          toggle(chunk.id);
        };
        
        return (
          <div
            key={chunk.id}
            onClick={handleClick}
            onMouseEnter={() => setHovered(chunk.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              backgroundColor: isActive ? "rgb(253, 224, 71)" : (isHovered ? "rgb(229, 231, 235)" : "transparent"),
              padding: "8px",
              borderRadius: "4px",
              cursor: "pointer",
              transition: "background-color 0.2s"
            }}
          >
            <ReactMarkdown>{chunk.text}</ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

export default MarkdownRenderer