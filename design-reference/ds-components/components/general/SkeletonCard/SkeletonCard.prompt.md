SkeletonCard from mehamakor-frontend. Use via `window.MehamakorDS.SkeletonCard` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<DSProvider>` (full provider chain in README.md — components read theme/i18n from that context).

Shimmer skeleton placeholder. Use in place of a spinner while fetching
lists of cards. The shimmer animation is keyframed inline so we don't
depend on tailwind config edits.
