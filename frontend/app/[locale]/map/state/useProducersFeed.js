import { useEffect, useState } from "react";

import api from "@/lib/api";
import { showToast } from "@/lib/toast";

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
  const [allProducers, setAllProducers] = useState([]);
  const [categories, setCategories] = useState([]);

  const loadProducers = (params = {}) => {
    api
      .get("/producers", { params })
      .then((r) => setAllProducers(r.data))
      .catch((err) => {
        console.error("[חפשי באזור זה] GET /producers failed:", err);
        setAllProducers([]);
        showToast("לא הצלחנו לטעון עסקים — נסי שוב", "error");
      });
  };

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    loadProducers();
  }, []);

  return { allProducers, setAllProducers, categories, loadProducers };
}
