import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";

import api from "@/lib/api";
import { ProducerDetailSchema } from "@/lib/schemas";
import { pushRecentlyViewed } from "@/lib/recently-viewed";

// MEH-1888: `.loose()` is MANDATORY here, not stylistic.
//
// `z.object` strips unknown keys by default, and ProducerDetailSchema declares
// 51 of ProducerDetailOut's 81 fields (measured 03/08/2026). A plain
// `.safeParse()` whose result reached `setProducer` would therefore DELETE 30
// fields from the object this page renders — including six the tree reads
// today: `established_year` (ProducerHeader.jsx:241), `products`
// (ProducerSections.jsx:112), `contact_name` + `owner_bio` (OwnerCard.jsx:31,
// :35), and `whatsapp_group` + `order_window` (ContactCard.jsx:125, :252).
//
// That is exactly the MEH-901 class this validation exists to prevent, and
// `lib/api-schemas.js:68-92` documents the same trap with a measurement:
// `ProducerSchema.parse` on a 12-key card fixture kept 2 (MEH-1713).
// `.loose()` is the Zod-4 spelling of `.passthrough()` — declared fields are
// validated, undeclared ones are kept.
//
// It returns a NEW schema and does not mutate ProducerDetailSchema, so the
// grid and /map keep their deliberate all-or-nothing stripping parse.
const ProducerDetailLoose = ProducerDetailSchema.loose();

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
  // MEH-1146 chunk C: discovery loop — more businesses in the same area (city).
  const [nearbyProducers, setNearbyProducers] = useState([]);

  useEffect(() => {
    if (initialProducer) return;
    const path = fetchPath || `/producers/${params.id}`;
    api
      .get(path)
      .then((r) => {
        // MEH-1888: this is the fetch that feeds the RENDERED tree — page.js:73
        // renders <ProducerDetail /> with no props, so `initialProducer` is
        // null and the server fetch feeds only JSON-LD and metadata
        // (docs/audits/producer-detail-page-validation.md §0). Validation
        // therefore has to happen here, and it must not cost the visitor a
        // single field.
        const parsed = ProducerDetailLoose.safeParse(r.data);
        if (!parsed.success) {
          Sentry.captureMessage("Producer detail payload failed schema validation", {
            level: "warning",
            extra: { path, issues: parsed.error.issues },
          });
        }
        // On failure, the RAW response. A schema mismatch must never cost the
        // visitor the page — the report is for the operator, not a gate.
        setProducer(parsed.success ? parsed.data : r.data);
      })
      .catch((err) => {
        // Was `.catch(() => setProducer(null))` — same behaviour, no longer
        // silent (audit §1, "בליעה שקטה נוספת").
        Sentry.captureException(err, { extra: { path } });
        setProducer(null);
      })
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

  // MEH-1146 chunk C: discovery loop — fetch more businesses in the same city
  // (the "area" dimension, distinct from the category-based similarProducers).
  // REUSES: backend/app/routers/producers.py:49 (GET /producers city+exclude
  // params). The >= MIN_NEARBY_BUSINESSES render gate lives in ProducerSections.
  useEffect(() => {
    if (!producer?.id || !producer?.city) return;
    api
      .get("/producers", { params: { city: producer.city, exclude: producer.id, limit: 12 } })
      .then((r) => setNearbyProducers(Array.isArray(r.data) ? r.data : []))
      .catch(() => setNearbyProducers([]));
  }, [producer?.id, producer?.city]);

  return { producer, loading, events, similarProducers, nearbyProducers };
}
