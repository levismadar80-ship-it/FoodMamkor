"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CaretDown, Lifebuoy, MagnifyingGlass } from "@phosphor-icons/react";
import { HELP_GROUPS, HELP_TOPICS, topicMatches } from "./topics";

/**
 * /admin/help — «איך עושים…» (MEH-2591; replaces the MEH-21 handbook).
 *
 * Purpose:  Answer one admin task at a time: a searchable list of questions,
 *           grouped like the sidebar, each opening into a few short steps and
 *           a link to the screen where the task is done. Pattern: task-based,
 *           searchable, concise help (NN/g heuristic 10; Shopify / Stripe
 *           in-admin help), not a per-screen manual.
 * States:   search → 0 matches (no-results line) / 1 (that topic opens) /
 *           many; each topic closed / open, one open at a time. `#<topic id>`
 *           in the URL opens that topic, so other screens can deep-link here.
 * Does NOT: hold infrastructure runbooks or credentials — those live in
 *           docs/ACCESS.md + docs/DEPLOYMENT.md (ADR-035, one home per fact).
 */
export default function AdminHelpPage() {
  const t = useTranslations("admin");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  // Deep link: /admin/help#kashrut opens and scrolls to that topic, on load
  // and when the hash changes while the page is open.
  useEffect(() => {
    const fromHash = () => {
      let id;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return; // malformed hash (e.g. #%E0%A4%A) — ignore, never crash
      }
      if (!HELP_TOPICS.some((topic) => topic.id === id)) return;
      setQuery("");
      setOpenId(id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const topics = HELP_TOPICS.map((topic) => ({
    ...topic,
    question: t(`help.topics.${topic.id}.q`),
    steps: t.raw(`help.topics.${topic.id}.steps`),
  }));
  const matches = topics.filter((topic) => topicMatches(topic.question, topic.steps, query));

  // A search that narrows to one topic has answered the question — open it.
  // Done on input rather than derived, so the admin can still close it.
  const onSearch = (value) => {
    setQuery(value);
    const found = topics.filter((topic) => topicMatches(topic.question, topic.steps, value));
    if (value.trim() && found.length === 1) setOpenId(found[0].id);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Lifebuoy size={28} weight="fill" className="text-primary shrink-0" aria-hidden="true" />
        <h1 className="text-2xl font-bold">{t("layout.nav.help")}</h1>
      </div>
      <p className="text-sm text-muted mb-4">{t("help.intro")}</p>

      <label className="relative block mb-6">
        <span className="sr-only">{t("help.search_label")}</span>
        <MagnifyingGlass
          size={18}
          className="absolute top-1/2 -translate-y-1/2 start-3 text-muted pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("help.search_placeholder")}
          className="w-full bg-white border border-border rounded-[12px] ps-10 pe-3 py-2.5 text-base"
        />
      </label>

      {matches.length === 0 ? (
        <p className="text-sm text-muted" role="status">{t("help.no_results")}</p>
      ) : (
        <div className="space-y-6">
          {HELP_GROUPS.map((group) => {
            const inGroup = matches.filter((topic) => topic.group === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group} aria-labelledby={`help-group-${group}`}>
                <h2 id={`help-group-${group}`} className="text-xs font-semibold text-muted mb-2">
                  {t(`layout.nav_sections.${group}`)}
                </h2>
                <ul className="bg-white border border-border rounded-[12px] divide-y divide-border">
                  {inGroup.map((topic) => (
                    <Topic
                      key={topic.id}
                      topic={topic}
                      open={openId === topic.id}
                      onToggle={() => setOpenId(openId === topic.id ? null : topic.id)}
                      openScreenLabel={t("help.open_screen")}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Topic({ topic, open, onToggle, openScreenLabel }) {
  const panelId = `${topic.id}-panel`;
  const List = topic.list === "ol" ? "ol" : "ul";
  return (
    <li id={topic.id} className="scroll-mt-36">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="w-full flex items-center justify-between gap-3 text-start px-4 py-3 min-h-[48px] font-medium"
      >
        <span>{topic.question}</span>
        <CaretDown
          size={16}
          weight="bold"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4 text-sm leading-relaxed">
          <List className={`${List === "ol" ? "list-decimal" : "list-disc"} ps-5 space-y-1.5`}>
            {topic.steps.map((step, i) => (
              // Static copy list: the index is a stable key, and two identical
              // steps in one topic would collide on the text.
              <li key={i}>{step}</li>
            ))}
          </List>
          <Link
            href={topic.href}
            className="inline-flex items-center mt-3 min-h-[44px] text-primary font-medium hover:underline"
          >
            {openScreenLabel}
          </Link>
        </div>
      )}
    </li>
  );
}
