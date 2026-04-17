"use client";

import { useState } from "react";

const POSITION_CLASSES = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
};

export default function Tooltip({ content, children, position = "top" }) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
      >
        {children}
      </span>
      {visible && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-[9999] whitespace-normal w-52 bg-[#1C1A17] text-white text-[11px] leading-relaxed rounded-[8px] px-[10px] py-[6px] shadow-lg ${POSITION_CLASSES[position] ?? POSITION_CLASSES.top}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
