import { useCallback, useEffect, useState } from "react";

const KEY = "meh_onboarding_v1";
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const TOTAL_STEPS = 4;

// Module-level singleton — all useOnboarding() callers share state without Context.
let _step = undefined; // undefined = not hydrated yet
const _listeners = new Set();

function _read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const { step, ts } = JSON.parse(raw);
    if (Date.now() - ts > EXPIRY_MS) return 0;
    return step ?? null;
  } catch {
    return 0;
  }
}

function _write(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ step: next, ts: Date.now() }));
  } catch {}
  _step = next;
  _listeners.forEach((fn) => fn(next));
}

export function useOnboarding() {
  const [step, setStep] = useState(undefined);

  useEffect(() => {
    if (_step === undefined) _step = _read();
    setStep(_step);
    _listeners.add(setStep);
    return () => _listeners.delete(setStep);
  }, []);

  const advance = useCallback(() => {
    const cur = _step ?? 0;
    _write(cur + 1 >= TOTAL_STEPS ? null : cur + 1);
  }, []);

  const dismiss = useCallback(() => _write(null), []);

  return { step, advance, dismiss };
}
