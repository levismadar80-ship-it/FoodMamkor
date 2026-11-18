// @ts-check
/**
 * MEH-3164: the window property the <head> capture script
 * (lib/prehydration-capture-inline.js) and the replay module
 * (lib/replay-prehydration-input.js) share. Its own module so the client
 * chunk imports the name without the script string.
 */
export const PREHYDRATION_CAPTURE_KEY = "__mehPrehydrationCapture";
