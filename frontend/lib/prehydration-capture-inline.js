// @ts-check
/**
 * MEH-3164: the first-byte half of the pre-hydration capture.
 *
 * `lib/replay-prehydration-input.js` records text typed before React hydrates,
 * but it can only start once its client chunk evaluates. On a slow WebKit load
 * that is AFTER the visitor's keystroke and after React has attached its root
 * listeners: React holds the event while its tree is dehydrated, hydration
 * writes the rendered value ("") over the typed text, and the text is gone
 * before the module ever looks (measured 5/10 loads on /producers, MEH-3164).
 *
 * This script is inlined in the root layout's <head>, so it runs before any
 * chunk and before React. It records every TRUSTED input event on a field React
 * does not own yet into one shared WeakMap, which the module adopts. It never
 * writes to the DOM and never replays anything; the module does that.
 *
 * Rules mirror `onEarlyInput` in the module and must stay in step with it
 * (`PrehydrationCaptureInline.test.js` checks the shared map name):
 *   - a field React does not own yet: remember its value (trusted or not —
 *     nothing but the browser and the visitor touch a dehydrated field);
 *   - a field React owns: a TRUSTED event means she typed after hydration, so
 *     her new text wins and the capture is dropped; an UNTRUSTED event is
 *     React re-dispatching the held keystroke as a clone onto the field it has
 *     just emptied, and must NOT drop the capture (that was the bug).
 *
 * CSP: script-src already allows 'unsafe-inline' (next.config.js).
 */

/** The window property the head script and the module share. */
export const PREHYDRATION_CAPTURE_KEY = "__mehPrehydrationCapture";

export const PREHYDRATION_CAPTURE_SCRIPT = `(function(){var w=window,k=${JSON.stringify(PREHYDRATION_CAPTURE_KEY)};if(w[k]||typeof WeakMap==="undefined")return;var m=new WeakMap();w[k]=m;function owned(el){var ks=Object.keys(el);for(var i=0;i<ks.length;i++){if(ks[i].indexOf("__reactProps$")===0)return true}return false}document.addEventListener("input",function(e){var t=e.target;if(!t||(t.tagName!=="INPUT"&&t.tagName!=="TEXTAREA"))return;if(owned(t)){if(e.isTrusted)m.delete(t);return}m.set(t,t.value)},true)})();`;
