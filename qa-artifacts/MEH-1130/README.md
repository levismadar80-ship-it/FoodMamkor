# MEH-1130 — /about editorial image layer · self-QA artifacts

Captured by `frontend/e2e/qa-meh1130-editorial-layer.mjs` against a local
`next start` of this branch. **80 assertions ran, 0 failed.**

## Two sets, and why — read this before judging any frame

**Cloudinary is egress-blocked from the CC sandbox.** Measured on capture day:
`curl` on the delivered transform returns `000` for **all four** assets
(`home/feature-produce`, `about/bread`, `about/olive-oil`,
`events/hero-market`) — the proxy refuses the host. Nothing about the page or
the transforms is wrong; the machine simply cannot fetch them.

| Set | Filenames | What it is evidence of |
|---|---|---|
| **as-served** | `about-375-*`, `about-1440-*` | The page exactly as this machine renders it: empty tonal plates where the photographs go. Honest, and nearly useless for judging composition. |
| **stubbed** | `about-375-stubbed-images-*`, `about-1440-stubbed-images-*` | The same page with the `/_next/image` route fulfilled by a **flat solid-colour tile**, so the layout is legible. Evidence of **geometry only** — never of what the photographs look like. The tile is deliberately a colour no photograph could be mistaken for. |

**Neither set shows the real images.** Whoever reviews the visual result needs
the Vercel preview or a machine that can reach Cloudinary.

## The geometric claim does not rest on anyone reading a PNG

The bleed is asserted numerically in the same run, from
`getBoundingClientRect()` (RTL: the inline-**end** edge is the **left** edge):

```
1440  story image box  left=0.0  right=574.1  w=574.1   (viewport 1440)
1440  prose column     left=630.1                        (stays inside the container)
 375  story image box  left=0.0  right=375.0  w=375.0   (full-width band)
```

## The harness refuses to lie

- **Control first.** Probe 0 asserts the story greeting renders. If it fails,
  the run aborts and writes nothing — every later null in that run would be
  void. It has already fired once for real: a stale `next start` serving a
  replaced `.next` was photographing an error boundary, and the control caught
  it instead of producing six confident-looking files.
- **No file is written whose subject is absent** — each element capture checks
  `count() === 1` first. "The file exists" is not evidence that the file shows
  anything.

---

## The VRT baselines were regenerated on the runner, and reviewed by eye

`vrt-update.yml` dispatched against this branch with `route: about`. It committed
`09376b4d`, touching **exactly two files** — `about-desktop-linux.png` and
`about-mobile-linux.png`. No other route's baseline moved, which is what the
`route` scoping is for.

**They were opened and looked at before being accepted.** A regenerated baseline
is a candidate, not truth: it freezes whatever was on screen, bug included.

### What the /about VRT actually tests — read this before trusting a green

`parity.spec.ts:704` masks the images:

```ts
mask: [page.locator("main img")],
```

so every `<img>` inside `<main>` is painted over in **magenta** (`#FF00FF`,
Playwright's default mask colour). **The photographs are not under test at all —
their layout boxes are.** That is the right call for an external asset, and it
happens to be exactly the property this change alters, so the geometry is
genuinely covered.

If you open these PNGs expecting photographs and find magenta rectangles,
that is the mask, not a broken image.

### What the eye review confirmed, old baseline vs new

| | before (`02278a2b`, 02/08) | after (`09376b4d`) |
|---|---|---|
| story image | a **boxed, inset** rectangle in a ~360px column with a visible mat and offset panel — the framed portrait card | a large block **flush to x=0**, the viewport's inline-end edge in RTL, with the prose column beside it. No frame, no mat |
| bands | none | the wide bread band, inset and rounded; then the offset duo as a two-rectangle step (rear at inline-start, front overlapping at inline-end) |
| desktop height | 5719 px | 8033 px (+2314, consistent with one taller story image plus two new bands) |

The bleed, the signature block, the `01 ·` chapter mark and its gold rule are all
legible in the new desktop frame.

### Two things in these frames that are NOT this change, reported rather than waved away

1. **Most sections below the story are blank cream in both baselines.** The
   scroll-reveal stays at `opacity: 0` in a `fullPage` capture while still
   occupying height. **The old baseline has the identical defect** — checked
   directly, which is the only reason this is stated as pre-existing rather than
   assumed. That is MEH-1514, which MEH-1130's own related-cards list already
   names. Consequence worth knowing: the `/about` VRT covers far less of the page
   than its height suggests.
2. **The chat FAB is visible in the old baseline and absent in the new one.**
   Not a route gate — `/about` is not in `ChatWidgetLazy`'s suppression list
   (that is `/map`, `/producer/[id]`, `/favorites`). It is `next/dynamic` with
   `ssr: false`, so it is a post-hydration chunk whose presence in a `fullPage`
   shot depends on whether it loaded before the capture. **Nothing in this diff
   touches it.** Recorded because it makes that corner of the baseline
   non-deterministic, which is a real if pre-existing fragility — not because it
   is explained.
