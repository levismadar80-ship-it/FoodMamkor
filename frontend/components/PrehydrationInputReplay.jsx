"use client";

import { useEffect } from "react";
import { replayPrehydrationInput, stopPrehydrationCapture } from "@/lib/replay-prehydration-input";

// Streamed Suspense boundaries hydrate after the shell; one later pass covers them.
const LATE_PASS_MS = 1500;

/**
 * MEH-2602: renders nothing. Mounted last in the root layout so its effect runs
 * after every field above it has hydrated, then once more after the streamed
 * Suspense boundaries have had time to hydrate. See
 * lib/replay-prehydration-input.js for why and how.
 */
export default function PrehydrationInputReplay() {
  useEffect(() => {
    replayPrehydrationInput();
    const late = setTimeout(() => {
      replayPrehydrationInput();
      stopPrehydrationCapture();
    }, LATE_PASS_MS);
    return () => {
      clearTimeout(late);
      stopPrehydrationCapture();
    };
  }, []);
  return null;
}
