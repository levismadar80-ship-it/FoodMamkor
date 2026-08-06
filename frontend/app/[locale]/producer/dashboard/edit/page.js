"use client";

/**
 * Module:   producer/dashboard/edit/page
 * Purpose:  עריכה tab of the producer dashboard hub (MEH-964 Phase 1, chunk
 *           1A). Hosts the owner-facing edit forms relocated VERBATIM off the
 *           Overview: AI bio, custom WhatsApp questions, contact channels; plus
 *           the self-service editors added later: categories, gallery images,
 *           and map location (gated on has_physical_location).
 * Touches:  GET /producers/me (read); PUT /producers/me + POST
 *           /producers/me/bio/generate (writes, inside the cards).
 * Does NOT: consolidate with /settings — that is Phase 2. The card bodies
 *           below are byte-identical to their prior definitions in
 *           producer/dashboard/page.js (relocate-don't-rewrite); only the
 *           host page wrapper + fetch are new.
 * Related:  app/[locale]/producer/dashboard/layout.js (tab nav + UX gate);
 *           app/[locale]/producer/dashboard/page.js (סקירה — prior home of
 *           these cards, MEH-56 / MEH-210 / MEH-296).
 * History:  MEH-964 (relocation, chunk 1A); edit-tab editor series —
 *           categories (chunk A), gallery images (chunk B), gated map location
 *           via AddressSearch (chunk C); polish + test backfill (fetch-error on
 *           GET /categories, cloudinary thumbnails, component tests);
 *           MEH-1157 — locale-aware login redirect + 401 handling on the
 *           /producers/me fetch (no half-alive tab); BioPanelCard moved to
 *           cards.jsx for test export (MEH-1119 pattern);
 *           MEH-1158 — accordion headers gained content previews (thumbs /
 *           chips / first line / channel glyph) built from the same fetched
 *           profile, via EditAccordionCard's additive `preview` prop;
 *           MEH-1408 — hub-and-spoke: the flat accordion list became a hub of
 *           4 group tiles (?group=…), shell-only — every card stays MOUNTED
 *           (hidden-toggle at the group level) so unsaved state + the MEH-1100
 *           aggregate survive hub↔group nav; card bodies are untouched.
 *
 * Auth: producer-role guard via useAuth() — kept per-page until Phase 2.
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
// MEH-1157: locale-aware router — push("/login") lands on /{locale}/login
// instead of dropping an /en session onto the default-locale page.
// MEH-1408: usePathname feeds router.push({pathname, query:{group}}) for the
// hub↔group nav; useSearchParams (next/navigation) reads the active ?group.
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
// MEH-1158: MapPin + per-channel glyphs feed the header previews below.
// MEH-1408: CaretLeft — the "back to all sections" link's inline-start indicator
// (base points inline-start in LTR; rtl:rotate-180 flips it to inline-start in RTL).
// (X dropped — unused since MEH-1157 moved BioPanelCard to cards.jsx.)
import {
  Warning,
  MapPin,
  CaretLeft,
  WhatsappLogo,
  Phone,
  InstagramLogo,
  EnvelopeSimple,
  Globe,
  FacebookLogo,
  ClipboardText,
} from "@phosphor-icons/react";
import api from "@/lib/api";
// MEH-1245: retire the last native alert() straggler on the producer edit tab
// (CustomQuestionsCard save-error) — toast idiom matches dashboard/page.js:167
// (MEH-1092) + recipes/page.js (MEH-959/1192 conversions).
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import InfoTooltip from "@/components/InfoTooltip";
import WhatsThis from "@/components/WhatsThis";
import EditAccordionCard, {
  PreviewThumbs,
  PreviewChips,
  PreviewEmpty,
} from "@/components/EditAccordionCard";
import EditHubCard from "@/components/EditHubCard";
import Input from "@/components/ui/Input";
import { detailToMessage } from "@/lib/errors";
import ProductsSection from "@/components/ProductsSection";
import LocationsEditor from "./LocationsEditor";
import { DescriptionCard, OwnerStoryCard, CategoriesCard, ImagesCard, LocationCard, PricingCard, HoursCard, DeliveryCard, OffersCard, LicenseCard, KashrutCard, ViewOnPageLink } from "./cards";
// MEH-1508 ch2 Phase B: owner-facing business-level dietary scope (own file —
// cards.jsx is already >1600 lines).
import DietaryScopeCard from "./DietaryScopeCard";
// MEH-1851 row 23: owner-declared grass_fed (own file, same reason as above —
// cards.jsx is already >1600 lines).
import GrassFedCard from "./GrassFedCard";
// MEH-1544: weekly order-acceptance window (own file, same reason as above —
// imported directly rather than via a cards.jsx passthrough wrapper).
import OrderWindowEditor from "./OrderWindowEditor";
import { isDefaultDescription } from "@/lib/producer-completeness";

// MEH-1116: stable English anchor id per card → the page-local open-state key.
// The anchor ids are a public deep-link contract (#contact-channels …).
// Do not rename.
const ANCHOR_TO_KEY = {
  bio: "bio",
  questions: "questions",
  "contact-channels": "contact",
  categories: "categories",
  // MEH-1258: license editor card (deep-linked from the "נשאר להשלים" banner).
  license: "license",
  // MEH-1167: kashrut-request card (badge request + cert photo + status).
  kashrut: "kashrut",
  images: "images",
  location: "location",
  products: "products",
  pricing: "pricing",
  delivery: "delivery",
  hours: "hours",
  // MEH-1544: weekly order-acceptance window (sibling of hours, same group).
  "order-window": "orderWindow",
  // MEH-1335 chunk 3: owner-story editor (bio + photo behind the public
  // OwnerCard).
  "owner-story": "ownerStory",
  // MEH-1106 (PR #1621) alias anchors — ProfileCompletenessCard's checklist
  // steps deep-link #profile-* (it merged in parallel with wrapper-div ids);
  // under the accordion they resolve to the same cards, auto-expanded.
  "profile-contact": "contact",
  "profile-categories": "categories",
  "profile-images": "images",
  "profile-products": "products",
};

// MEH-1158: Phosphor glyph per primary contact channel — feeds the contact
// card's header preview (icon + existing channel_* label, no new i18n).
const CHANNEL_ICONS = {
  whatsapp: WhatsappLogo,
  phone: Phone,
  instagram: InstagramLogo,
  email: EnvelopeSimple,
  website: Globe,
  facebook: FacebookLogo,
  external_order: ClipboardText,
};

// Which value field backs each primary method (empty-on-save guard). Shared
// by the contact preview above and ContactChannelsCard below. MEH-1165 item 5
// (PR #1682 nit): declared before its first use (the preview composition)
// instead of after ContactChannelsCard's section banner.
const METHOD_FIELD = {
  whatsapp: "phone",
  phone: "phone",
  instagram: "instagram",
  email: "contact_email",
  website: "website",
  facebook: "facebook",
  external_order: "external_order_form",
};

// Canonical section id per open-state key — hash aliases above scroll to the
// section that actually carries the id attribute.
const KEY_TO_ANCHOR = {
  bio: "bio",
  questions: "questions",
  contact: "contact-channels",
  categories: "categories",
  license: "license",
  kashrut: "kashrut",
  images: "images",
  location: "location",
  products: "products",
  pricing: "pricing",
  delivery: "delivery",
  hours: "hours",
  orderWindow: "order-window",
  // MEH-1823: registered here so #offer deep-links resolve like every other
  // card. These three maps are a guarded registry — a card added to the JSX
  // without an entry renders but is unreachable by anchor, which is the
  // silent-gap class .claude/rules/testing.md documents for path registries.
  offer: "offer",
};

// MEH-1408: hub-and-spoke group layer OVER the existing accordion. The card
// keys and anchor contract above are UNCHANGED — this only assigns each card to
// one of 4 groups. Membership per the 21/07 SYNC (Phase 0 STOP-a resolution):
// pricing → profile; delivery + hours → location; license + kashrut → the one
// unified "trust" card.
const GROUP_KEYS = ["profile", "trust", "location", "contact"];

// Card key → its group. Drives anchor→group deep-link resolution and the hub
// status/next-step aggregation. license/kashrut both live in the trust group
// (rendered as one card — see OPEN_KEY_FOR).
const KEY_TO_GROUP = {
  images: "profile",
  categories: "profile",
  bio: "profile",
  products: "profile",
  pricing: "profile",
  ownerStory: "profile",
  license: "trust",
  kashrut: "trust",
  location: "location",
  delivery: "location",
  hours: "location",
  orderWindow: "location",
  // MEH-1823: the offer lives in the location group — it is read against the
  // delivery terms above it. Deliberately NOT added to GROUP_MEMBERS below,
  // for the same reason orderWindow isn't: membership drives the hub's
  // "{done}/{total}", and an opt-in field would show every existing business
  // as 2/4 instead of 2/3 and nudge them into running promotions nobody asked
  // for — the GBP-staleness risk that note already cites.
  offer: "location",
  contact: "contact",
  questions: "contact",
};

// The accordion open-state key a card key maps to. The trust group renders ONE
// accordion card (anchorId "trust") composing the license + kashrut bodies, so
// both card keys open that single card; scroll still targets the inner
// #license / #kashrut sub-section (KEY_TO_ANCHOR unchanged).
const OPEN_KEY_FOR = (key) =>
  key === "license" || key === "kashrut" ? "trust" : key;

// Ordered member card keys per group — for the hub completion count + the
// next-step marker placement (location is filtered out below for delivery-only
// profiles, whose location card isn't mounted).
const GROUP_MEMBERS = {
  profile: ["images", "categories", "bio", "products", "pricing", "ownerStory"],
  trust: ["license", "kashrut"],
  // MEH-1544: `orderWindow` is deliberately NOT a member. Membership drives the
  // hub's "{done}/{total}" completion count, and the order window is an opt-in
  // field — counting it would show every existing business as 2/4 instead of
  // 2/3 and nudge them to maintain hours they never asked for (the exact
  // GBP-staleness risk the ticket cites). It still belongs to the location
  // group via KEY_TO_GROUP, so #order-window deep-links resolve normally.
  location: ["location", "delivery", "hours"],
  contact: ["contact", "questions"],
};

// MEH-1920: card keys whose MEH-1158 preview is fixed-shape enough to enter a
// HUB TILE. The per-card accordion header is unaffected — it owns a full row and
// still shows every preview below.
//
// A hub tile packs its preview nodes into ONE narrow flex row
// (EditHubCard.jsx:52-58 — `flex items-center gap-2 overflow-hidden`, each node
// wrapped in `min-w-0`), and every chip carries `truncate`, whose
// `overflow: hidden` zeroes a flex item's automatic minimum size. So a node
// holding unbounded owner prose does not merely clip itself — it shrinks the
// structured chips beside it to a single glyph. Measured in Chromium at 375px
// with only the free-text node as the variable: category chips 58px→33px and
// 49px→30px, rendering as "ת…" / "ט…" beside a clipped description. Free text
// never enters a preview (GOV.UK / NHS summary-list pattern).
//
// Allowlist, not denylist: a card key added later stays out of the hub until its
// preview is shown to be short and fixed-shape. Keys with no preview node at all
// (kashrut / delivery / hours / questions / ownerStory) are already filtered by
// the `previews[k]` check below and are deliberately absent here.
const HUB_PREVIEW_KEYS = new Set([
  "images", // PreviewThumbs — fixed 40px squares
  "categories", // PreviewChips — closed vocabulary, capped at 3 (MEH-1297)
  "license", // masked "•••1234" chip (MEH-1258)
  "location", // MapPin + city name
  "contact", // channel glyph + channel label
]);

// MEH-1408: thin Suspense wrapper — EditPageInner reads useSearchParams (the
// active ?group), which requires a Suspense boundary at build (Next CSR-bailout
// rule; mirrors the ProducersClient pattern). The page renders null until auth
// resolves anyway, so a null fallback is invisible.
export default function ProducerDashboardEditPage() {
  return (
    <Suspense fallback={null}>
      <EditPageInner />
    </Suspense>
  );
}

function EditPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // MEH-1408: the active group (hub when absent/unknown). Normalized so a bad
  // ?group value falls back to the hub instead of hiding every view.
  const rawGroup = searchParams.get("group");
  const group = GROUP_KEYS.includes(rawGroup) ? rawGroup : null;
  const t = useTranslations("dashboard.producer");
  // MEH-1116: accordion titles + one-line status summaries.
  const tAcc = useTranslations("dashboard.producer.edit_accordion");
  // MEH-1823: the offer feature owns one namespace shared by the dashboard
  // card and the public badge, so the four type labels have a single source.
  const tOffer = useTranslations("producer.offer");
  const tProducts = useTranslations("settings.products");
  const tLoc = useTranslations("settings.locations");
  // MEH-1773: point-of-decision explainer for the order-window card. The
  // ContactChannelsCard hook of the same name (:1202) is scoped to that
  // component and not reachable from here.
  // REUSES: frontend/app/[locale]/producer/dashboard/edit/page.js:1202 — same
  // top-level whats_this namespace, same WhatsThis component (MEH-1115).
  const tWhat = useTranslations("whats_this");
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);

  // MEH-1116: accordion state — one card open at a time, all collapsed on load.
  const [openKey, setOpenKey] = useState(null);
  const toggleKey = useCallback(
    (key) => setOpenKey((k) => (k === key ? null : key)),
    []
  );

  // MEH-1408: hub↔group navigation. push (NOT replace — MEH-1084) with
  // scroll:false so mobile Back from a group returns to the hub, and the
  // back-link push does the same. These are <button> actions (not <a>), so the
  // MEH-1100 nav guard doesn't fire — correct, since every card stays mounted
  // across hub↔group and no unsaved work is lost.
  const enterGroup = useCallback(
    (g) => router.push({ pathname, query: { group: g } }, { scroll: false }),
    [router, pathname]
  );
  const backToHub = useCallback(
    () => router.push({ pathname }, { scroll: false }),
    [router, pathname]
  );

  // MEH-1408: carries the target card key across a group switch (router.push is
  // async — the anchor scroll must run after the new group re-renders). Set by
  // the hash/jump resolvers, drained by the group-change effect below.
  const pendingAnchorRef = useRef(null);
  // MEH-1408: fresh `group` for the hash resolver, whose effect deliberately
  // does NOT depend on `group` (so a group change never re-reads a stale hash
  // and bounces back into the group — the "back to hub" trap).
  const groupRef = useRef(group);
  groupRef.current = group;
  // Live product count for the products summary: seeded from the page profile
  // (/producers/me joins products), then kept live by ProductsSection's
  // onCountChange as the owner adds/removes inside the card.
  const [productsCount, setProductsCount] = useState(null);

  // MEH-1100: page-level unsaved-changes signal. Each card reports its own
  // (pre-existing) dirty flag up via reportDirty(key, bool); the page only
  // aggregates — no card save logic changes.
  const [dirtyMap, setDirtyMap] = useState({});
  const reportDirty = useCallback((key, isDirty) => {
    setDirtyMap((m) =>
      Boolean(m[key]) === Boolean(isDirty) ? m : { ...m, [key]: isDirty }
    );
  }, []);
  const anyDirty = Object.values(dirtyMap).some(Boolean);

  // MEH-1237: jump from an unsaved-banner card name to its accordion — reuses
  // the exact open+scroll path the URL-hash deep link uses below (setOpenKey +
  // KEY_TO_ANCHOR scrollIntoView), so there is one navigation mechanism.
  // MEH-1408: a dirty card may sit in a non-active group — switch to its group
  // first (via the pendingAnchorRef relay the hash effect drains after the
  // re-render), otherwise open+scroll straight away.
  const jumpToCard = useCallback(
    (key) => {
      const g = KEY_TO_GROUP[key];
      setOpenKey(OPEN_KEY_FOR(key));
      if (g && g !== group) {
        pendingAnchorRef.current = key;
        enterGroup(g);
        return;
      }
      requestAnimationFrame(() => {
        document
          .getElementById(KEY_TO_ANCHOR[key])
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [group, enterGroup]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api
      .get("/producers/me")
      .then((r) => setProfile(r.data))
      .catch((err) => {
        // MEH-1157: a 401 here means the session died between the context
        // boot and this fetch (stale context user). Redirect like the auth
        // gate above instead of parking the tab on the loading text forever.
        if (err?.response?.status === 401) {
          router.push("/login");
        } else {
          setProfile(null);
        }
      });
  }, [user, authLoading, router]);

  // MEH-1100 guard 1: native tab-close / refresh prompt, only while dirty.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  // MEH-1100 guard 2: in-app navigation. The App Router exposes no
  // route-change events, so intercept anchor clicks at capture phase while
  // dirty — this covers the tab nav, header, and BottomNav links alike.
  // New-tab clicks (target=_blank / modifier keys) don't leave the page and
  // pass through; same-path clicks (e.g. anchors) are ignored.
  useEffect(() => {
    if (!anyDirty) return;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      if (!window.confirm(t("unsaved_guard.confirm"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [anyDirty, t]);

  // MEH-1116 + MEH-1408: URL-hash deep link — #<anchor> auto-selects the card's
  // GROUP, expands the card, and scrolls to it; on load (once the profile has
  // rendered) and on every hashchange. The anchor→group mapping is derived from
  // KEY_TO_GROUP, so the MEH-1106 checklist deep links (#bio, #products…) keep
  // working with zero change on the sender side. Unknown hashes are ignored;
  // #location on a delivery-only profile (card not mounted) is a silent no-op.
  // Deps deliberately EXCLUDE `group` (reads groupRef instead): a group change
  // must NOT re-run this and re-resolve a stale hash — that bounced "back to
  // all sections" straight back into the group.
  useEffect(() => {
    if (!profile) return;
    const applyHash = () => {
      const key = ANCHOR_TO_KEY[window.location.hash.replace(/^#/, "")];
      if (!key) return;
      const g = KEY_TO_GROUP[key];
      // Deep link arriving outside its group → switch first (replace, so the
      // link doesn't leave a hub entry in history); the group-change effect
      // below opens + scrolls once the target group renders.
      if (g && g !== groupRef.current) {
        pendingAnchorRef.current = key;
        router.replace({ pathname, query: { group: g } }, { scroll: false });
        return;
      }
      setOpenKey(OPEN_KEY_FOR(key));
      // Wait a frame so the panel un-hides before measuring scroll position.
      // Scroll to the canonical section id (alias hashes carry no element).
      requestAnimationFrame(() => {
        document
          .getElementById(KEY_TO_ANCHOR[key])
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [profile, router, pathname]);

  // MEH-1408: drain a pending anchor once its group has become active — the
  // second half of a cross-group deep link / banner jump. Only fires when the
  // target group is live, so returning to the hub (no pending) is a no-op.
  useEffect(() => {
    const key = pendingAnchorRef.current;
    if (!key || KEY_TO_GROUP[key] !== group) return;
    pendingAnchorRef.current = null;
    setOpenKey(OPEN_KEY_FOR(key));
    requestAnimationFrame(() => {
      document
        .getElementById(KEY_TO_ANCHOR[key])
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [group]);

  if (authLoading || !user || user.role !== "producer") return null;

  if (!profile) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
        {t("loading_data")}
      </div>
    );
  }

  // MEH-1132: next-step gold marker. The FIRST card in the new funnel order
  // whose summary signal reads empty gets a single 8px accent dot — so the
  // owner always knows where to start. Derived from the SAME profile fields
  // the summaries above compute (no producer-completeness import, no fetch);
  // location is skipped for delivery-only profiles (its card isn't mounted).
  // Falls through to null when nothing is missing → no marker at all.
  const productsForMarker = productsCount ?? profile.products?.length ?? 0;
  const nextStepKey =
    (profile.images?.length ?? 0) === 0
      ? "images"
      : (profile.categories?.length ?? 0) === 0
        ? "categories"
        : profile.has_physical_location !== false && !(profile.city || "").trim()
          ? "location"
          : !(profile.description || "").trim() || isDefaultDescription(profile.description)
            ? "bio"
            : productsForMarker < 3
              ? "products"
              : !(profile.phone || "").trim()
                ? "contact"
                : null;
  // ADR-019 / ADR-024: incomplete-affordance is gold (bg-accent = #896714),
  // never red — a partial profile is progress. role=img + aria-label so the
  // marker is announced; RTL logical margin-start (ms-*) keeps it beside the
  // title on both directions.
  const nextStepDot = (
    <span
      role="img"
      aria-label={tAcc("next_step_aria")}
      className="inline-block w-2 h-2 rounded-full bg-accent align-middle ms-1.5 shrink-0"
    />
  );

  // MEH-1158: per-card header content previews (Airbnb Listings-tab peek),
  // built from the SAME already-fetched profile the summaries read — no new
  // API calls. Counts stay on the existing summary line (ICU plurals); the
  // preview adds the content itself. Empty card → dashed muted placeholder,
  // no copy. Products' first name comes from the initial payload join — the
  // live in-card CRUD only feeds the count (payload-only constraint).
  const categoryNames = (profile.categories || []).map((c) => c.name);
  // MEH-1258: masked license value for the header preview/summary — bullets +
  // last 4 digits (7-10-digit Ministry-of-Health numbers stay identifiable
  // without exposing the whole value in the always-visible header).
  const licenseRaw = (profile.producer_license_number || "").trim();
  const licenseMasked = licenseRaw ? `•••${licenseRaw.slice(-4)}` : "";
  // MEH-1173: the MEH-532 seed description is not a real description — show the
  // empty-preview placeholder for it, matching the summary + next-step marker.
  const realDescription =
    (profile.description || "").trim() && !isDefaultDescription(profile.description)
      ? profile.description.trim()
      : "";
  const bioFirstLine = realDescription.split("\n")[0];
  const firstProductName = profile.products?.[0]?.name || "";
  const primaryMethod = profile.primary_contact_method || "whatsapp";
  const contactBacking = METHOD_FIELD[primaryMethod];
  const contactFilled = contactBacking
    ? Boolean((profile[contactBacking] || "").trim())
    : true;
  const ChannelIcon = CHANNEL_ICONS[primaryMethod] || WhatsappLogo;
  const previews = {
    images:
      (profile.images?.length ?? 0) > 0 ? (
        <PreviewThumbs urls={profile.images} />
      ) : (
        <PreviewEmpty />
      ),
    categories:
      categoryNames.length > 0 ? (
        <PreviewChips items={categoryNames} />
      ) : (
        <PreviewEmpty />
      ),
    location: (profile.city || "").trim() ? (
      <span className="flex items-center gap-1 text-xs font-normal text-fg-muted min-w-0">
        <MapPin size={16} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{profile.city}</span>
      </span>
    ) : (
      <PreviewEmpty />
    ),
    bio: bioFirstLine ? (
      <span className="block text-xs font-normal text-fg-muted truncate">
        {bioFirstLine}
      </span>
    ) : (
      <PreviewEmpty />
    ),
    products:
      productsForMarker > 0 ? (
        firstProductName ? (
          <PreviewChips items={[firstProductName]} />
        ) : (
          // MEH-1165 item 5 (PR #1682 nit): products added in-session have a
          // live count but no payload name — render the placeholder instead
          // of dropping the preview slot entirely (undefined).
          <PreviewEmpty />
        )
      ) : (
        <PreviewEmpty />
      ),
    contact: contactFilled ? (
      <span className="flex items-center gap-1 text-xs font-normal text-fg-muted min-w-0">
        <ChannelIcon size={16} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{tAcc(`channel_${primaryMethod}`)}</span>
      </span>
    ) : (
      <PreviewEmpty />
    ),
    pricing:
      profile.top_product_name || profile.price_range ? (
        <PreviewChips
          items={[profile.top_product_name, profile.price_range].filter(Boolean)}
        />
      ) : (
        <PreviewEmpty />
      ),
    // MEH-1258: masked license chip — never the full number in the collapsed
    // header (it scrolls past shoulders/screenshots); the open card shows it.
    license: licenseMasked ? (
      <span
        dir="ltr"
        className="inline-block px-2 py-0.5 rounded-full border border-border text-xs font-normal text-fg-muted"
      >
        {licenseMasked}
      </span>
    ) : (
      <PreviewEmpty />
    ),
    questions:
      (profile.custom_questions || []).length > 0 ? undefined : <PreviewEmpty />,
  };

  // MEH-1408: per-card "has content" signal — the SAME profile fields the
  // summaries / next-step already read (no new fetch, not producer-completeness;
  // deliberately card-local booleans). Feeds the hub per-group completion count.
  const cardFilled = {
    images: (profile.images?.length ?? 0) > 0,
    categories: categoryNames.length > 0,
    bio: realDescription !== "",
    products: productsForMarker > 0,
    pricing: Boolean(profile.top_product_name || profile.price_range),
    ownerStory: Boolean(
      (profile.owner_bio || "").trim() || profile.owner_photo_url
    ),
    license: Boolean(licenseRaw),
    kashrut: (profile.kashrut_badges || []).length > 0,
    location: Boolean((profile.city || "").trim()),
    delivery:
      profile.has_physical_location !== false ||
      Boolean(profile.offers_delivery),
    hours: Boolean((profile.opening_hours || "").trim()),
    // MEH-1544: opt-in field — "filled" means at least one day accepts orders.
    orderWindow: Object.keys(profile.order_window || {}).length > 0,
    contact: contactFilled,
    questions: (profile.custom_questions || []).length > 0,
  };

  // MEH-1408: hub-tile props per group — completion "{done}/{total}", the
  // next-step dot when the next step lands in this group, and up to two of the
  // group's existing filled previews (MEH-1158 peek). The location card drops
  // out of the membership for delivery-only profiles (it isn't mounted).
  const groupTile = (g) => {
    const members = GROUP_MEMBERS[g].filter(
      (k) => !(k === "location" && profile.has_physical_location === false)
    );
    const done = members.filter((k) => cardFilled[k]).length;
    const withPreview = members.filter((k) => cardFilled[k] && previews[k]);
    // MEH-1920: hub tiles take only fixed-shape previews (see HUB_PREVIEW_KEYS).
    const hubSafe = withPreview.filter((k) => HUB_PREVIEW_KEYS.has(k));
    const groupPreviews =
      hubSafe.length > 0
        ? hubSafe.slice(0, 2).map((k) => previews[k])
        : withPreview.length > 0
          ? // Filled, but every preview it could offer is free text: keep the
            // row with the dashed placeholder the empty cards already use,
            // rather than dropping the tile's preview row without a trace.
            [<PreviewEmpty key="hub-empty" />]
          : [];
    return {
      statusLine: tAcc("hub_progress", { done, total: members.length }),
      marker:
        nextStepKey && KEY_TO_GROUP[nextStepKey] === g ? nextStepDot : undefined,
      previews: groupPreviews,
    };
  };

  // MEH-1237: display name per dirty-card key — REUSES the exact heading
  // strings the accordion headers already render (no duplicated Hebrew). Keys
  // match the reportDirty keys the cards lift up.
  const DIRTY_CARD_NAMES = {
    images: t("images.heading"),
    categories: t("categories.heading"),
    license: t("license.heading"),
    location: t("location.heading"),
    bio: t("description_card.heading"),
    products: tProducts("section_heading"),
    contact: t("contact_channels.heading"),
    pricing: t("pricing.heading"),
    delivery: t("delivery.heading"),
    hours: t("hours.heading"),
    orderWindow: t("order_window.heading"),
    questions: t("custom_questions.heading"),
  };
  // Stable order (matches the accordion render order below), filtered to dirty.
  const DIRTY_ORDER = [
    "images", "categories", "license", "location", "bio", "products", "contact", "pricing", "delivery", "hours", "orderWindow", "questions",
  ];
  const dirtyKeys = DIRTY_ORDER.filter((k) => dirtyMap[k]);

  // MEH-1408: "back to all sections" — a <button> (router.push, NOT an <a>), so
  // the MEH-1100 nav guard doesn't intercept it: hub↔group keeps every card
  // mounted, so returning to the hub never risks unsaved work. Reused across
  // the 4 group wrappers.
  const backLink = (
    <button
      type="button"
      onClick={backToHub}
      data-testid="hub-back"
      className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
    >
      <CaretLeft size={16} aria-hidden="true" className="rtl:rotate-180" />
      {tAcc("hub_back")}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-6">
      {/* MEH-1100 + MEH-1237: sticky unsaved-changes banner — sits just under
          the layout's sticky tab nav (top-0 z-10, ~46px tall). Names the dirty
          cards with jump links (Shopify Polaris contextual save bar) instead of
          a generic message, so the owner knows exactly what's unsaved + where. */}
      {anyDirty && (
        <div
          className="sticky top-12 z-10 bg-white border border-primary rounded-[10px] px-4 py-2 text-sm text-text flex flex-wrap items-center gap-x-2 gap-y-1 shadow-sm"
          role="status"
          data-testid="unsaved-banner"
        >
          <Warning size={16} className="text-primary shrink-0" aria-hidden="true" />
          <span>{t("unsaved_guard.banner_prefix")}</span>
          <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            {dirtyKeys.map((key, i) => (
              <span key={key} className="inline-flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden="true" className="text-fg-muted">·</span>
                )}
                <button
                  type="button"
                  onClick={() => jumpToCard(key)}
                  data-testid={`unsaved-jump-${key}`}
                  className="underline underline-offset-2 font-medium hover:text-primary transition-colors"
                >
                  {DIRTY_CARD_NAMES[key]}
                </button>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* MEH-1408 hub-and-spoke: every view below stays MOUNTED and toggles via
          `hidden` (the same MEH-1116 idiom, lifted from per-card to per-group) —
          so card-local unsaved state + the MEH-1100 dirty aggregate survive
          hub↔group navigation. The accordion cards themselves are unchanged:
          anchor ids, summaries, previews, and the MEH-1132 next-step marker all
          carry over; only their grouping + render order moved. */}

      {/* ===== HUB (default — no ?group) ===== */}
      <div hidden={group !== null} className="space-y-6" data-testid="edit-hub">
        <h1 className="font-headline-lg text-xl font-bold text-text">
          {tAcc("hub_title")}
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {GROUP_KEYS.map((g) => {
            const tile = groupTile(g);
            return (
              <EditHubCard
                key={g}
                testId={`hub-card-${g}`}
                title={tAcc(`hub_group_${g}`)}
                marker={tile.marker}
                statusLine={tile.statusLine}
                previews={tile.previews}
                onClick={() => enterGroup(g)}
              />
            );
          })}
        </div>
      </div>

      {/* ===== GROUP: profile — images, categories, bio, products, pricing,
              owner-story ===== */}
      <div
        hidden={group !== "profile"}
        className="space-y-6"
        data-testid="group-profile"
      >
        {backLink}

        {/* ① Edit-tab chunk B — producer-facing gallery images editor */}
        <EditAccordionCard
          anchorId="images"
          title={t("images.heading")}
          summary={tAcc("images_summary", { count: profile.images?.length ?? 0 })}
          preview={previews.images}
          marker={nextStepKey === "images" ? nextStepDot : undefined}
          open={openKey === "images"}
          onToggle={() => toggleKey("images")}
        >
          <ImagesCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>

        {/* ② Edit-tab chunk A — producer-facing categories editor */}
        <EditAccordionCard
          anchorId="categories"
          title={t("categories.heading")}
          summary={tAcc("categories_summary", {
            count: profile.categories?.length ?? 0,
          })}
          preview={previews.categories}
          marker={nextStepKey === "categories" ? nextStepDot : undefined}
          open={openKey === "categories"}
          onToggle={() => toggleKey("categories")}
        >
          <CategoriesCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>

        {/* ④ MEH-1173: business description card (hero description + tagline + AI assist) */}
        <EditAccordionCard
          anchorId="bio"
          title={t("description_card.heading")}
          summary={
            (profile.description || "").trim() && !isDefaultDescription(profile.description)
              ? tAcc("bio_present")
              : tAcc("bio_missing")
          }
          preview={previews.bio}
          marker={nextStepKey === "bio" ? nextStepDot : undefined}
          open={openKey === "bio"}
          onToggle={() => toggleKey("bio")}
        >
          <DescriptionCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>

        {/* ⑤ MEH-999 follow-up — producer-facing product-catalog editor. Self-
            fetching (no profile prop): full CRUD against /producers/me/products.
            Relocated from settings/page.jsx, where it was defined but never
            mounted. MEH-1116: summary count seeds from the page profile's joined
            products and goes live via onCountChange once the card has fetched. */}
        <EditAccordionCard
          anchorId="products"
          title={tProducts("section_heading")}
          summary={tAcc("products_summary", {
            count: productsCount ?? profile.products?.length ?? 0,
          })}
          preview={previews.products}
          marker={nextStepKey === "products" ? nextStepDot : undefined}
          open={openKey === "products"}
          onToggle={() => toggleKey("products")}
        >
          {/* MEH-1306: back-link to the public products section — lives in the
              expanded body (the header is a <button>; no nested interactives). */}
          <ViewOnPageLink producerId={profile.id} anchor="section-products" />
          <ProductsSection embedded onCountChange={setProductsCount} />
        </EditAccordionCard>

        {/* MEH-1242 PR3 — price range + top product editor. MEH-1408: moved into
            the profile group (descriptive marketing info; the DNA carries no
            transactions, so it belongs with the profile, not a checkout flow). */}
        <EditAccordionCard
          anchorId="pricing"
          title={t("pricing.heading")}
          summary={
            [profile.top_product_name, profile.price_range]
              .filter(Boolean)
              .join(" · ") || tAcc("pricing_summary_empty")
          }
          preview={previews.pricing}
          open={openKey === "pricing"}
          onToggle={() => toggleKey("pricing")}
        >
          <PricingCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>

        {/* ④b MEH-1335 chunk 3 — owner-story editor (bio + photo). The public
            owner card (OwnerCard, MEH-1334 — heading key owner_story.heading)
            wakes its bio/photo variants up on its own once these fields hold
            data. */}
        <EditAccordionCard
          anchorId="owner-story"
          title={t("owner_story.heading")}
          summary={
            (profile.owner_bio || "").trim() || profile.owner_photo_url
              ? tAcc("owner_present")
              : tAcc("owner_missing")
          }
          open={openKey === "ownerStory"}
          onToggle={() => toggleKey("ownerStory")}
        >
          <OwnerStoryCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>
      </div>

      {/* ===== GROUP: trust — one unified "אישורים ותעודות" card composing the
              existing license + kashrut bodies as stacked sections (composition
              only — the card internals are untouched; the #license / #kashrut
              deep-link anchors move to the inner sub-sections). ===== */}
      <div
        hidden={group !== "trust"}
        className="space-y-6"
        data-testid="group-trust"
      >
        {backLink}

        <EditAccordionCard
          anchorId="trust"
          title={tAcc("hub_trust_card")}
          summary={[
            licenseMasked || t("license.summary_empty"),
            (profile.kashrut_badges || []).length
              ? tAcc("kashrut_has")
              : tAcc("kashrut_none"),
          ].join(" · ")}
          preview={previews.license}
          open={openKey === "trust"}
          onToggle={() => toggleKey("trust")}
        >
          {/* ②b MEH-1258 — producer license editor (sub-section of the unified
              trust card; heading reuses the prior accordion-header key). */}
          <div id="license" className="scroll-mt-24">
            <h3 className="font-headline-md text-sm font-bold text-text mb-3">
              {t("license.heading")}
            </h3>
            <LicenseCard
              profile={profile}
              onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
              reportDirty={reportDirty}
            />
          </div>

          {/* ②c MEH-1167 — kashrut-request card (second sub-section). Self-
              fetches its request list; no onSave — badges land via admin
              approval, not a producer profile write. */}
          <div
            id="kashrut"
            className="scroll-mt-24 mt-8 pt-6 border-t border-border"
          >
            <h3 className="font-headline-md text-sm font-bold text-text mb-3">
              {t("kashrut.heading")}
            </h3>
            <KashrutCard profile={profile} reportDirty={reportDirty} />
          </div>

          {/* ②d MEH-1508 ch2 Phase B — business-level dietary scope (own-catalog
              vegan/vegetarian + gluten facility). Sub-section next to kashrut;
              writes producer scope fields via PUT /producers/me (onSave merges). */}
          <div
            id="dietary-scope"
            className="scroll-mt-24 mt-8 pt-6 border-t border-border"
          >
            <h3 className="font-headline-md text-sm font-bold text-text mb-3">
              {t("dietaryScope.heading")}
            </h3>
            <DietaryScopeCard
              profile={profile}
              onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
              reportDirty={reportDirty}
            />
          </div>

          {/* ②e MEH-1851 row 23 — owner-declared grass_fed. Sits in the trust
              group next to dietary scope because it is the same KIND of claim:
              a business-level property the owner asserts and nobody verifies
              (labels.md records its evidence as `self-declared` already). It is
              NOT inside DietaryScopeCard: that card asks what the catalog
              CONTAINS, and how livestock was raised is not a dietary scope —
              folding it in would mislabel the question. The column was already
              writable via PUT /producers/me; only the ADMIN form could produce
              a value, which bought friction and no verification. */}
          <div
            id="grass-fed"
            className="scroll-mt-24 mt-8 pt-6 border-t border-border"
          >
            <h3 className="font-headline-md text-sm font-bold text-text mb-3">
              {t("grassFed.heading")}
            </h3>
            <GrassFedCard
              profile={profile}
              onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
              reportDirty={reportDirty}
            />
          </div>
        </EditAccordionCard>
      </div>

      {/* ===== GROUP: location — location, delivery, hours ===== */}
      <div
        hidden={group !== "location"}
        className="space-y-6"
        data-testid="group-location"
      >
        {backLink}

        {/* ③ Edit-tab chunk C — producer-facing location/coords editor.
            MEH-213: only physical-location producers have a map pin; delivery-only
            businesses intentionally have no lat/lng, so the card is hidden for
            them (has_physical_location === false). */}
        {profile.has_physical_location !== false && (
          <EditAccordionCard
            anchorId="location"
            title={t("location.heading")}
            summary={profile.city || tAcc("location_missing")}
            preview={previews.location}
            marker={nextStepKey === "location" ? nextStepDot : undefined}
            open={openKey === "location"}
            onToggle={() => toggleKey("location")}
          >
            <LocationCard
              profile={profile}
              onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
              reportDirty={reportDirty}
            />
          </EditAccordionCard>
        )}

        {/* MEH-1421 (MEH-1388 chunk 4a): multi-location editor (branch / pickup /
            market_stand). NOT gated on has_physical_location — a delivery-only
            producer may still run pickup points (chunk 2 reversed MEH-213 so
            those appear on the map). Owner CRUD against /producers/me/locations;
            the single-primary + same-city-label invariants live server-side. */}
        <EditAccordionCard
          anchorId="locations"
          title={tLoc("section_heading")}
          summary={
            profile.locations?.length
              ? String(profile.locations.length)
              : tLoc("empty_title")
          }
          open={openKey === "locations"}
          onToggle={() => toggleKey("locations")}
        >
          <LocationsEditor />
        </EditAccordionCard>

        {/* MEH-1242 PR5 — location-mode + delivery editor (owner now writes
            has_physical_location / offers_delivery / delivery_nationwide + cities). */}
        <EditAccordionCard
          anchorId="delivery"
          title={t("delivery.heading")}
          summary={
            [
              profile.has_physical_location !== false ? tAcc("delivery_mode_store") : null,
              profile.offers_delivery ? tAcc("delivery_mode_delivery") : null,
            ]
              .filter(Boolean)
              .join(" · ") || tAcc("delivery_none")
          }
          open={openKey === "delivery"}
          onToggle={() => toggleKey("delivery")}
        >
          <DeliveryCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>

        {/* MEH-1823 — the owner's single typed offer. Sits after delivery
            because the most common offer (free delivery over a threshold) is
            read against the delivery terms above it. Summary shows the live
            offer sentence, or "no active offer" — the empty state is a real
            state here, not a placeholder. */}
        <EditAccordionCard
          anchorId="offer"
          title={tOffer("card_title")}
          summary={
            profile.active_offer
              ? tOffer(`types.${profile.active_offer.offer_type}`)
              : tOffer("type_none")
          }
          open={openKey === "offer"}
          onToggle={() => toggleKey("offer")}
        >
          <OffersCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>

        {/* MEH-1242 PR5 — opening-hours editor (owner now writes opening_hours). */}
        <EditAccordionCard
          anchorId="hours"
          title={t("hours.heading")}
          summary={profile.opening_hours || tAcc("hours_empty")}
          open={openKey === "hours"}
          onToggle={() => toggleKey("hours")}
        >
          <HoursCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>

        {/* MEH-1544 — weekly ORDER-acceptance window. Opt-in and separate from
            the opening-hours card above: a business that never opens this
            renders nothing on its public page. */}
        <EditAccordionCard
          anchorId="order-window"
          title={t("order_window.heading")}
          summary={
            cardFilled.orderWindow
              ? t("order_window.summary_set", {
                  count: Object.keys(profile.order_window || {}).length,
                })
              : t("order_window.summary_empty")
          }
          open={openKey === "orderWindow"}
          onToggle={() => toggleKey("orderWindow")}
        >
          {/* MEH-1773: "חלון הזמנות" and the "זמינות" card on the dashboard
              landing page both read as "when am I open", so owners could not
              tell them apart. This names the distinction at the point of
              editing — the recurring weekly schedule — and its twin sits on
              the availability card (dashboard/page.js) saying the other half:
              a manual, temporary exception. */}
          <WhatsThis
            content={tWhat("order_window")}
            className="mb-1"
            testId="whats-this-order-window"
          />
          <OrderWindowEditor
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>
      </div>

      {/* ===== GROUP: contact — contact-channels, questions ===== */}
      <div
        hidden={group !== "contact"}
        className="space-y-6"
        data-testid="group-contact"
      >
        {backLink}

        {/* ⑥ MEH-296 Chunk 3b — producer-facing contact-channel editor */}
        <EditAccordionCard
          anchorId="contact-channels"
          title={t("contact_channels.heading")}
          summary={[
            profile.phone ? tAcc("contact_phone_ok") : null,
            tAcc("contact_primary", {
              channel: tAcc(
                `channel_${profile.primary_contact_method || "whatsapp"}`
              ),
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
          preview={previews.contact}
          marker={nextStepKey === "contact" ? nextStepDot : undefined}
          open={openKey === "contact"}
          onToggle={() => toggleKey("contact")}
        >
          <ContactChannelsCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>

        {/* ⑦ MEH-210 Phase 2 — custom WhatsApp question chips */}
        <EditAccordionCard
          anchorId="questions"
          title={t("custom_questions.heading")}
          summary={tAcc("questions_summary", {
            count: (profile.custom_questions || []).length,
          })}
          preview={previews.questions}
          open={openKey === "questions"}
          onToggle={() => toggleKey("questions")}
        >
          <CustomQuestionsCard
            profile={profile}
            onSave={(q) => setProfile((p) => p ? { ...p, custom_questions: q } : p)}
            reportDirty={reportDirty}
          />
        </EditAccordionCard>
      </div>
    </div>
  );
}

// ============================================================
// MEH-210 Phase 2: custom WhatsApp question chips
// ============================================================

const MAX_QUESTIONS = 5;

function CustomQuestionsCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.custom_questions");
  const tRoot = useTranslations("dashboard.producer");
  const [questions, setQuestions] = useState(() => {
    const saved = profile?.custom_questions || [];
    return [...saved, ...Array(MAX_QUESTIONS - saved.length).fill("")].slice(0, MAX_QUESTIONS);
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // MEH-1100: this card had no dirty flag — derive one by comparing the
  // trimmed non-empty questions against the saved list (the exact payload
  // handleSave sends), so a save clears it via the onSave profile patch.
  const savedQuestions = profile?.custom_questions || [];
  const currentPayload = questions.filter((q) => q.trim());
  const dirty =
    currentPayload.length !== savedQuestions.length ||
    currentPayload.some((q, i) => q !== savedQuestions[i]);
  useEffect(() => {
    reportDirty("questions", dirty);
    return () => reportDirty("questions", false);
  }, [dirty, reportDirty]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const payload = questions.filter((q) => q.trim());
      await api.put("/producers/me", { custom_questions: payload });
      onSave(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      showToast.error(tRoot("error_questions_save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* MEH-1116: chrome + heading live in the accordion header; the heading's
          InfoTooltip moved down to the subtitle so its content isn't lost. */}
      <p className="text-xs text-fg-muted mb-4">
        {t("subtitle")}
        <InfoTooltip content={t("tooltip")} position="bottom" />
      </p>
      {/* MEH-1477: content guidance — nudges owners toward the questions
          customers actually ask before buying (stock / delivery / ordering),
          reusing the MEH-1116 helper-text idiom. */}
      <p className="text-xs text-fg-muted mb-4">
        {t("guidance")}
      </p>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <Input
            key={i}
            type="text"
            value={q}
            maxLength={80}
            onChange={(e) => {
              const updated = [...questions];
              updated[i] = e.target.value;
              setQuestions(updated);
            }}
            placeholder={t(`placeholder_${i + 1}`)}
            className="text-sm"
            dir="rtl"
          />
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
      </button>
    </div>
  );
}

// ============================================================
// MEH-296 Chunk 3b: producer-facing contact-channels editor.
// Mirrors CustomQuestionsCard — local form seeded from profile, saves the
// contact subset via PUT /producers/me. The 7-value method guard + http(s)
// URL guard run server-side (Chunk 2, schemas.ProducerUpdate); 422 detail is
// surfaced inline. whatsapp + phone both back onto the `phone` value field.
// ============================================================

const PRIMARY_METHODS = [
  "whatsapp",
  "phone",
  "instagram",
  "email",
  "website",
  "facebook",
  "external_order",
];

function ContactChannelsCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.contact_channels");
  // MEH-1115: point-of-decision explainers (top-level whats_this namespace).
  const tWhat = useTranslations("whats_this");
  const seed = {
    phone: profile?.phone || "",
    instagram: profile?.instagram || "",
    website: profile?.website || "",
    // MEH-1242 PR3: whatsapp_group — backend whitelist already accepts it and
    // the public ContactCard already renders it; this is the missing editor.
    whatsapp_group: profile?.whatsapp_group || "",
    contact_email: profile?.contact_email || "",
    facebook: profile?.facebook || "",
    external_order_form: profile?.external_order_form || "",
    primary_contact_method: profile?.primary_contact_method || "whatsapp",
  };
  const [form, setForm] = useState(seed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hintField, setHintField] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty = Object.keys(seed).some((k) => form[k] !== seed[k]);
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("contact", dirty);
    return () => reportDirty("contact", false);
  }, [dirty, reportDirty]);

  const upd = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
    // Clear a stale empty-primary hint/summary when its backing field is
    // edited, OR when the primary method changes (the prior hint targeted a
    // field that may no longer back the chosen method). PR #1137 review.
    if (hintField === field || field === "primary_contact_method") {
      setHintField(null);
      setErrorMsg(null);
    }
  };

  const handleSave = async () => {
    // Validate on save (not while typing): the chosen primary method must
    // have its backing value field filled. Inline hint + block, no disable.
    const backing = METHOD_FIELD[form.primary_contact_method];
    if (backing && !form[backing].trim()) {
      setHintField(backing);
      setErrorMsg(t("error_summary"));
      return;
    }
    setHintField(null);
    setErrorMsg(null);
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        phone: form.phone.trim() || null,
        instagram: form.instagram.trim() || null,
        website: form.website.trim() || null,
        whatsapp_group: form.whatsapp_group.trim() || null,
        contact_email: form.contact_email.trim() || null,
        facebook: form.facebook.trim() || null,
        external_order_form: form.external_order_form.trim() || null,
        primary_contact_method: form.primary_contact_method,
      };
      await api.put("/producers/me", payload);
      onSave(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // Surface the server contact guards inline (Chunk-2 scheme / 7-value +
      // MEH-1537 email/phone/whatsapp_group format). detailToMessage handles
      // BOTH the string detail (400/409) and the 422 RequestValidationError
      // array — the earlier `typeof detail === "string"` check collapsed the
      // 422 array to the generic copy, hiding the specific Hebrew field error.
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field) => (hintField === field ? t("hint_empty") : undefined);

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>
      {/* MEH-1306: back-link to the public contact-card section. */}
      <ViewOnPageLink producerId={profile?.id} anchor="section-contact" />

      <div className="space-y-3">
        <Input type="tel" inputMode="tel" dir="ltr" label={t("field_phone")} helperText={t("phone_field_helper")} value={form.phone}
          onChange={(e) => upd("phone", e.target.value)} error={fieldError("phone")} />
        {/* MEH-1597: each placeholder shows the shape that field's validator
            actually accepts (ProducerUpdate, backend/app/schemas/schemas.py).
            instagram is the odd one out: it has NO validator (:997 is a bare
            `str | None` — :1205 covers only website/facebook/external_order_form)
            and ContactCard.jsx:105-106 builds `https://instagram.com/${handle}`
            itself, so a URL here would render a doubled, dead link. Bare handle
            on purpose. */}
        <Input type="text" dir="ltr" label={t("field_instagram")} value={form.instagram}
          placeholder={t("instagram_placeholder")}
          onChange={(e) => upd("instagram", e.target.value)} error={fieldError("instagram")} />
        <Input type="url" dir="ltr" label={t("field_website")} value={form.website}
          placeholder={t("website_placeholder")}
          onChange={(e) => upd("website", e.target.value)} error={fieldError("website")} />
        {/* MEH-1242 PR3: WhatsApp group link — not a primary method, so no
            empty-primary guard applies (fieldError never targets it). */}
        <Input type="url" dir="ltr" label={t("field_whatsapp_group")} value={form.whatsapp_group}
          placeholder={t("whatsapp_group_placeholder")}
          onChange={(e) => upd("whatsapp_group", e.target.value)} />
        <Input type="email" inputMode="email" dir="ltr" label={t("field_email")} value={form.contact_email}
          placeholder={t("email_placeholder")}
          onChange={(e) => upd("contact_email", e.target.value)} error={fieldError("contact_email")} />
        <Input type="url" dir="ltr" label={t("field_facebook")} value={form.facebook}
          placeholder={t("facebook_placeholder")}
          onChange={(e) => upd("facebook", e.target.value)} error={fieldError("facebook")} />
        <Input type="url" dir="ltr" label={t("field_external_order")} value={form.external_order_form}
          onChange={(e) => upd("external_order_form", e.target.value)} error={fieldError("external_order_form")} />
        {/* MEH-1115: what an external order form is, right under its field. */}
        <WhatsThis content={tWhat("order_form")} testId="whats-this-order-form" />
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-text">{t("primary_legend")}</legend>
        {/* MEH-1115: what the primary channel means, at the point of choice. */}
        <WhatsThis content={tWhat("primary_channel")} className="mb-1" testId="whats-this-primary-channel" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PRIMARY_METHODS.map((m) => {
            // MEH-1093 F5: disable a method whose backing field is empty up-front
            // (except the current selection — the save-time guard + inline hint
            // still cover that), so the owner can't pick a channel that would
            // only fail on save. Filling the field re-enables it live.
            const backing = METHOD_FIELD[m];
            const backingEmpty = backing && !form[backing].trim();
            const disabled = backingEmpty && form.primary_contact_method !== m;
            return (
              <label
                key={m}
                title={disabled ? t("hint_empty") : undefined}
                className={`flex items-center gap-2 text-sm ${
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="primary_contact_method"
                  value={m}
                  checked={form.primary_contact_method === m}
                  disabled={disabled}
                  onChange={() => upd("primary_contact_method", m)}
                  className="accent-primary"
                />
                <span>{t(`primary_${m}`)}</span>
              </label>
            );
          })}
        </div>
        {PRIMARY_METHODS.some((m) => {
          const b = METHOD_FIELD[m];
          return b && !form[b].trim() && form.primary_contact_method !== m;
        }) && <p className="text-xs text-fg-muted mt-2">{t("hint_empty")}</p>}
      </fieldset>

      {errorMsg && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
      </button>
    </div>
  );
}
