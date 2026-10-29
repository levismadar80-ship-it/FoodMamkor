"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Heart, HeartStraight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { FavoriteWithProducerSchema } from "@/lib/api-schemas";
import {
  ensureFavoritesLoaded,
  isFavorited,
  subscribeFavorites,
} from "@/lib/favorites-cache";
import { ensureSavedLoaded, isSaved, subscribeSaved } from "@/lib/saved-cache";
import ProducerCard from "@/components/ProducerCard";
import AlertPrefsPanel from "@/components/AlertPrefsPanel";
import Breadcrumb from "@/components/Breadcrumb";
import ChipScrollRow from "@/components/ChipScrollRow";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import EventEntryRow, { toEventEntry } from "@/components/EventEntryRow";
import RecipeCard from "@/components/public/RecipeCard";
import SaveButton from "@/components/SaveButton";
import { EMPTY_SAVED, loadSavedItems, splitByTime } from "./savedItems";

// MEH-2560: the chips, in order. "all" mixes every type in sections headed by
// the same labels; the others show one type.
const FILTERS = ["all", "businesses", "events", "experiences", "recipes"];

function FavoriteCardWrapper({ fav, open, onToggle, onClose }) {
  const t = useTranslations("favorites");
  const bellRef = useRef(null);
  const panelRef = useRef(null);

  // MEH-1359: reuse the Popover dismissal contract (Esc + outside-click) so the
  // floating panel closes like every other overlay. Esc returns focus to the
  // bell; outside-click deliberately excludes the bell (its own onClick owns the
  // toggle) so a tap on the bell doesn't close-then-reopen.
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (!panelRef.current?.contains(e.target) && !bellRef.current?.contains(e.target)) {
        onClose();
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        bellRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  return (
    // MEH-1142: h-full + flex-col so the card fills the grid cell (equal row
    // heights). MEH-1359: the AlertPrefsPanel moved OUT of flow (fixed sheet on
    // mobile, absolute anchored to the bell on sm+), so opening it no longer
    // grows the grid row or stretches the sibling card.
    <div className="relative h-full flex flex-col">
      <div className="flex-1">
        <ProducerCard producer={fav.producer} />
      </div>
      <button
        ref={bellRef}
        onClick={onToggle}
        // MEH-2526: the accessible name starts with the visible bell_label
        // (WCAG 2.5.3 label-in-name) and adds the business name, so the bells
        // on a page of cards are told apart by a screen reader. The longer
        // alerts_aria copy stays as the hover title.
        // MEH-2535: no name → the label alone, not «label —».
        aria-label={
          fav.producer?.name ? `${t("bell_label")} — ${fav.producer.name}` : t("bell_label")
        }
        title={t("alerts_aria")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={open}
        data-testid="favorites-bell"
        // MEH-1203: mirror CardHeart's density variant (ProducerCard.jsx:144)
        // so the bell keeps a comfortable tap target inside the smaller 2-col
        // card — 34px on mobile, 44px sm: up, top-end corner opposite the heart.
        // MEH-2526: circle → pill so the label sits beside the bell; same
        // heights, same corner.
        className="absolute top-2 end-2 sm:top-3 sm:end-3 h-[34px] sm:h-11 px-2.5 sm:px-3 gap-1 flex items-center justify-center rounded-full bg-background/90 hover:bg-background text-primary transition z-10"
      >
        <Bell size={18} weight={open ? "fill" : "regular"} aria-hidden="true" />
        <span className="text-xs font-medium">{t("bell_label")}</span>
      </button>
      {open && (
        // MEH-1359: out of flow. Mobile → fixed bottom-sheet above BottomNav
        // (z clears BottomNav:1000 + cookie:1100, below filter-sheet:1200).
        // sm+ → absolute, dropping from just below the bell (top-14 = the bell's
        // bottom edge). Either way the grid cell height is unaffected.
        // MEH-2148: the mobile sheet cleared a 64px nav band that no longer
        // exists at that height. Derived from the published clearance now.
        //
        // As a CLASS, not an inline style, and that is load-bearing rather than
        // stylistic: an inline `style={{ bottom }}` outranks every class, so
        // `sm:bottom-auto` could not fire and at sm+ the panel stayed anchored
        // at BOTH edges -- `top-14` and a live `bottom` -- stretching it past
        // its content instead of sizing to it. Measured at 900px: 426px tall
        // against 369px of content. Same arbitrary-value form as InstallPrompt
        // below, and Tailwind arbitrary values take no spaces.
        <div
          ref={panelRef}
          className="fixed inset-x-3 bottom-[calc(var(--bottom-nav-clearance,calc(4.5rem+env(safe-area-inset-bottom,0px)))+8px)] z-[1150] sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-14 sm:end-0 sm:w-72"
        >
          <AlertPrefsPanel
            producerId={fav.producer_id}
            producerName={fav.producer?.name || ""}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}

// MEH-2560: a saved recipe on /favorites — the producer page's card, with the
// heart on its picture corner as a sibling of the card link (a button inside
// an <a> would follow the link).
function SavedRecipeCard({ recipe }) {
  return (
    <div className="relative h-full" data-testid="saved-recipe">
      <RecipeCard slug={recipe.producer_slug} recipe={recipe} />
      <div className="absolute top-1 start-1 z-10">
        <SaveButton itemType="recipe" itemId={recipe.id} variant="row" />
      </div>
    </div>
  );
}

// MEH-2560: one-line empty state for a type filter (0 of that type, others
// saved). The «הכל» and «בתי עסק» empty states keep the full block below.
function TypeEmpty({ text }) {
  return (
    <div className="text-center py-16" data-testid="favorites-type-empty">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-4">
        <HeartStraight size={28} weight="regular" className="text-primary" aria-hidden="true" />
      </div>
      <p className="text-fg-muted">{text}</p>
    </div>
  );
}

export default function FavoritesClient() {
  const t = useTranslations("favorites");
  const tList = useTranslations("events.list");
  // MEH-996: shared generic error copy for the failed-fetch state.
  const tError = useTranslations("error");
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  // MEH-1359: one panel open at a time (EditAccordionCard precedent) — keeps two
  // floating bottom-sheets from overlapping on mobile.
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  // MEH-996: a failed fetch used to fall through to the "no favorites yet"
  // empty state — indistinguishable from a real empty list (MEH-977 class).
  const [loadError, setLoadError] = useState(false);
  // MEH-1479: attempt counter drives the retry. Bumping it re-runs the fetch
  // effect (it's in the deps) so "נסו שוב" refetches without a full reload —
  // mirrors SectionFetchError's onRetry contract (dashboard/page.js:88).
  const [attempt, setAttempt] = useState(0);
  // MEH-2560: recipes / events / experiences, fetched beside the businesses.
  // Their failure is their own: the businesses still render, and the saved
  // part shows the error + retry where it would have been.
  const [saved, setSaved] = useState(EMPTY_SAVED);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState(false);
  const [savedAttempt, setSavedAttempt] = useState(0);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      api
        .get("/users/me/favorites")
        .then((r) => {
          // MEH-1713: Rule-19 gap — this response went straight to render
          // with no Zod parse at all, so a structurally broken payload
          // reached ProducerCard instead of the error state below.
          //
          // PER-ROW filtering, deliberately NOT a whole-array parse. The two
          // surfaces differ in what a failure costs: the map feed parses
          // all-or-nothing (useProducersFeed.js:41) because a half-drawn map
          // is worse than an empty one, but /favorites is a list the user
          // curated by hand — dropping every saved business because one row
          // is malformed reads as "your favorites are gone", the exact
          // silent-blank class MEH-977/MEH-1479 built the error state for.
          // One bad row costs one card; the rest still render.
          const rows = Array.isArray(r.data) ? r.data : null;
          if (!rows) {
            // Not an array at all = structural failure of the whole
            // response. Nothing to salvage per-row, so route to the error
            // state rather than render an empty "no favorites yet" page,
            // which would be indistinguishable from a real empty list.
            setLoadError(true);
            return;
          }
          setFavorites(
            rows
              .map((row) => FavoriteWithProducerSchema.safeParse(row))
              .filter((res) => res.success)
              .map((res) => res.data),
          );
          setLoadError(false);
        })
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false));
    }
  }, [user, authLoading, router, attempt]);

  useEffect(() => {
    if (!user) return;
    loadSavedItems()
      .then((parsed) => {
        setSaved(parsed);
        setSavedError(false);
      })
      .catch(() => setSavedError(true))
      .finally(() => setSavedLoading(false));
  }, [user, savedAttempt]);

  // MEH-2034: /favorites was the only favorites surface not subscribed to the
  // shared cache — its list lived in the local useState above, filled by the
  // one-shot fetch effect and never touched again. CardHeart (inside the cards
  // this page renders) already writes setFavoritedLocal, so un-favoriting here
  // succeeded server-side while the row stayed on screen until a reload.
  //
  // Sapir's ruling (12/08): same contract as FavoriteButton — the row goes
  // immediately (optimistic) and comes BACK if the API call fails. No undo
  // delay. So this deliberately does NOT delete from `favorites`: a deleted row
  // could not return. The fetched list stays whole and the cache decides what
  // renders, which makes CardHeart's existing revert (setFavoritedLocal(!next)
  // on failure) restore the row for free — no second mechanism.
  const [cacheTick, setCacheTick] = useState(0);
  // Producer ids the cache actually knew at load time. Null until it resolves.
  const [cacheKnownIds, setCacheKnownIds] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    const unsub = subscribeFavorites(() => {
      if (alive) setCacheTick((n) => n + 1);
    });
    ensureFavoritesLoaded().then((ids) => {
      // Copy: the cache resolves with its live Set, which it mutates in place.
      if (alive) setCacheKnownIds(new Set(ids));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [user]);

  // Hide a row only if the cache KNEW it and no longer does. The `has` guard is
  // what keeps a failed cache load from blanking a list this page fetched
  // successfully: ensureFavoritesLoaded swallows its error and resolves with an
  // empty Set (favorites-cache.js:58-61), which is indistinguishable from "you
  // have no favorites". Gating on prior knowledge makes that case degrade to
  // today's behaviour instead of emptying the page.
  const visibleFavorites = useMemo(() => {
    if (!cacheKnownIds) return favorites;
    return favorites.filter(
      (fav) => !cacheKnownIds.has(fav.producer_id) || isFavorited(fav.producer_id),
    );
    // cacheTick is the subscription's signal: isFavorited reads module state,
    // so nothing else here changes when a heart is tapped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, cacheKnownIds, cacheTick]);

  // MEH-2560: the same contract for saved items, through saved-cache — a heart
  // tapped here hides its row at once and brings it back if the call fails.
  const [savedTick, setSavedTick] = useState(0);
  const [savedKnownKeys, setSavedKnownKeys] = useState(null);
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    const unsub = subscribeSaved(() => {
      if (alive) setSavedTick((n) => n + 1);
    });
    ensureSavedLoaded().then((keys) => {
      if (alive) setSavedKnownKeys(new Set(keys));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [user]);

  const visibleSaved = useMemo(() => {
    const keep = (type) => (row) =>
      !savedKnownKeys?.has(`${type}:${row.id}`) || isSaved(type, row.id);
    return {
      recipes: saved.recipes.filter(keep("recipe")),
      events: saved.events.filter(keep("event")),
      experiences: saved.experiences.filter(keep("experience")),
    };
    // savedTick: isSaved reads module state (see cacheTick above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, savedKnownKeys, savedTick]);

  const { upcomingEvents, upcomingExperiences, past } = useMemo(
    () => splitByTime(visibleSaved.events, visibleSaved.experiences),
    [visibleSaved],
  );

  const counts = {
    businesses: visibleFavorites.length,
    events: visibleSaved.events.length,
    experiences: visibleSaved.experiences.length,
    recipes: visibleSaved.recipes.length,
  };
  counts.all = counts.businesses + counts.events + counts.experiences + counts.recipes;

  // MEH-1479: clear the error, show the skeleton again, and bump attempt to
  // re-trigger the fetch effect.
  const handleRetry = () => {
    setLoadError(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  const handleSavedRetry = () => {
    setSavedError(false);
    setSavedLoading(true);
    setSavedAttempt((n) => n + 1);
  };

  // MEH-2560: the page's blocks, shared by «הכל» and the single-type views.
  function renderBusinesses() {
    return (
      <>
          {/* MEH-1628: the bell is the sentence's grammatical object, so it is
              interpolated INTO the string via t.rich — not a sibling glyph and
              never an emoji character (Emoji LOCK v2). The sibling <Bell> that
              used to sit before the text is gone: exactly one bell renders.
              REUSES: frontend/app/[locale]/admin/help/page.jsx:86 (t.rich).
              Block (not flex) so the sentence wraps around the icon at 375px —
              flex would make the two text runs unbreakable siblings. */}
          <p className="text-xs text-fg-muted mb-4" dir="rtl">
            {t.rich("list_alerts_hint", {
              icon: () => (
                <Bell size={13} aria-hidden="true" className="inline align-text-bottom" />
              ),
            })}
          </p>
          {/* MEH-1203: grid parity with /producers (ProducersClient.jsx:489) —
              2 cols mobile · 3 at lg · 4 at xl, same gap-3/md:gap-6. The old
              1/md:2/lg:3 grid rendered one near-full-width card per row. */}
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {visibleFavorites.map((fav) => (
              <FavoriteCardWrapper
                key={fav.producer_id}
                fav={fav}
                open={openId === fav.producer_id}
                onToggle={() =>
                  setOpenId((cur) => (cur === fav.producer_id ? null : fav.producer_id))
                }
                onClose={() => setOpenId(null)}
              />
            ))}
          </div>
        </>
    );
  }

  // «בתי עסק» with no businesses: the pre-MEH-2560 empty state, unchanged.
  function renderBusinessesEmpty() {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-50 mb-6">
          {/* MEH-1628: HeartStraight, not the generic Leaf — the glyph must
              echo the control empty_subtitle tells the user to press
              (MEH-685 precedent: the favorites toast picked the same icon). */}
          <HeartStraight size={40} weight="regular" className="text-primary" aria-hidden="true" />
        </div>
        <h2 className="font-headline-md text-2xl font-bold text-text mb-2">
          {t("empty_title")}
        </h2>
        {/* MEH-1628: exactly ONE helper paragraph. The isFirstVisit tip block
            that used to sit below said the same thing as empty_subtitle —
            two helper paragraphs on one screen. Deleted, key removed. */}
        <p className="text-fg-muted mb-6 max-w-md mx-auto">
          {t("empty_subtitle")}
        </p>
        <div>
          <button
            onClick={() => router.push("/")}
            className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium"
          >
            {t("empty_cta")}
          </button>
        </div>
      </div>
    );
  }

  function renderEvents(rows, tab) {
    return (
      <div className="border-t border-border">
        {rows.map((row) => (
          <EventEntryRow key={row.id} entry={toEventEntry(row, tab, tList)} freeLabel={tList("free")} />
        ))}
      </div>
    );
  }

  function renderRecipes() {
    return (
      <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {visibleSaved.recipes.map((recipe) => (
          <SavedRecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    );
  }

  // «עברו» — past events and finished/cancelled experiences, at the bottom.
  function renderPast(items) {
    if (items.length === 0) return null;
    return (
      <section aria-labelledby="favorites-h-past" data-testid="favorites-section-past">
        <h2 id="favorites-h-past" className="font-headline-md text-xl font-bold text-fg-muted mb-4">
          {t("past_heading")}
        </h2>
        <div className="border-t border-border opacity-80">
          {items.map(({ kind, row }) => (
            <EventEntryRow key={`${kind}:${row.id}`} entry={toEventEntry(row, kind, tList)} freeLabel={tList("free")} />
          ))}
        </div>
      </section>
    );
  }

  // The saved half failed while the businesses loaded: quiet error + retry in
  // its place (the MEH-1479 pattern), never a false «nothing saved».
  function renderSavedError() {
    return (
      <div className="text-center py-12" role="alert" data-testid="favorites-saved-error">
        <p className="text-fg-muted">{tError("generic")}</p>
        <button
          type="button"
          onClick={handleSavedRetry}
          data-testid="favorites-saved-retry"
          className="mt-4 text-sm text-primary font-medium hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {tError("retry")}
        </button>
      </div>
    );
  }

  if (authLoading || !user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Breadcrumb
        items={[{ href: "/", label: t("breadcrumb_home") }, { label: t("breadcrumb_favorites") }]}
        className="mb-4"
      />
      <h1 className="font-headline-lg text-3xl font-bold mb-8 text-text inline-flex items-center gap-2">
        <Heart size={28} weight="fill" className="text-primary" aria-hidden="true" />
        {t("title")}
      </h1>

      {loading || savedLoading ? (
        <SkeletonProducerGrid count={6} />
      ) : loadError ? (
        // MEH-1479: quiet error state (no red wash) + retry button under the
        // text, mirroring SectionFetchError (dashboard/page.js:88).
        <div className="text-center py-20" role="alert">
          <p className="text-fg-muted">{tError("generic")}</p>
          <button
            type="button"
            onClick={handleRetry}
            data-testid="favorites-retry"
            className="mt-4 text-sm text-primary font-medium hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {tError("retry")}
          </button>
        </div>
      ) : counts.all === 0 && !savedError ? (
        // MEH-2560: nothing saved of any type. Same block as the businesses
        // empty state below, with the approved «הכל» copy.
        <div className="text-center py-20" data-testid="favorites-empty-all">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-50 mb-6">
            <HeartStraight size={40} weight="regular" className="text-primary" aria-hidden="true" />
          </div>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-2">
            {t("empty_all_title")}
          </h2>
          <p className="text-fg-muted mb-6 max-w-md mx-auto">{t("empty_all_subtitle")}</p>
          <div>
            <button
              onClick={() => router.push("/")}
              className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium"
            >
              {t("empty_cta")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* MEH-2560: one chip per type, each with its count. */}
          <ChipScrollRow
            variant="category"
            className="mb-6"
            chips={FILTERS.map((key) => ({
              key,
              label: (
                <>
                  {t(`filter_${key}`)}
                  <span className="numeric text-xs opacity-70" data-testid={`favorites-count-${key}`}>
                    {counts[key]}
                  </span>
                </>
              ),
            }))}
            activeKey={filter}
            onChipClick={setFilter}
          />
          {filter === "all" ? (
            <div className="space-y-10">
              {[
                ["events", upcomingEvents.length > 0 && renderEvents(upcomingEvents, "events")],
                ["experiences", upcomingExperiences.length > 0 && renderEvents(upcomingExperiences, "experiences")],
                ["businesses", visibleFavorites.length > 0 && renderBusinesses()],
                ["recipes", visibleSaved.recipes.length > 0 && renderRecipes()],
              ]
                .filter(([, body]) => body)
                .map(([key, body]) => (
                  <section key={key} aria-labelledby={`favorites-h-${key}`} data-testid={`favorites-section-${key}`}>
                    <h2 id={`favorites-h-${key}`} className="font-headline-md text-xl font-bold text-text mb-4">
                      {t(`filter_${key}`)}
                    </h2>
                    {body}
                  </section>
                ))}
              {savedError && renderSavedError()}
              {renderPast(past)}
            </div>
          ) : filter === "businesses" ? (
            visibleFavorites.length > 0 ? renderBusinesses() : renderBusinessesEmpty()
          ) : savedError ? (
            renderSavedError()
          ) : counts[filter] === 0 ? (
            <TypeEmpty text={t(`empty_${filter}`)} />
          ) : filter === "recipes" ? (
            renderRecipes()
          ) : (
            <div className="space-y-10">
              {filter === "events"
                ? upcomingEvents.length > 0 && renderEvents(upcomingEvents, "events")
                : upcomingExperiences.length > 0 && renderEvents(upcomingExperiences, "experiences")}
              {renderPast(past.filter((p) => p.kind === filter))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
