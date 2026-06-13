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

  // MEH-779: a malformed payload degrades to the same state as a network
  // failure — empty list + toast — so the map never crashes on bad data.
  const handleLoadFailure = (reason) => {
    console.error("[חפשי באזור זה] GET /producers failed:", reason);
    setAllProducers([]);
    showToast.error(t("map.errors.load_failed"));
  };

  const loadProducers = (params = {}) => {
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
      })
      .catch(handleLoadFailure);
  };

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    loadProducers();
  }, []);

  return { allProducers, setAllProducers, categories, loadProducers };
}
