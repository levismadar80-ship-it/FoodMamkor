"use client";

/**
 * Module:   ListingHubTabs
 * Purpose:  MEH-2859 — the one tab row for everything date-bound at the
 *           businesses: «אירועים» · «חוויות» · «קבוצות רכישה» · «סלי הפתעה».
 *           Four routes render it, so a reader meets the same row wherever she
 *           lands and can reach the other three from any of them.
 * Touches:  nothing directly — the two gated tabs ask their own supply through
 *           lib/use-hub-nav-gate.js, which owns those fetches and their cache.
 * Does NOT: own selection state. `/events` and `/experiences` are two tabs of
 *           ONE client (EventsClient, MEH-2245), so that page flips its own
 *           state on the same tick and this component only says which tab was
 *           meant; every other tab is a plain route change.
 * Related:  hooks/useTabsKeyboard.js (the W3C APG arrow layer, shared),
 *           lib/use-hub-nav-gate.js (the group-buys / rescue supply gates,
 *           MEH-2858), app/[locale]/events/EventsClient.jsx (the one caller
 *           that passes `onSelect` and an `action`).
 * History:  MEH-2859 (creation — lifted out of EventsClient, which held this
 *           row inline for two tabs).
 */

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

import useTabsKeyboard from "@/hooks/useTabsKeyboard";
import { useHubNavGate } from "@/lib/use-hub-nav-gate";

/**
 * Declaration order IS render order (the AC pins it).
 *
 * `local: true` marks the two tabs that belong to the same client, so
 * EventsClient can flip `aria-selected` on the keystroke's own tick before the
 * route catches up. `gate` names the hub whose supply decides whether the tab
 * exists at all — absent, never disabled, the house pattern for every other
 * data-gated nav affordance (Header's experiences link, the Footer's links).
 */
export const HUB_TABS = Object.freeze([
  { value: "events", href: "/events", labelKey: "tab_events", local: true },
  // «חוויות», not «חוויות וסדנאות» — the short form is the TAB ROW's only;
  // the route's own H1 and metadata keep the full name.
  { value: "experiences", href: "/experiences", labelKey: "tab_experiences_short", local: true },
  { value: "groupBuys", href: "/group-buys", labelKey: "tab_group_buys", gate: "groupBuys" },
  { value: "rescue", href: "/rescue", labelKey: "tab_rescue", gate: "rescue" },
]);

/**
 * @param {object}   props
 * @param {string}   props.active    one of HUB_TABS[].value — the route showing
 * @param {function} [props.onSelect] called instead of navigating, for a tab
 *   whose route is the SAME client as the current one (`local`)
 * @param {React.ReactNode} [props.action] the page's own trailing affordance
 *   (e.g. «הוסיפו אירוע»). One element: it sits beside the tabs from md and
 *   wraps below them when the row runs out of width, rather than being a
 *   second copy per breakpoint (frontend.md § One control, one element).
 */
export default function ListingHubTabs({ active, onSelect = null, action = null }) {
  const t = useTranslations("events.list");
  const router = useRouter();
  // Each gate owns one endpoint and fails closed, so an unreachable backend
  // hides the tab rather than offering an empty shelf.
  const gates = { groupBuys: useHubNavGate("groupBuys"), rescue: useHubNavGate("rescue") };

  const tabs = HUB_TABS.filter((tab) => !tab.gate || gates[tab.gate]);

  const go = (value) => {
    if (value === active) return;
    const tab = HUB_TABS.find((candidate) => candidate.value === value);
    if (!tab) return;
    if (onSelect && tab.local) {
      onSelect(value);
      return;
    }
    router.push(tab.href);
  };

  const onKeyDown = useTabsKeyboard(go);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4" data-testid="listing-hub-tabs">
      {/* MEH-916: the trailing link is NOT a tab — a tablist may only own
          role="tab" children (axe aria-required-children), so it stays a
          sibling of the tablist rather than a child.
          MEH-2859: measured at 375, four tabs (283.6px) plus «הוסיפו אירוע»
          (82.4px) need 366px of the 343px available, so the row wraps and the
          action lands on its own line below the tabs. The border moves with
          it: below md the TABLIST carries the rule, so the active tab's
          `-mb-px` underline still meets a line directly beneath it; from md
          the container carries it, exactly as it did before this change. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 md:border-b md:border-border">
        <div
          role="tablist"
          className="flex items-end gap-4 w-full border-b border-border md:w-auto md:border-0"
          onKeyDown={onKeyDown}
        >
          {tabs.map((tab) => {
            const selected = tab.value === active;
            return (
              <button
                key={tab.value}
                role="tab"
                type="button"
                data-tab-value={tab.value}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => go(tab.value)}
                className={`pb-3 pt-2 min-h-touch inline-flex items-center whitespace-nowrap text-sm md:text-base font-semibold border-b-2 -mb-px transition ${
                  selected
                    ? "border-primary text-primary"
                    : "border-transparent text-fg-muted hover:text-primary"
                }`}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
        {action ? <div className="ms-auto self-center md:self-end md:pb-2">{action}</div> : null}
      </div>
    </div>
  );
}
