// @ts-check
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
 * The fix replays the gap: any controlled text field whose live value differs
 * from the value React rendered gets one synthetic `input` event, so its own
 * onChange runs and state catches up. React's value tracker swallows an
 * event whose value it believes unchanged, so the tracker is first moved off
 * the value through the instance setter, then the real value is written back
 * through the prototype setter — the same sequence Testing Library uses.
 *
 * A textarea is worse: React 18 rewrites its value during hydration, so the
 * typed text is gone from the DOM by the time any effect runs. That case is
 * covered by capturing values when this module is evaluated and from input
 * events until the last replay pass, then replaying the captured value. The
 * capture assumes this module evaluates before hydration reaches the field —
 * true for a chunk the root layout imports, unverified for every bundling
 * order. The App Router runs React 19, which leaves the DOM value alone, so
 * there the capture is a backstop and the DOM value alone is enough.
 *
 * MEH-3164: on a slow WebKit load this chunk evaluated after the keystroke and
 * after hydration had already emptied the field, so the capture now starts in
 * an inline <head> script (lib/prehydration-capture-inline.js) and this module
 * adopts its map. Captures also survive the replay that applies them — see
 * replayPrehydrationInput.
 *
 * Industry precedent: kurtextrem.de/posts/replay-input-after-hydration; React's
 * own (flag-gated) enableHydrationChangeEvent does the same at hydration commit.
 */

import { PREHYDRATION_CAPTURE_KEY, PREHYDRATION_EVENT_MARK } from "@/lib/prehydration-capture-key";

const TEXT_TYPES = new Set(["", "text", "email", "search", "tel", "url", "password"]);

function isTextField(el) {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && TEXT_TYPES.has((el.getAttribute("type") || "").toLowerCase());
}

// MEH-3164: shared with the <head> script (lib/prehydration-capture-inline.js),
// which starts recording from the first byte — before this chunk evaluates.
const globalScope = /** @type {any} */ (typeof window !== "undefined" ? window : null);
const captured = /** @type {WeakMap<Element, string>} */ (
  globalScope?.[PREHYDRATION_CAPTURE_KEY] || new WeakMap()
);
if (globalScope) globalScope[PREHYDRATION_CAPTURE_KEY] = captured;
// When a capture first matched React state, and how often it was replayed.
const matchedAt = new WeakMap();
const replays = new WeakMap();
let capturing = false;

/** A capture that has matched state this long is consumed (ms). */
export const SETTLE_MS = 1000;
/** An onChange that rewrites the text never matches; stop after this many. */
const MAX_REPLAYS = 3;

function remember(el) {
  if (el && isTextField(el)) captured.set(el, el.value);
}

function forget(el) {
  captured.delete(el);
  matchedAt.delete(el);
  replays.delete(el);
}

/**
 * The props React rendered this field with, or null for a field React does not
 * own (third-party widgets) or has not hydrated yet. `__reactProps$<random>` is
 * how React DOM links a node to its props in 17, 18 and 19.
 */
function reactProps(el) {
  const key = Object.keys(el).find((name) => name.startsWith("__reactProps$"));
  return key ? el[key] : null;
}

/** Exported for tests only: jsdom cannot dispatch a trusted event. */
export function onEarlyInput(event) {
  if (!reactProps(event.target)) {
    event[PREHYDRATION_EVENT_MARK] = 1;
    remember(event.target);
    return;
  }
  // A field React owns. A trusted event is the visitor typing after
  // hydration — her new text wins over anything captured. An UNTRUSTED one is
  // React re-dispatching a held keystroke as a clone onto the field hydration
  // just emptied (MEH-3164); dropping the capture on it lost the text.
  //
  // MEH-3164 (19/11): a trusted event can ALSO be the pre-hydration keystroke
  // itself. React 19 hydrates the blocked target synchronously inside that
  // dispatch, so a listener behind React's sees it owned and emptied. The
  // <head> script (or this listener, if it ran first) marked such an event
  // while the field was still unowned. Measured on WebKit, local production
  // build: 5 of 6 /producers loads lost the text this way.
  if (event.isTrusted && !event[PREHYDRATION_EVENT_MARK]) forget(event.target);
}

/**
 * A submit reads the field (ProducersClient: MEH-3153). If a commit emptied it
 * after the visitor typed and no pass has run since, restore it first, then let
 * the form own its fields: a form that clears itself after sending is never
 * refilled from an old capture.
 */
function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  replayPrehydrationInput(form);
  // A field React does not own yet keeps its capture: a submit before
  // hydration is held and re-dispatched by React, and the field it reads may
  // be emptied by then.
  for (const el of form.querySelectorAll("input, textarea")) {
    if (reactProps(el)) forget(el);
  }
}

/** Starts recording pre-hydration values. Runs once at module evaluation. */
export function startPrehydrationCapture() {
  if (typeof document === "undefined" || capturing) return;
  capturing = true;
  const fields = /** @type {NodeListOf<HTMLInputElement | HTMLTextAreaElement>} */ (
    document.querySelectorAll("input, textarea")
  );
  for (const el of fields) {
    if (!captured.has(el) && el.value !== el.defaultValue) remember(el);
  }
  document.addEventListener("input", onEarlyInput, true);
  document.addEventListener("submit", onSubmit, true);
}

/** Stops recording. The component calls it after its last replay pass. */
export function stopPrehydrationCapture() {
  if (!capturing) return;
  capturing = false;
  document.removeEventListener("input", onEarlyInput, true);
  document.removeEventListener("submit", onSubmit, true);
}

startPrehydrationCapture();

function keepCaret(el, write) {
  let range = null;
  try {
    if (el.ownerDocument.activeElement === el) range = [el.selectionStart, el.selectionEnd];
  } catch {
    // email/number inputs have no selection API — nothing to keep
  }
  write();
  if (range && range[0] != null) el.setSelectionRange(range[0], range[1]);
}

/** Counts a capture that already matches state; consumes it once settled. */
function settle(el, now) {
  if (!matchedAt.has(el)) matchedAt.set(el, now);
  else if (now - matchedAt.get(el) >= SETTLE_MS) forget(el);
}

/** Fires one input event so the field's own onChange sees `typed`. */
function writeThroughOnChange(el, rendered, typed) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setNative = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setNative) return false;
  keepCaret(el, () => {
    el.value = rendered; // instance setter: React's tracker now holds the rendered value
    setNative.call(el, typed); // prototype setter: DOM holds `typed`, tracker does not
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return true;
}

/** One field of a pass. True when it was replayed. */
function replayField(el, now) {
  if (!isTextField(el) || el.disabled || el.readOnly) return false;
  const props = reactProps(el);
  if (props?.value === null || props?.value === undefined || typeof props.onChange !== "function") return false;
  const hasCapture = captured.has(el);
  const typed = hasCapture ? /** @type {string} */ (captured.get(el)) : el.value;
  const rendered = String(props.value);
  if (typed === rendered) {
    // a prefilled field she cleared is "" ≠ "x", and replays below
    if (hasCapture) settle(el, now);
    return false;
  }
  if (!hasCapture) return writeThroughOnChange(el, rendered, typed);
  matchedAt.delete(el);
  const count = (replays.get(el) || 0) + 1;
  if (count > MAX_REPLAYS) {
    forget(el);
    return false;
  }
  replays.set(el, count);
  return writeThroughOnChange(el, rendered, typed);
}

/**
 * Replays pre-hydration edits inside `root`. Returns the number of fields
 * replayed (for tests; callers ignore it).
 *
 * Only a CONTROLLED field React already owns is touched, and only when the
 * text the visitor typed differs from the value React rendered — so uncontrolled
 * fields keep their own DOM value untouched and a field not yet hydrated is left
 * for the next pass.
 *
 * MEH-3164: a captured value is NOT consumed by the replay that applies it. A
 * commit after hydration can write the rendered "" back over the field (seen on
 * WebKit), and a consumed capture left every later pass seeing DOM == state ==
 * "". The capture is consumed once state has matched it for SETTLE_MS, after
 * MAX_REPLAYS, on a trusted keystroke after hydration, or when its form submits.
 *
 * @param {ParentNode | null} [root]
 * @param {{ now?: number, capturedOnly?: boolean }} [options]
 */
export function replayPrehydrationInput(
  root = typeof document !== "undefined" ? document : null,
  { now = Date.now(), capturedOnly = false } = {},
) {
  if (!root) return 0;
  let replayed = 0;
  const fields = /** @type {NodeListOf<HTMLInputElement | HTMLTextAreaElement>} */ (
    root.querySelectorAll("input, textarea")
  );
  for (const el of fields) {
    if (capturedOnly && !captured.has(el)) continue;
    if (replayField(el, now)) replayed += 1;
  }
  return replayed;
}
