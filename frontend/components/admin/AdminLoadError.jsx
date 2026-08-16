"use client";

import { useTranslations } from "next-intl";

/**
 * AdminLoadError — a failed admin fetch, rendered as a failure.
 *
 * Purpose:  make "the request failed" visually and semantically distinct from
 *           "there is nothing here". Before MEH-2096 eight admin fetches
 *           collapsed the two: `.catch(() => setX([]))` rendered the ordinary
 *           empty state, so a dead API looked exactly like an empty queue.
 * Does NOT: retry on its own, back off, or own any fetch. The caller keeps its
 *           own `loadError` flag and re-fires its own request via `onRetry` —
 *           there is deliberately no retry library and no global boundary here.
 * Related:  components/ProductsSection.jsx:392 (MEH-1261 F1, the consumer-side
 *           precedent this mirrors: role="alert" card + a retry control).
 *           app/[locale]/admin/settings/page.js:65 and
 *           app/[locale]/admin/analytics/page.js:22 already used a `loadError`
 *           flag — this is that pattern, made reusable and given a retry.
 * History:  MEH-2096 (creation).
 *
 * The pending-producers queue is the case that motivated it: manual approval of
 * every business is a locked product invariant, so a queue that renders "no
 * businesses waiting" when the API is down means real businesses wait unseen.
 *
 * Copy is deliberately REUSED, not minted: `admin.common.error_loading` and
 * `error.retry` are both existing approved strings, so this ships no new Hebrew
 * copy and needs no copy ruling.
 */
export default function AdminLoadError({ onRetry, testId = "admin-load-error", message }) {
  const t = useTranslations();
  return (
    <div
      role="alert"
      data-testid={testId}
      className="border border-border rounded-[10px] p-4 bg-red-50 text-center"
    >
      <p className="text-sm text-text mb-2">{message ?? t("admin.common.error_loading")}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          data-testid={`${testId}-retry`}
          className="text-sm text-primary font-medium hover:underline"
        >
          {t("error.retry")}
        </button>
      )}
    </div>
  );
}
