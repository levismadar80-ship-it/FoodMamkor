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
 *
 * @param {{ text: string, onNavigate?: () => void }} props
 */
export default function OwnerAssistantText({ text, onNavigate }) {
  const tOwner = useTranslations("owner_assistant.pages");
  const tAnchor = useTranslations("owner_assistant.anchors");
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
    p.ns === "owner" ? tOwner(p.key) : p.ns === "anchor" ? tAnchor(p.key) : tSite(p.key);
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
