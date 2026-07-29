"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Heart, HeartStraight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { FavoriteWithProducerSchema } from "@/lib/api-schemas";
import ProducerCard from "@/components/ProducerCard";
import AlertPrefsPanel from "@/components/AlertPrefsPanel";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonProducerGrid } from "@/components/Skeleton";

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
        title={t("alerts_aria")}
        aria-label={t("alerts_aria")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={open}
        // MEH-1203: mirror CardHeart's density variant (ProducerCard.jsx:144)
        // so the bell keeps a comfortable tap target inside the smaller 2-col
        // card — 34px on mobile, 44px sm: up, top-end corner opposite the heart.
        className="absolute top-2 end-2 sm:top-3 sm:end-3 w-[34px] h-[34px] sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-background/90 hover:bg-background text-primary transition z-10"
      >
        <Bell size={18} weight={open ? "fill" : "regular"} aria-hidden="true" />
      </button>
      {open && (
        // MEH-1359: out of flow. Mobile → fixed bottom-sheet above BottomNav
        // (z clears BottomNav:1000 + cookie:1100, below filter-sheet:1200).
        // sm+ → absolute, dropping from just below the bell (top-14 = the bell's
        // bottom edge). Either way the grid cell height is unaffected.
        <div
          ref={panelRef}
          className="fixed inset-x-3 bottom-16 z-[1150] sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-14 sm:end-0 sm:w-72"
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

export default function FavoritesClient() {
  const t = useTranslations("favorites");
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

  // MEH-1479: clear the error, show the skeleton again, and bump attempt to
  // re-trigger the fetch effect.
  const handleRetry = () => {
    setLoadError(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  };

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

      {loading ? (
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
      ) : favorites.length === 0 ? (
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
      ) : (
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
            {favorites.map((fav) => (
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
      )}
    </div>
  );
}
