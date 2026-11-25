// @ts-check
import { primaryPoint } from "@/lib/producer-points";
import { isPriceLabel } from "@/lib/utils";
import { hasDeliverySection } from "@/lib/quick-answers";
import { parseHasLocation } from "../components/ProducerSections";

/**
 * The producer page's section anchor-nav items, in page order (the order
 * ProducerSections renders them — about → products → reviews → delivery →
 * location; MEH-2592 moved reviews ahead of delivery). Each `show` mirrors
 * its section's render gate in ProducerSections.jsx; a pill whose section never renders would be a dead
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
      show: !!producer.description,
    },
    {
      id: "section-products",
      label: t("producer.detail.tabs.products"),
      // ProducerSections: `producer.products?.length > 0 || hasSignature`
      // (hasSignature = top_product_name || a price_range with a digit —
      // PR #3971: «₪₪» alone renders nothing, so it opens no tab).
      show: !!(
        producer.products?.length > 0 ||
        producer.top_product_name ||
        isPriceLabel(producer.price_range)
      ),
    },
    {
      // MEH-2634: gated on reviews_count, like the other four pills. The
      // `#reviews` WRAPPER still always renders (ReviewsSection mounts with
      // the page since MEH-3819 and starts its own read when it is near) — so
      // this is the one item where the pill is deliberately NARROWER than its
      // anchor: pill ⇒ anchor holds (no dead jump, which is what this list
      // exists to prevent), anchor ⇒ pill does not. At zero reviews the
      // section carries only the write hint (ReviewsSection, MEH-2592 + this
      // ticket), which is not a destination worth a pill.
      // SectionAnchorNav.test.jsx encodes that asymmetry explicitly.
      id: "reviews",
      label: t("producer.detail.tabs.reviews_label"),
      show: (producer.reviews_count ?? 0) > 0,
    },
    {
      id: "section-delivery",
      label: t("producer.detail.tabs.delivery"),
      // The same gate the contact card's delivery question jumps on.
      show: hasDeliverySection(producer),
    },
    {
      id: "section-location",
      label: t("producer.detail.sections.location"),
      // MEH-2803: mirrors ProducerSections' location gate, now hasLocation only
      // — store hours live in the «שעות» section, which has no pill.
      show: !!parseHasLocation(producer, primaryPoint(producer)),
    },
  ];
}
