# ADR-038: Status colours are tokens — `danger-*` and `warning-*` scales (narrows ADR-019, extends ADR-026)

**Status:** Accepted
**Date:** 2026-11-06
**Deciders:** Sapir Levi (decision card in the structural-debt thread, 06/11: «כן, ADR חדש»)
**Source:** MEH-1687 (design-debt umbrella) · MEH-2717 raw-colour ratchet

## Context
ADR-019 kept the palette free of state colours, and ADR-026 added the single `error` pair. In practice the code did not follow: the MEH-2717 ratchet froze 863 raw colour occurrences, and about 290 of them are status colours. `red-*` alone appears 210 times (`red-600` 73, `red-700` 40, `red-50` 32) and `amber-*` 42 times, in admin queues, form errors, delete buttons and "pending" pills. Because none of them is a token, a theme change (dark mode, a brand re-tint) would have to find each one by hand. That is the cost Sapir asked to remove.

## Decision
1. Two status scales enter the token pipeline (`docs/DESIGN.md` front matter → `tailwind.tokens.json`): `danger-50…900` and `warning-50…900`.
2. **Their values are Tailwind's `red` and `amber` values, exactly.** The migration `red-N → danger-N`, `amber-N → warning-N` is therefore pixel-identical, and it is done as a codemod in the same PR. Changing a value later changes every status surface at once, which is the point of the token.
3. **Success needs no new token:** it is `primary` / the existing `green-*` scale.
4. `error` / `error-on-dark` (ADR-026) are unchanged and stay the choice for error *text* on cream, because they are the AA-checked pair. `danger-*` covers status surfaces, borders and buttons.
5. `yellow-*`, `gray-*`, `blue-*`/`sky-*` do not get tokens here. Moving them onto `warning-*` or a neutral changes their colour, so each needs a before/after mock and Sapir's eye first.
6. ADR-019's opacity-on-cream rule still governs de-emphasis states (loading, vacation, disabled). This ADR covers *status meaning* only.

## Consequences
**Positive:** the largest raw-colour family becomes themeable; the ratchet baseline shrinks by the migrated count; new code has a sanctioned name to reach for instead of `red-600`.
**Negative:** two ten-step scales are more vocabulary than ADR-019 wanted.
**Mitigations:** the ratchet (`raw-color-tokens.sh`) blocks new raw `red-*`/`amber-*`; the scales mirror Tailwind's steps so nobody has to learn new numbers.

## Alternatives considered
- **Three-step roles (`danger-bg` / `-border` / `-fg`).** Rejected for now: mapping ten used shades onto three changes pixels and needs a visual review per site. It can follow as a later ADR once the codemod has made every site greppable.
- **Keep raw shades, rely on the ratchet.** Rejected: the ratchet stops growth but leaves 250+ sites un-themeable.
