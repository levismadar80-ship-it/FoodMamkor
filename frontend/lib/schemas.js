import { z } from "zod";

// Producer from API — lat/lng can be null in the DB (producers registered
// without geocoding). Marked optional/nullable so the schema doesn't reject
// them outright; callers (marker creation, flyTo) guard against null/NaN
// before use.
export const ProducerSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  lat: z.number().finite().nullable().optional(),
  lng: z.number().finite().nullable().optional(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  is_verified: z.boolean().optional(),
  plan: z.string().optional(),
  images: z.array(z.string()).optional().default([]),
});

// Geo search params sent to GET /producers.
// radius_km is capped at 50 to prevent Haversine full-table scans that
// 500 on the backend for very zoomed-out viewports (≥70 km observed).
// boundsToCenterRadius() already clamps at the source; this schema is a
// belt-and-braces safety net in case a future caller bypasses it.
export const GeoSearchSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  radius_km: z
    .number()
    .min(1, "הזיזי את המפה לפני החיפוש")
    .max(50, "הקטיני את מרחק החיפוש — אזור גדול מדי"),
});

// Validated coords before any Leaflet flyTo / marker creation call.
export const CoordSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
});
