// @ts-check
"use client";
/**
 * Module:   ToolGroupCard
 * Purpose:  One «כלים» card for a group of tools (MEH-3669): «אירועים» holds
 *           events + experiences, «הזדמנויות» group buys + surprise bags —
 *           the same split the bottom nav shows customers. With two or more
 *           tools the card opens in place to a row per tool; with one tool it
 *           is a plain link to it, so nobody opens a card to find one row.
 * Does NOT: decide which tools a group holds or their hrefs — the tools page
 *           passes them, so the hrefs stay written in that page file, where
 *           DashboardPlacementGuard counts them. That guard counts links,
 *           not presses: a tool inside a closed card is tab + open + row = 3
 *           presses, 2 page loads (a tool alone in its group stays 2).
 * Related:  app/[locale]/producer/dashboard/tools/page.js (the groups);
 *           components/producer/NewToolPill.jsx (one pill for the group).
 * History:  MEH-3669 (creation).
 */
import { useId, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import NewToolPill from "@/components/producer/NewToolPill";

/**
 * @typedef {{ href: string, title: string, sub: string }} ToolItem
 * @typedef {{ testId: string, Icon: import("react").ElementType, title: string, sub: string, items: ToolItem[], footer?: import("react").ReactNode }} GroupProps
 */

const CARD = "bg-surface border border-border rounded-lg p-5 hover:border-primary transition";
const TITLE = "font-headline-md text-lg font-bold mb-1";

/** @param {{ Icon: import("react").ElementType, title: string, sub: string, pill: string | string[] }} props */
function Head({ Icon, title, sub, pill }) {
  return (
    <>
      <Icon size={24} className="text-primary mb-2" aria-hidden="true" />
      <span className={`block ${TITLE}`}>{title}<NewToolPill href={pill} /></span>
      <span className="block text-sm text-fg-muted">{sub}</span>
    </>
  );
}

/** @param {{ items: ToolItem[], id: string }} props */
function Rows({ items, id }) {
  return (
    <ul id={id} className="mt-3 border-t border-border">
      {items.map((item) => (
        <li key={item.href} className="border-b border-border last:border-b-0">
          <Link href={item.href} className="block py-3 min-h-touch hover:text-primary">
            <span className="block font-semibold">{item.title}<NewToolPill href={item.href} /></span>
            <span className="block text-sm text-fg-muted">{item.sub}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** @param {GroupProps} props */
export default function ToolGroupCard({ testId, Icon, title, sub, items, footer }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hrefs = items.map((i) => i.href);

  if (items.length === 1) {
    return (
      <div data-testid={testId}>
        <Link href={items[0].href} className={`block ${CARD}`}>
          <Head Icon={Icon} title={title} sub={sub} pill={hrefs} />
          {footer}
        </Link>
      </div>
    );
  }

  return (
    <div data-testid={testId} className={CARD}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="w-full text-start flex items-center gap-3"
      >
        <span className="flex-1">
          <Head Icon={Icon} title={title} sub={sub} pill={open ? [] : hrefs} />
        </span>
        <CaretDown
          size={20}
          aria-hidden="true"
          className={`text-primary shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {footer}
      {open && <Rows items={items} id={panelId} />}
    </div>
  );
}
