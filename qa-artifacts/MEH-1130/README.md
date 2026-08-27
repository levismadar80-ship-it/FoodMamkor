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
