import { useEffect, useState } from "react";

import api from "@/lib/api";
import { pushRecentlyViewed } from "@/lib/recently-viewed";

/**
 * Owns the producer-page network surface — initial producer fetch,
 * recently-viewed localStorage write, events list, and similar-producers
 * carousel feed. Verbatim extraction from ProducerDetail.jsx:90-98 +
 * :133-136 + :138-144 + :147-158, with effect declaration order
 * preserved so the network call sequence is unchanged.
 *
 * Effects fire in this order (same as pre-refactor):
 *   1. Producer fetch (gated on !initialProducer)
 *   2. pushRecentlyViewed(producer.id)
 *   3. /events?producer_id=<id>
 *   4. /producers?category=<id>&exclude=<id>&limit=3
 *
 * The two IntersectionObserver effects from the same source file
 * (StickyBar + LazyReviews) do NOT live here — see useStickyBar +
 * useLazyReviews. They depend on producer.id but not on the data this
 * hook returns, so cross-hook ordering shifts are functionally inert.
 */
export function useProducerData({ params, fetchPath, initialProducer }) {
  const [producer, setProducer] = useState(initialProducer);
  const [loading, setLoading] = useState(!initialProducer);
  const [events, setEvents] = useState([]);
  const [similarProducers, setSimilarProducers] = useState([]);

  useEffect(() => {
    if (initialProducer) return;
    const path = fetchPath || `/producers/${params.id}`;
    api
      .get(path)
      .then((r) => setProducer(r.data))
      .catch(() => setProducer(null))
      .finally(() => setLoading(false));
  }, [params.id, fetchPath, initialProducer]);

  // Task 13: save to recently viewed in localStorage. Storage shape +
  // 7-day TTL live in lib/recently-viewed.js (MEH-11) so the homepage
  // read site and this write site can't drift.
  useEffect(() => {
    if (!producer?.id) return;
    pushRecentlyViewed(producer.id);
  }, [producer?.id]);

  useEffect(() => {
    if (!producer?.id) return;
    api
      .get(`/events?producer_id=${producer.id}`)
      .then((r) => setEvents(r.data || []))
      .catch(() => setEvents([]));
  }, [producer?.id]);

  // MEH-102: fetch similar producers (same first category, excluding self)
  useEffect(() => {
    if (!producer?.id || !producer?.categories?.length) return;
    const catId = producer.categories[0]?.id;
    if (!catId) return;
    api
      .get("/producers", { params: { category: catId, exclude: producer.id, limit: 3 } })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setSimilarProducers(list.length >= 3 ? list.slice(0, 3) : []);
      })
      .catch(() => setSimilarProducers([]));
  }, [producer?.id, producer?.categories]);

  return { producer, loading, events, similarProducers };
}
