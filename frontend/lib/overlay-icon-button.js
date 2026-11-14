// @ts-check
// MEH-3115: one anatomy for every icon-only button that sits ON a photo —
// the business hero's heart / share / bell, the recipe, event and experience
// cover hearts, the organizer cover's share, and the list-row hearts.
//
// Why a circle at all: the photo is the business's own, light or dark or busy,
// so a bare icon disappears on some of them; the circle guarantees contrast on
// any photo (Sapir weighed bare icons and a dark glass circle on 14/11 and
// chose this). Why this size: the visible face is 32px so it reads light over
// the photo, while the button itself stays 44px so the tap target does not
// shrink (WCAG 2.5.5 / the repo's min-h-touch).
//
// The button is the 44px hit area; the face is a <span> inside it. Hover and
// focus are drawn on the face (group-*), because a ring around the invisible
// 44px box would float off the circle.
export const OVERLAY_ICON_BUTTON =
  "group w-11 h-11 grid place-items-center rounded-full transition disabled:opacity-50 focus-visible:outline-none";
export const OVERLAY_ICON_FACE =
  "w-8 h-8 grid place-items-center rounded-full bg-surface/95 shadow-sm ring-1 ring-black/5 transition group-hover:bg-surface group-focus-visible:ring-2 group-focus-visible:ring-primary";
export const OVERLAY_ICON_SIZE = 18;
// Off = the page's text ink, on = the saved-green fill — the same pair the
// heart has always used, so the bell beside it no longer reads green while off.
export const overlayIconInk = (on) => (on ? "text-primary" : "text-text");
