"use client";

import { useState } from "react";

const POSITION_CLASSES = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2", // rtl-ok: centering, not directional
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2", // rtl-ok: centering, not directional
  // MEH-1459: start-anchored below the trigger — the bubble grows toward the
  // inline-end (into the card) instead of centering, so it never pokes past the
  // trigger's start edge. Needed on ProducerCard, whose overflow-hidden article
  // clips a centered bubble on the narrow 2-col mobile card.
  "bottom-start": "top-full start-0 mt-2",
  right: "end-full top-1/2 -translate-y-1/2 me-2",
  left: "start-full top-1/2 -translate-y-1/2 ms-2",
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
          className={`pointer-events-none absolute z-[9999] whitespace-normal break-words w-max max-w-[8.5rem] sm:max-w-[13rem] bg-[#1C1A17] text-white text-[11px] leading-relaxed rounded-[8px] px-[10px] py-[6px] shadow-lg ${POSITION_CLASSES[position] ?? POSITION_CLASSES.top}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
