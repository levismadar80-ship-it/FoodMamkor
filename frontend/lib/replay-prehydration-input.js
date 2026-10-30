/**
 * MEH-2602: typing that lands before hydration must not be silently dropped.
 *
 * Every server-rendered field (footer newsletter, contact form, forgot-password,
 * search boxes) is a controlled input whose state starts at "". React ignores
 * input events that fire before it hydrates (facebook/react#12955) and does not
 * reset the DOM either, so after hydration the visitor SEES her text while
 * React state still holds "" — submit then reads empty, and the next unrelated
 * re-render wipes the field. Browser autofill that runs before the bundle hits
 * the same gap.
 *
 * The fix replays the gap: any text-like field whose live value differs from
 * its server value (`defaultValue` mirrors the `value` attribute, which React
 * keeps in sync for controlled inputs) gets one synthetic `input` event, so its
 * own onChange runs and state catches up. React's value tracker swallows an
 * event whose value it believes unchanged, so the tracker is first moved off
 * the value through the instance setter, then the real value is written back
 * through the prototype setter — the same sequence Testing Library uses.
 *
 * A textarea is worse: React 18 rewrites its value during hydration, so the
 * typed text is gone from the DOM by the time any effect runs. That case is
 * covered by capturing values when this module is evaluated — the client
 * bundle loads before hydrateRoot runs — and from input events until the first
 * replay pass, then replaying the captured value.
 *
 * Industry precedent: kurtextrem.de/posts/replay-input-after-hydration; React's
 * own (flag-gated) enableHydrationChangeEvent does the same at hydration commit.
 */

const TEXT_TYPES = new Set(["", "text", "email", "search", "tel", "url", "password", "number"]);

function isTextField(el) {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && TEXT_TYPES.has((el.getAttribute("type") || "").toLowerCase());
}

const captured = new WeakMap();
let capturing = false;

function remember(el) {
  if (el && isTextField(el)) captured.set(el, el.value);
}

function onEarlyInput(event) {
  remember(event.target);
}

/** Starts recording pre-hydration values. Runs once at module evaluation. */
export function startPrehydrationCapture() {
  if (typeof document === "undefined" || capturing) return;
  capturing = true;
  for (const el of document.querySelectorAll("input, textarea")) {
    if (el.value !== el.defaultValue) remember(el);
  }
  document.addEventListener("input", onEarlyInput, true);
}

function stopPrehydrationCapture() {
  if (!capturing) return;
  capturing = false;
  document.removeEventListener("input", onEarlyInput, true);
}

startPrehydrationCapture();

/**
 * Replays pre-hydration edits inside `root`. Returns the number of fields
 * replayed (for tests; callers ignore it).
 */
export function replayPrehydrationInput(root = typeof document !== "undefined" ? document : null) {
  if (!root) return 0;
  stopPrehydrationCapture();
  let replayed = 0;
  for (const el of root.querySelectorAll("input, textarea")) {
    if (!isTextField(el) || el.disabled || el.readOnly) continue;
    const typed = captured.has(el) ? captured.get(el) : el.value;
    captured.delete(el);
    if (typed === "" || (typed === el.defaultValue && typed === el.value)) continue;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setNative = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setNative) continue;
    el.value = el.defaultValue; // instance setter: moves React's tracker off `typed`
    setNative.call(el, typed); // prototype setter: DOM holds `typed`, tracker does not
    el.dispatchEvent(new Event("input", { bubbles: true }));
    replayed += 1;
  }
  return replayed;
}
