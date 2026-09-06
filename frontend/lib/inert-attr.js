// MEH-2253 — the prop value that makes the `inert` attribute PRESENT depends
// on which React is rendering, and this repo runs two of them:
//
//   * vitest / node_modules: react 18.3.1 — `inert` is an unknown attribute.
//     `inert=""` is passed through as `inert=""`; `inert={true}` is DROPPED
//     with the "non-boolean attribute" warning.
//   * the App Router at build/runtime: Next's vendored React
//     (next/dist/compiled/react, 19.x canary) — `inert` is a KNOWN boolean.
//     `inert={true}` renders `inert=""`; `inert=""` is DROPPED with the
//     "Received an empty string for a boolean attribute" warning.
//
// So the MEH-1333 string idiom (`inert={hidden ? "" : undefined}`) was correct
// in the unit tests and silently a no-op in the shipped page: measured 04/09
// at five scroll positions on Pixel 5, `inert` was absent at every one while
// `transform` tracked the observer perfectly (MEH-2253). Both idioms are
// therefore wrong for one of the two runtimes; the only value that is right in
// both is the one chosen by the React actually in charge.
//
// `inertAttrValueFor` is exported on its own so the choice can be tested
// against both real renderers (see __tests__/InertAttr.test.js) rather than
// against a copy of this table.
import { version as reactVersion } from "react";

export function inertAttrValueFor(version) {
  const major = Number(String(version ?? "").split(".")[0]);
  return major >= 19 ? true : "";
}

/** Pass as `inert={hidden ? INERT_PRESENT : undefined}`. */
export const INERT_PRESENT = inertAttrValueFor(reactVersion);
