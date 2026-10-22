import { Info, Package, Truck, ChatCircleText, MapPin } from "@phosphor-icons/react";
import { resolveStoreHours } from "@/lib/hours";
import { primaryPoint } from "@/lib/producerPoints";
import { parseHasLocation } from "../components/ProducerSections";

/**
 * The producer page's section anchor-nav items, in page order (the order
 * ProducerSections renders them — about → products → delivery → reviews →
 * location). Each `show` mirrors its section's render gate in
 * ProducerSections.jsx; a pill whose section never renders would be a dead
 * jump. `SectionAnchorNav.test.jsx` asserts every gate here against the REAL
 * ProducerSections render (pill shown ⇔ `#id` in the DOM), so a gate changed
 * on one side only goes red instead of drifting silently.
 *
 * Labels reuse existing, already-shipped strings — no new copy (rule 22):
 * the four `producer.detail.tabs.*` labels of the tab bar this nav replaced,
 * and the location section's own heading.
 *
 * @param {object} producer
 * @param {(key: string) => string} t  root-scoped next-intl translator
 */
export function getSectionNavItems(producer, t) {
  return [
    {
      id: "section-bio",
      label: t("producer.detail.tabs.about"),
      Icon: Info,
      show: !!producer.description,
    },
    {
      id: "section-products",
      label: t("producer.detail.tabs.products"),
      Icon: Package,
      // ProducerSections: `producer.products?.length > 0 || hasSignature`
      // (hasSignature = top_product_name || price_range).
      show: !!(
        producer.products?.length > 0 ||
        producer.top_product_name ||
        producer.price_range
      ),
    },
    {
      id: "section-delivery",
      label: t("producer.detail.tabs.delivery"),
      Icon: Truck,
      show: !!(
        producer.offers_delivery ||
        producer.delivery_areas?.length > 0 ||
        producer.pickup_points
      ),
    },
    {
      // The reviews wrapper always renders (it is the lazy-load IO point), so
      // this pill is unconditional — the row is never empty.
      id: "reviews",
      label: t("producer.detail.tabs.reviews_label"),
      Icon: ChatCircleText,
      show: true,
    },
    {
      id: "section-location",
      label: t("producer.detail.sections.location"),
      Icon: MapPin,
      show: !!(parseHasLocation(producer, primaryPoint(producer)) || resolveStoreHours(producer)),
    },
  ];
}
