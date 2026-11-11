/**
 * Module:   map-city-params
 * Purpose:  /map's city → GET /producers param, in one place.
 *
 * MEH-2602: «סננו לפי עיר» asks "what is there for this city" — located in it
 * OR delivering to it, located first (near_city). With the משלוח chip on the
 * question is "who delivers here", so it keeps delivery_city.
 *
 * MEH-2049: shared by useMapFilters.buildParams and useProducersFeed's first
 * fetch (a city from the URL), so the two cannot map a city to different
 * params. /producers maps its own `?city=` differently (always delivery_city),
 * which is why this lives with /map and not in lib/filter-url.
 *
 * Returns `{}` when there is no city.
 */
export function cityParams(city, hasDelivery) {
  if (!city) return {};
  return hasDelivery ? { delivery_city: city } : { near_city: city };
}
