// @ts-check
"use client";

/**
 * Module:   OwnerAssistantText
 * Purpose:  One owner-assistant answer, with the dashboard screens, edit cards
 *           and site pages it names turned into links.
 * Does NOT: decide which paths are real (lib/owner-pages.js does).
 * History:  owner assistant (26/11, MEH-3902).
 */

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { openEditCard, splitOwnerLinks } from "@/lib/owner-pages";

/**
 * OwnerAssistantText — an assistant answer with its dashboard paths (and
 * edit-card anchors, and site pages) as links.
 *
 * Does NOT: decide which paths are real (lib/owner-pages.js does; an unknown
 * path stays text). The site chat's twin is components/ChatMessageText.jsx.
 */

// Labels another surface already owns: read from there, not copied
// (messages-hygiene-guard, MEH-3657). Dashboard screens with no heading
// elsewhere live in owner_assistant.pages.
const SHARED_PAGES = /** @type {Record<string, string>} */ ({
  overview: "dashboard.producer.nav.overview",
  insights: "dashboard.producer.nav.insights",
  tools: "dashboard.producer.nav.tools",
  orders: "dashboard.producer.nav.orders",
  reviews: "dashboard.producer.quick_links.reviews.title",
  recipes: "business_features.items.recipes.tile_title",
  events: "chat.pages.events",
  rescue: "chat.pages.rescue",
  experiences: "chat.pages.experiences",
  group_buys: "chat.pages.group_buys",
  offer: "producer.offer.card_title",
});
const SHARED_ANCHORS = /** @type {Record<string, string>} */ ({
  images: "dashboard.producer.images.heading",
  bio: "dashboard.producer.description_card.heading",
  tags: "dashboard.producer.tags.heading",
  "owner-story": "dashboard.producer.owner_story.heading",
  locations: "settings.locations.section_heading",
  products: "settings.products.section_heading",
  license: "admin.producers.verified.doc_license",
  kashrut: "admin.producers.review.evidence.kashrut",
  hours: "producer.detail.hours.heading",
  delivery: "group_buys.delivery.heading",
  questions: "diet_pages.faq_heading",
  categories: "admin.producers.table.columns.categories",
  "contact-channels": "chat.pages.contact",
});

/** @param {{ text: string, onNavigate?: () => void }} props */
export default function OwnerAssistantText({ text, onNavigate }) {
  const t = useTranslations();
  const tOwner = useTranslations("owner_assistant.pages");
  const tSite = useTranslations("chat.pages");
  const pathname = usePathname();
  // A card on the screen she is already on opens through openEditCard.
  const onClick = (/** @type {any} */ e, /** @type {{ ns: string, href: string }} */ p) => {
    const [path, anchor] = p.href.split("#");
    if (p.ns === "anchor" && path === pathname) {
      e.preventDefault();
      openEditCard(anchor);
    }
    onNavigate?.();
  };
  const label = (/** @type {{ ns: string, key: string }} */ p) =>
    p.ns === "owner" && SHARED_PAGES[p.key] ? t(SHARED_PAGES[p.key])
      : p.ns === "anchor" ? t(SHARED_ANCHORS[p.key])
      : p.ns === "owner" ? tOwner(p.key) : tSite(p.key);
  return (
    <>
      {splitOwnerLinks(text).map((part, i) =>
        part.type === "link" ? (
          <Link
            key={i}
            href={part.href}
            onClick={(e) => onClick(e, part)}
            className="underline underline-offset-2 text-primary font-medium"
            data-testid="owner-assistant-link"
          >
            {label(part)}
          </Link>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}
