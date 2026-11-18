// @ts-check
"use client";

import { useEffect } from "react";
import { replayPrehydrationInput, startPrehydrationCapture, stopPrehydrationCapture } from "@/lib/replay-prehydration-input";

// Streamed Suspense boundaries hydrate after the shell, later on a slow
// connection; these extra passes cover them. A pass touches only fields React
// owns and is behind on, so an extra pass is a no-op, never a duplicate.
const LATE_PASSES_MS = [1500, 5000, 12000];
// MEH-3164: a commit right after hydration can empty a field the visitor typed
// into (WebKit). A captured-fields-only pass every FAST_PASS_MS for the first
// FAST_WINDOW_MS puts the text back before she notices; it costs nothing when
// nothing was captured.
const FAST_PASS_MS = 50;
const FAST_WINDOW_MS = 3000;

/**
 * MEH-2602: renders nothing. Mounted last in the root layout so its effect runs
 * after the fields above it have hydrated, then again as late (streamed or
 * lazy) boundaries hydrate. See
 * lib/replay-prehydration-input.js for why and how.
 */
export default function PrehydrationInputReplay() {
  useEffect(() => {
    // Idempotent; re-arms after a StrictMode dev unmount/remount.
    startPrehydrationCapture();
    replayPrehydrationInput();
    const timers = LATE_PASSES_MS.map((ms, i) =>
      setTimeout(() => {
        replayPrehydrationInput();
        if (i === LATE_PASSES_MS.length - 1) stopPrehydrationCapture();
      }, ms),
    );
    const startedAt = Date.now();
    const fast = setInterval(() => {
      if (Date.now() - startedAt > FAST_WINDOW_MS) clearInterval(fast);
      else replayPrehydrationInput(undefined, { capturedOnly: true });
    }, FAST_PASS_MS);
    return () => {
      clearInterval(fast);
      timers.forEach(clearTimeout);
      stopPrehydrationCapture();
    };
  }, []);
  return null;
}
