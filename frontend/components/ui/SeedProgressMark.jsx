// @ts-check
import { SEED_FILLS, SEED_PATH } from "@/lib/brand-seeds";

/**
 * Module:   SeedProgressMark
 * Purpose:  Progress drawn in the logo's seeds — group buys (joined toward the
 *           group price) and surprise bags (bags still available today).
 * Does NOT: write any text; callers put the count beside it.
 * Related:  app/[locale]/producer/[id]/components/ProducerActivities.jsx
 *           (re-export) · components/rescue/RescueSection.jsx
 * History:  MEH-2827 PR 7 (creation, in ProducerActivities) · MEH-3585 (moved
 *           here so components/ need not import a route file; `label=null`)
 */

/** @param {string|null|undefined} label */
function a11y(label) {
  return label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
}

// MEH-2827 PR 7: progress toward the group price, drawn in the logo's seeds.
// Up to SEEDS_MAX participants → one seed each, filled in the logo colours in
// order; more → five segments, each a fifth of the target, the current one
// partly filled. One mark for the business-page card and the group-buy page.
// The five fixed petal colours of public/logo.svg, in logo order (MEH-2833:
// from the seed layer's one source, lib/brand-seeds.js).
const SEED_COLORS = SEED_FILLS;
const SEEDS_MAX = 10;
const BAR_SEGMENTS = 5;
// lg seeds shrink to fit (max 30×46): ten of them at 30px would need 336px,
// and the progress box is ~280px wide at 375.
const MARK_SIZE = {
  sm: { seed: [13, 20], seeds: "gap-0.5", bar: "gap-[3px]", segment: "h-1.5 w-3.5" },
  lg: { seed: null, seeds: "gap-1 w-full", bar: "gap-1 w-full", segment: "h-3 flex-1" },
};
// On the group page, up to this many seeds sit beside the count; more go
// under it, full width, like the bar.
export const SEEDS_BESIDE_TEXT = 5;

/**
 * @param {object} props
 * @param {number} props.commits
 * @param {number} props.min      the target (min_participants)
 * @param {boolean} [props.funded] all filled once the group price opened
 * @param {string|null} [props.label] accessible name (progress_label); null →
 *   decorative (aria-hidden), for when the same words sit visibly beside it
 * @param {"sm"|"lg"} [props.size]
 */
export function GroupBuyProgressMark({ commits, min, funded = false, label, size = "sm" }) {
  const target = Math.max(0, Number(min) || 0);
  const got = funded ? target : Math.min(Math.max(0, Number(commits) || 0), target);
  const s = MARK_SIZE[size] ?? MARK_SIZE.sm;
  if (target === 0) return null;

  if (target <= SEEDS_MAX) {
    const [w, h] = s.seed ?? ["100%", undefined];
    return (
      <span {...a11y(label)} data-testid="gb-progress-seeds" className={`flex items-end ${s.seeds}`}>
        {Array.from({ length: target }, (_, i) => (
          <svg
            key={i}
            width={w}
            height={h}
            viewBox="-14 -46 28 42"
            aria-hidden="true"
            data-filled={i < got ? "true" : "false"}
            className={s.seed ? undefined : "min-w-0 flex-1 max-w-[30px]"}
          >
            {i < got ? (
              <>
                <path d={SEED_PATH} fill={SEED_COLORS[i % SEED_COLORS.length]} />
                {size === "lg" && <ellipse cx="-3" cy="-32" rx="2.5" ry="6" className="fill-background" opacity="0.35" />}
              </>
            ) : (
              <path d={SEED_PATH} fill="none" className="stroke-primary" strokeOpacity="0.5" strokeWidth="3" strokeDasharray="5 4" />
            )}
          </svg>
        ))}
      </span>
    );
  }

  const per = target / BAR_SEGMENTS;
  return (
    <span {...a11y(label)} data-testid="gb-progress-bar" className={`flex ${s.bar}`}>
      {Array.from({ length: BAR_SEGMENTS }, (_, i) => {
        const fill = Math.round(Math.max(0, Math.min(1, (got - i * per) / per)) * 100);
        return (
          <span key={i} className={`block overflow-hidden rounded-full bg-border ${s.segment}`}>
            <span className="block h-full rounded-full" data-fill={fill} style={{ width: `${fill}%`, background: SEED_COLORS[i] }} />
          </span>
        );
      })}
    </span>
  );
}

