// @ts-check
/**
 * MEH-3164: the window property the <head> capture script
 * (lib/prehydration-capture-inline.js) and the replay module
 * (lib/replay-prehydration-input.js) share. Its own module so the client
 * chunk imports the name without the script string.
 */
export const PREHYDRATION_CAPTURE_KEY = "__mehPrehydrationCapture";

// MEH-3164 (19/11): the expando the <head> script sets on an input event that
// started on a field React did not own yet. React 19 can hydrate the field
// SYNCHRONOUSLY inside that same dispatch (selective hydration of the blocked
// target), so by the time a later listener sees the event the field is owned
// and already emptied — and a trusted event on an owned field reads as "she
// typed after hydration". The mark says it did not.
export const PREHYDRATION_EVENT_MARK = "__mehPrehydrationEvent";
