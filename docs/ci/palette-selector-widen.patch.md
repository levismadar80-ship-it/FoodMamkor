# MEH-1647 — widen the raw-palette ESLint selector: drop the `className` prefix

> **`frontend/eslint.config.mjs` is CC-deny** (`protect-lint-config.sh`, MEH-442 —
> PROTECTED_FULL). This file is the exact before/after for Sapir to paste. CC did
> not touch the config; the measurement below ran against a throwaway copy of it
> outside the protected path, deleted afterwards.

## The paste — one selector, the regex unchanged

The 4th `no-restricted-syntax` entry, the one whose message begins
*"Raw Tailwind palette shade is not a Mehamakor token"*:

```diff
         {
           selector:
-            "JSXAttribute[name.name='className'] > Literal[value=/\\b(bg|text|border|ring|divide|from|via|to)-(red|orange|amber|yellow|lime|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-[0-9]/]",
+            "Literal[value=/\\b(bg|text|border|ring|divide|from|via|to)-(red|orange|amber|yellow|lime|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-[0-9]/]",
           message:
             "Raw Tailwind palette shade is not a Mehamakor token. ...",
         },
```

Severity stays `warn`. No existing finding is fixed by this PR. No ratchet.

## Phase 0 — measured 04/09 on `origin/staging` (`50e26213`), not the card's 27/07 numbers

| | card (27/07) | measured 04/09 |
|---|---|---|
| findings with the prefix (today's rule) | 170 | **181** |
| findings without the prefix (the paste) | 248 | **282** in 70 files (283 before this PR's fixture edit) |
| hits that are NOT a class string | 0 | **1** — `__tests__/RequiredMarkerParity.test.jsx:109` |

The numbers moved with the codebase (five weeks of raw-shade landings, incl.
MEH-1687's 34 default-palette classes); the shape of the finding did not.

**The one non-class hit, and why this PR removes it rather than STOPping.**
`RequiredMarkerParity.test.jsx:109` held the literal
`'label={<>{t("title_label")} <span className="text-red-500">*</span></>}'` — a
JSX-*source* fixture (the line that shipped a regression, kept as the scan's
control). It contained a shade but is not a class string, so the card's own STOP
fired on drain 25. The control regex (`LITERAL_MARKER_IN_LABEL`) matches the
fragment-plus-asterisk shape and is indifferent to the class, so this PR swaps
the shade for the `text-error` token inside the fixture (the rule's
`eslint-disable` escape hatch was tried first and is an *unused directive* error
under today's config, since today's rule does not reach the line). With that,
the widened selector's **282 hits are all class strings**: 266 in components /
app (`className=`, lookup objects, ternaries, template literals) and 16 in tests
that are class-string assertions or fixture tables (`toHaveClass("text-red-600")`,
`[2, "bg-amber-100"]`) — strings that *are* classes, asserted as such.

**Control that the count is the selector's and not the harness's:** the same
run with the unmodified config reproduced today's **181**.

## What the widening catches that the prefix hid (the card's motivating class)

Lookup objects, ternaries and template literals — the exact places where
status colours live: `RecipeStatusBadge.jsx` status map, `CitiesAutocomplete.jsx`
hover branch, `PasswordInput.jsx` strength colour, `lib/holidays.js` tone
strings (rendered by `HolidayBanner.jsx`). 101 additional findings, all `warn`.

## Post-paste expectation

```
npx eslint . --format json | <count messages starting "Raw Tailwind palette">
# expected: 282 · 0 errors · severity warn
```

A count of 181 after pasting means the prefix is still there. A count far above
282 means the paste widened more than this one entry.

## Optional follow-up, Sapir's call (not in this PR)

16 of the 282 are in `__tests__/**`. If the rule should not read test
assertions at all, the config's existing test-files block (`files:
["**/__tests__/**/*", ...]`) is where `no-restricted-syntax` could be turned off
for tests — a second config edit, deliberately not bundled here.

_Source: MEH-1647 (post-launch, quick-task). Measured 04/09, drain 26._
