// @ts-check
"use client";

/**
 * Module:   admin/copy/CopyScreenClient
 * Purpose:  MEH-3672 (item 6 of MEH-3652). Every string in he.json, one
 *           collapsible block per group, each saying which screens read it.
 *           Search over the text and the key, and a screen filter.
 * Does NOT: edit copy — the text lives in frontend/messages/he.json and is
 *           changed in code. It does not fetch: the page passes the messages
 *           and the generated index in.
 * Related:  copy-filter.js (the filtering), scripts/build-copy-screens.mjs
 *           (where the screen list comes from).
 * History:  MEH-3672 (creation).
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import { filterCopy } from "./copy-filter";

const SCREENS_SHOWN = 6;

/** @param {{ screens: string[], all: number }} props */
function ScreensLine({ screens, all }) {
  const t = useTranslations("admin.copy");
  if (screens.length === 0) return <span>{t("no_screen")}</span>;
  if (screens.length === all)
    return (
      <span>
        {t("shown_on")} {t("every_screen")}
      </span>
    );
  const head = screens.slice(0, SCREENS_SHOWN).join(" · ");
  const more = screens.length - SCREENS_SHOWN;
  return (
    <span>
      {t("shown_on")}{" "}
      <span dir="ltr" className="inline-block">
        {head}
      </span>
      {more > 0 && <> {t("more_screens", { count: more })}</>}
    </span>
  );
}

/** @param {{ group: { name: string, screens: string[], count: number, rows: { key: string, value: string }[] }, all: number, open: boolean }} props */
function GroupBlock({ group, all, open }) {
  const t = useTranslations("admin.copy");
  // Rows are drawn only while the block is open: closed, the whole file is
  // 83 summaries instead of ~6,000 list items.
  const [isOpen, setIsOpen] = useState(open);
  return (
    <details
      open={open}
      onToggle={(e) =>
        setIsOpen(/** @type {HTMLDetailsElement} */ (e.currentTarget).open)
      }
      className="rounded-md border border-border bg-surface"
      data-testid="copy-group"
    >
      <summary className="cursor-pointer px-4 py-3 flex flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span dir="ltr" className="inline-block font-mono font-semibold">
            {group.name}
          </span>
          <span className="text-sm text-muted">
            {t("count", { count: group.count })}
          </span>
        </span>
        <span className="text-xs text-muted">
          <ScreensLine screens={group.screens} all={all} />
        </span>
      </summary>
      {(isOpen || open) && (
        <ul className="divide-y divide-border border-t border-border">
          {group.rows.map((r) => (
            <li key={r.key} className="px-4 py-2 flex flex-col gap-0.5">
              <span
                dir="ltr"
                className="font-mono text-xs text-muted break-all text-end"
              >
                {r.key}
              </span>
              <span className="whitespace-pre-wrap break-words">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** @param {{ messages: Record<string, unknown>, index: { screens: string[], groups: Record<string, string[]> } }} props */
export default function CopyScreenClient({ messages, index }) {
  const t = useTranslations("admin.copy");
  const [query, setQuery] = useState("");
  const [screen, setScreen] = useState("");
  const result = useMemo(
    () =>
      filterCopy(messages, index, { query, screen, cap: query.trim() !== "" }),
    [messages, index, query, screen],
  );
  const all = index.screens.length;
  const filtering = query.trim() !== "" || screen !== "";

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </header>
      <div className="flex flex-col gap-3 md:flex-row">
        <Input
          type="search"
          size="sm"
          aria-label={t("search")}
          placeholder={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Select
          size="sm"
          aria-label={t("all_screens")}
          value={screen}
          onChange={(e) => setScreen(e.target.value)}
        >
          <option value="">{t("all_screens")}</option>
          {index.screens.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {result.drawn < result.total
          ? t("shown_of", { shown: result.drawn, count: result.total })
          : t("count", { count: result.total })}
      </p>
      {result.groups.length === 0 ? (
        <EmptyState size="sm" title={t("empty")} />
      ) : (
        <div className="space-y-3">
          {result.groups.map((g) => (
            <GroupBlock
              key={g.name}
              group={g}
              all={all}
              open={filtering || result.groups.length === 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
