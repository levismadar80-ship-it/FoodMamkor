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

/** Stops recording. The component calls it after its last replay pass. */
export function stopPrehydrationCapture() {
  if (!capturing) return;
  capturing = false;
  document.removeEventListener("input", onEarlyInput, true);
}

startPrehydrationCapture();

/**
 * The props React rendered this field with, or null for a field React does not
 * own (third-party widgets) or has not hydrated yet. `__reactProps$<random>` is
 * how React DOM links a node to its props in 17, 18 and 19.
 */
function reactProps(el) {
  const key = Object.keys(el).find((name) => name.startsWith("__reactProps$"));
  return key ? el[key] : null;
}

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

/**
 * Replays pre-hydration edits inside `root`. Returns the number of fields
 * replayed (for tests; callers ignore it).
 *
 * Only a CONTROLLED field React already owns is touched, and only when the
 * text the visitor typed differs from the value React rendered — so a field
 * React heard her type into after hydration (state already matches) is never
 * re-fired, uncontrolled fields keep their own DOM value untouched, and a field
 * not yet hydrated is left for the next pass.
 */
export function replayPrehydrationInput(root = typeof document !== "undefined" ? document : null) {
  if (!root) return 0;
  let replayed = 0;
  for (const el of root.querySelectorAll("input, textarea")) {
    if (!isTextField(el) || el.disabled || el.readOnly) continue;
    const props = reactProps(el);
    if (props?.value == null || typeof props.onChange !== "function") continue;
    const typed = captured.has(el) ? captured.get(el) : el.value;
    captured.delete(el);
    if (typed === String(props.value)) continue; // includes a prefilled field she cleared: "" ≠ "x" replays
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setNative = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setNative) continue;
    keepCaret(el, () => {
      el.value = String(props.value); // instance setter: React's tracker now holds the rendered value
      setNative.call(el, typed); // prototype setter: DOM holds `typed`, tracker does not
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    replayed += 1;
  }
  return replayed;
}
