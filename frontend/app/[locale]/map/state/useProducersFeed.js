import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { ProducersResponseSchema } from "@/lib/schemas";

/**
 * Owns the /map page's network feed: the producer list, the category
 * list, and the loadProducers helper that refetches with chip params.
 *
 * Verbatim extraction from MapClient.jsx:39-40 (state),
 * :129-133 (initial fetch effect that hydrates both producers and
 * categories), :217-227 (loadProducers helper with toast on error).
 *
 * The geo-search refetch in handleSearchThisArea (useMapSync) does
 * NOT route through loadProducers — it calls api.get("/producers", …)
 * directly because it needs to bypass the toast-on-error flow when
 * the geo bounds are degenerate. This is preserved verbatim from the
 * source (:423-426).
 */
export function useProducersFeed() {
  const t = useTranslations();
  const [allProducers, setAllProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  // MEH-1054 (MAP-16): additive loading flag so the bottom sheet can render
  // a skeleton instead of flashing "0 businesses" on first paint. Starts
  // true — the mount effect fires loadProducers immediately. NOTE: the
  // geo-search refetch in useMapSync bypasses loadProducers (documented
  // above) and deliberately does NOT toggle this flag — MAP-16 covers the
  // initial-load flicker, not area re-queries over an already-drawn list.
  const [loading, setLoading] = useState(true);
  // MEH-2170: the mount catalog, captured ONCE from the first fetch — the
  // only request that is both unfiltered and not viewport-bounded. Never
  // overwritten by a toggle reload (loadProducers with chip params) or by the
  // geo-search refetch in useMapSync (which bypasses loadProducers anyway).
  // null until that first fetch resolves; consumers treat null as "unknown"
  // and gate nothing. See lib/map-chips.js visibleMapToggleChips.
  const [catalogSnapshot, setCatalogSnapshot] = useState(null);

  // MEH-779: a malformed payload degrades to the same state as a network
  // failure — empty list + toast — so the map never crashes on bad data.
  const handleLoadFailure = (reason) => {
    console.error("[חפשי באזור זה] GET /producers failed:", reason);
    setAllProducers([]);
    showToast.error(t("map.errors.load_failed"));
  };

  const loadProducers = (params = {}, { snapshot = false } = {}) => {
    setLoading(true);
    api
      .get("/producers", { params })
      .then((r) => {
        // Rule-19 belt-and-braces on the response side: validate the shape
        // before it reaches marker creation / the feed list.
        const parsed = ProducersResponseSchema.safeParse(r.data);
        if (!parsed.success) {
          handleLoadFailure(parsed.error.issues);
          return;
        }
        setAllProducers(parsed.data);
        // MEH-2170: only the mount call asks for the snapshot; a failed or
        // malformed first load leaves it null (no gating), by design.
        if (snapshot) setCatalogSnapshot(parsed.data);
      })
      .catch(handleLoadFailure)
      // MEH-1054: every terminal path (data / malformed / network error)
      // clears loading — the failure states already render their own UX
      // (empty list + toast), the skeleton must not stick over them.
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    loadProducers({}, { snapshot: true });
  }, []);

  return {
    allProducers,
    setAllProducers,
    categories,
    loadProducers,
    loading,
    catalogSnapshot,
  };
}
