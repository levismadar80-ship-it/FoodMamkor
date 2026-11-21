// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { splitSiteLinks } from "@/lib/site-pages";

/**
 * ChatMessageText — an assistant answer with its site paths as links.
 *
 * The model writes a page as its path (backend/app/site_pages.py tells it
 * which); this swaps each known path for a link labelled with the page's name.
 * Unknown paths stay text (lib/site-pages.js). 20/11: «מחירון» had no link.
 *
 * @param {{ text: string }} props
 */
export default function ChatMessageText({ text }) {
  const t = useTranslations("chat.pages");
  return (
    <>
      {splitSiteLinks(text).map((part, i) =>
        part.type === "link" ? (
          <Link
            key={i}
            href={part.href}
            className="underline underline-offset-2 text-primary font-medium"
            data-testid="chat-site-link"
          >
            {t(part.key)}
          </Link>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}
