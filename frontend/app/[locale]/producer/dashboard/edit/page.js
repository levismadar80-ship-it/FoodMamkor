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
 *           GET /categories, cloudinary thumbnails, component tests).
 *
 * Auth: producer-role guard via useAuth() — kept per-page until Phase 2.
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Warning, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { useAuth } from "@/lib/auth-context";
import InfoTooltip from "@/components/InfoTooltip";
import WhatsThis from "@/components/WhatsThis";
import EditAccordionCard from "@/components/EditAccordionCard";
import Input from "@/components/ui/Input";
import AddressSearch from "@/components/AddressSearch";
import ProductsSection from "@/components/ProductsSection";

// MEH-1116: stable English anchor id per card → the page-local open-state key.
// The anchor ids are a public deep-link contract (#contact-channels …) —
// MEH-1106's completeness checklist consumes them next. Do not rename.
const ANCHOR_TO_KEY = {
  bio: "bio",
  questions: "questions",
  "contact-channels": "contact",
  categories: "categories",
  images: "images",
  location: "location",
  products: "products",
};

export default function ProducerDashboardEditPage() {
  const router = useRouter();
  const t = useTranslations("dashboard.producer");
  // MEH-1116: accordion titles + one-line status summaries.
  const tAcc = useTranslations("dashboard.producer.edit_accordion");
  const tProducts = useTranslations("settings.products");
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);

  // MEH-1116: accordion state — one card open at a time, all collapsed on load.
  const [openKey, setOpenKey] = useState(null);
  const toggleKey = useCallback(
    (key) => setOpenKey((k) => (k === key ? null : key)),
    []
  );
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

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api.get("/producers/me").then((r) => setProfile(r.data)).catch(() => setProfile(null));
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

  // MEH-1116: URL-hash deep link — #<anchor> auto-expands its card and scrolls
  // to it, on load (once the profile has rendered the sections) and on every
  // hashchange. Unknown hashes are ignored; #location on a delivery-only
  // profile (card not mounted) is a silent no-op.
  useEffect(() => {
    if (!profile) return;
    const applyHash = () => {
      const anchor = window.location.hash.replace(/^#/, "");
      const key = ANCHOR_TO_KEY[anchor];
      if (!key) return;
      setOpenKey(key);
      // Wait a frame so the panel un-hides before measuring scroll position.
      requestAnimationFrame(() => {
        document
          .getElementById(anchor)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [profile]);

  if (authLoading || !user || user.role !== "producer") return null;

  if (!profile) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
        {t("loading_data")}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-6">
      {/* MEH-1100: sticky unsaved-changes banner — sits just under the
          layout's sticky tab nav (top-0 z-10, ~46px tall). */}
      {anyDirty && (
        <div
          className="sticky top-12 z-10 bg-white border border-primary rounded-[10px] px-4 py-2 text-sm text-text flex items-center gap-2 shadow-sm"
          role="status"
          data-testid="unsaved-banner"
        >
          <Warning size={16} className="text-primary shrink-0" aria-hidden="true" />
          {t("unsaved_guard.banner")}
        </div>
      )}

      {/* MEH-1116: each card collapses to an accordion row — header carries
          the title + a live one-line status summary computed from the SAME
          page profile the cards edit (no new API). Cards stay MOUNTED when
          collapsed (hidden-toggle inside EditAccordionCard) so unsaved state
          and the MEH-1100 guard survive collapse. One open at a time. */}

      {/* MEH-56: AI bio writer panel */}
      <EditAccordionCard
        anchorId="bio"
        title={t("bio.heading")}
        summary={
          (profile.description || "").trim()
            ? tAcc("bio_present")
            : tAcc("bio_missing")
        }
        open={openKey === "bio"}
        onToggle={() => toggleKey("bio")}
      >
        <BioPanelCard
          profile={profile}
          onSave={(bio) => setProfile((p) => p ? { ...p, description: bio } : p)}
          reportDirty={reportDirty}
        />
      </EditAccordionCard>

      {/* MEH-210 Phase 2 — custom WhatsApp question chips */}
      <EditAccordionCard
        anchorId="questions"
        title={t("custom_questions.heading")}
        summary={tAcc("questions_summary", {
          count: (profile.custom_questions || []).length,
        })}
        open={openKey === "questions"}
        onToggle={() => toggleKey("questions")}
      >
        <CustomQuestionsCard
          profile={profile}
          onSave={(q) => setProfile((p) => p ? { ...p, custom_questions: q } : p)}
          reportDirty={reportDirty}
        />
      </EditAccordionCard>

      {/* MEH-296 Chunk 3b — producer-facing contact-channel editor */}
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
        open={openKey === "contact"}
        onToggle={() => toggleKey("contact")}
      >
        <ContactChannelsCard
          profile={profile}
          onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
          reportDirty={reportDirty}
        />
      </EditAccordionCard>

      {/* Edit-tab chunk A — producer-facing categories editor */}
      <EditAccordionCard
        anchorId="categories"
        title={t("categories.heading")}
        summary={tAcc("categories_summary", {
          count: profile.categories?.length ?? 0,
        })}
        open={openKey === "categories"}
        onToggle={() => toggleKey("categories")}
      >
        <CategoriesCard
          profile={profile}
          onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
          reportDirty={reportDirty}
        />
      </EditAccordionCard>

      {/* Edit-tab chunk B — producer-facing gallery images editor */}
      <EditAccordionCard
        anchorId="images"
        title={t("images.heading")}
        summary={tAcc("images_summary", { count: profile.images?.length ?? 0 })}
        open={openKey === "images"}
        onToggle={() => toggleKey("images")}
      >
        <ImagesCard
          profile={profile}
          onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
          reportDirty={reportDirty}
        />
      </EditAccordionCard>

      {/* Edit-tab chunk C — producer-facing location/coords editor.
          MEH-213: only physical-location producers have a map pin; delivery-only
          businesses intentionally have no lat/lng, so the card is hidden for
          them (has_physical_location === false). */}
      {profile.has_physical_location !== false && (
        <EditAccordionCard
          anchorId="location"
          title={t("location.heading")}
          summary={profile.city || tAcc("location_missing")}
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

      {/* MEH-999 follow-up — producer-facing product-catalog editor. Self-
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
        open={openKey === "products"}
        onToggle={() => toggleKey("products")}
      >
        <ProductsSection embedded onCountChange={setProductsCount} />
      </EditAccordionCard>
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
      alert(tRoot("error_questions_save"));
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
      <p className="text-xs text-fg-muted mb-4">
        {t("context_line")}
      </p>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <input
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
            className="w-full border border-border rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-primary transition"
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

// Which value field backs each primary method (empty-on-save guard).
const METHOD_FIELD = {
  whatsapp: "phone",
  phone: "phone",
  instagram: "instagram",
  email: "contact_email",
  website: "website",
  facebook: "facebook",
  external_order: "external_order_form",
};

function ContactChannelsCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.contact_channels");
  // MEH-1115: point-of-decision explainers (top-level whats_this namespace).
  const tWhat = useTranslations("whats_this");
  const seed = {
    phone: profile?.phone || "",
    instagram: profile?.instagram || "",
    website: profile?.website || "",
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
      // Surface the Chunk-2 server guards (scheme / 7-value) inline.
      const detail = err?.response?.data?.detail;
      setErrorMsg(typeof detail === "string" ? detail : t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field) => (hintField === field ? t("hint_empty") : undefined);

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      <div className="space-y-3">
        <Input type="tel" dir="ltr" label={t("field_phone")} helperText={t("phone_field_helper")} value={form.phone}
          onChange={(e) => upd("phone", e.target.value)} error={fieldError("phone")} />
        <Input type="text" dir="ltr" label={t("field_instagram")} value={form.instagram}
          onChange={(e) => upd("instagram", e.target.value)} error={fieldError("instagram")} />
        <Input type="url" dir="ltr" label={t("field_website")} value={form.website}
          onChange={(e) => upd("website", e.target.value)} error={fieldError("website")} />
        <Input type="email" dir="ltr" label={t("field_email")} value={form.contact_email}
          onChange={(e) => upd("contact_email", e.target.value)} error={fieldError("contact_email")} />
        <Input type="url" dir="ltr" label={t("field_facebook")} value={form.facebook}
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

// ============================================================
// Edit-tab chunk A: producer-facing categories editor.
// Mirrors ContactChannelsCard — local selection seeded from
// profile.categories, saves category_ids via PUT /producers/me. A
// license-required category chosen with no license number triggers a backend
// 422 (ensure_license_for_categories, producer_me.py); the Hebrew detail is
// surfaced inline via detailToMessage (lib/errors.js), never the generic copy.
// REUSES: components/admin/ProducerForm.jsx:207-217,433-451 (GET /categories
// checkbox grid + toggle), producer-self version.
// ============================================================

// Exported for isolation tests (EditTabCategoriesCard.test.jsx). Mounting the
// whole page under jsdom hangs the vitest runner, so the cards are tested
// directly — the default page export is unchanged.
export function CategoriesCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.categories");
  const [allCategories, setAllCategories] = useState([]);
  const seedIds = (profile?.categories || []).map((c) => c.id);
  const [selected, setSelected] = useState(seedIds);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/categories")
      .then((r) => {
        if (!cancelled) {
          setAllCategories(r.data || []);
          setFetchError(null);
        }
      })
      .catch((err) => {
        // Surface a load failure instead of a silently-empty grid (a producer
        // would otherwise see a blank card with no way to know it failed).
        if (!cancelled) {
          setAllCategories([]);
          setFetchError(detailToMessage(err?.response?.data?.detail) || t("fetch_error"));
        }
      });
    return () => {
      cancelled = true;
    };
    // `t` (next-intl translator) has a stable identity per locale/namespace,
    // so listing it re-runs the fetch only on a real locale change — never a
    // per-render loop. (The earlier loop came from an ad-hoc test mock that
    // returned a fresh `t` each render; tests now use the real
    // NextIntlClientProvider, so the honest dependency is safe.)
  }, [t]);

  // Dirty when the selection differs from the seeded set (order-independent).
  const dirty =
    seedIds.length !== selected.length ||
    seedIds.some((id) => !selected.includes(id));
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("categories", dirty);
    return () => reportDirty("categories", false);
  }, [dirty, reportDirty]);

  const toggle = (id) => {
    setSaved(false);
    setErrorMsg(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      await api.put("/producers/me", { category_ids: selected });
      // Keep the parent profile in sync so a re-render reseeds correctly.
      onSave({ categories: allCategories.filter((c) => selected.includes(c.id)) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // Surface the backend Hebrew detail (e.g. license-required 422) inline;
      // detailToMessage normalises the FastAPI 422 detail-array (MEH-989).
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      {fetchError ? (
        <p className="flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {fetchError}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {allCategories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggle(c.id)}
                className="w-4 h-4 accent-primary"
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      )}

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

// ============================================================
// Edit-tab chunk B: producer-facing gallery images editor.
// Mirrors ContactChannelsCard (card/save/dirty pattern) + the admin
// ProducerForm image grid (upload loop + remove + hover-grid, producer-self
// version). Multi-file upload via POST /upload/image; saves images[] via PUT
// /producers/me (backend runs Cloudinary cleanup for removed URLs). Upload
// errors are surfaced inline via detailToMessage (lib/errors.js).
// REUSES: components/admin/ProducerForm.jsx:219-243,630-662.
// ============================================================

// Exported for isolation tests (EditTabImagesCard.test.jsx) — see CategoriesCard.
export function ImagesCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.images");
  const seed = profile?.images || [];
  const [images, setImages] = useState(seed);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Dirty when the list differs from the seeded set (order-sensitive: a reorder
  // would count as dirty, but this editor has no reorder — add/remove only).
  const dirty =
    seed.length !== images.length || seed.some((url, i) => url !== images[i]);
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("images", dirty);
    return () => reportDirty("images", false);
  }, [dirty, reportDirty]);

  // MEH-1099: shared upload path — the file input's onChange and the
  // dropzone's onDrop both feed here, so drag-drop reuses the exact
  // POST /upload/image + Cloudinary flow (no parallel mechanism).
  const uploadFiles = async (files) => {
    if (!files.length) return;
    setSaved(false);
    setErrorMsg(null);
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await api.post("/upload/image", fd);
        uploaded.push(r.data.url);
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e) => {
    await uploadFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    // Only image files — a dropped PDF/zip silently filters out, matching
    // the input's accept="image/*" gate on the click path.
    uploadFiles(
      Array.from(e.dataTransfer?.files || []).filter((f) =>
        f.type.startsWith("image/")
      )
    );
  };

  // Remove by index (not by URL value): if images[] ever holds a duplicate
  // URL (backend drift / bad prior save), a value-filter would drop every
  // copy at once. Index-based removal deletes exactly the clicked thumbnail.
  const removeImage = (index) => {
    setSaved(false);
    setErrorMsg(null);
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      await api.put("/producers/me", { images });
      onSave({ images });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      <label
        data-testid="images-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          // Ignore leave events from moving over child nodes — only clear
          // the drop state when the cursor truly exits the zone.
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
        }}
        onDrop={handleDrop}
        className={`inline-flex items-center text-sm border border-dashed rounded-[10px] px-4 py-3 cursor-pointer transition ${
          dragOver ? "border-primary bg-green-50" : "border-border hover:bg-green-50"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={handleUpload}
        />
        {uploading ? t("uploading") : dragOver ? t("drop_here") : t("add_cta")}
      </label>

      {/* MEH-1099: photography tips — wording from Brand Hub 05-photography-style
          (imagery SoT, MEH-788) + the approved product-photography guide.
          DO NOT reword here — brand-book-precedes-code. */}
      <ul className="mt-3 space-y-1 text-xs text-fg-muted">
        {["light", "real", "no_stock"].map((k) => (
          <li key={k} className="flex items-start gap-1.5">
            <span
              aria-hidden="true"
              className="mt-[5px] w-1 h-1 rounded-full bg-primary shrink-0"
            />
            {t(`tips.${k}`)}
          </li>
        ))}
      </ul>

      {images.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mt-4">
          {images.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizeCloudinary(url)}
                alt=""
                className="w-full h-24 object-cover rounded-[8px] border border-border"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 start-1 bg-error text-white rounded-full w-6 h-6 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                aria-label={t("remove_aria")}
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {errorMsg && (
        // MEH-1099: text-error (ADR-026) — the drag-drop path made this error
        // display newly reachable; sibling text-red-600 sites in the other
        // cards stay for the MEH-1086 follow-up sweep.
        <p className="mt-3 flex items-center gap-1.5 text-xs text-error" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || uploading || !dirty}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </button>
    </div>
  );
}

// ============================================================
// Edit-tab chunk C: producer-facing location/coords editor (gated).
// Mirrors ContactChannelsCard (card/save/dirty/inline-error). The owner types
// an address into AddressSearch (Nominatim geocode, no Leaflet); onSelect
// returns {lat,lng,city}; Save persists them via PUT /producers/me. Rendered
// only for physical-location producers (gated at the mount, MEH-213) — no map,
// no pin-drag, no radius.
// REUSES: components/AddressSearch.jsx (onSelect {street,neighborhood,city,lat,lng}).
// ============================================================

// Exported for isolation tests (EditTabLocationCard.test.jsx) — see CategoriesCard.
export function LocationCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.location");
  const seedLat = profile?.lat ?? null;
  const seedLng = profile?.lng ?? null;
  const seedCity = profile?.city ?? "";
  const [coords, setCoords] = useState({ lat: seedLat, lng: seedLng, city: seedCity });
  const [addressText, setAddressText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty =
    coords.lat !== seedLat || coords.lng !== seedLng || coords.city !== seedCity;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("location", dirty);
    return () => reportDirty("location", false);
  }, [dirty, reportDirty]);

  const handleSelect = (picked) => {
    setSaved(false);
    setErrorMsg(null);
    // Keep the seeded city if Nominatim doesn't resolve one (never clobber).
    setCoords({
      lat: picked.lat,
      lng: picked.lng,
      city: picked.city || coords.city,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      await api.put("/producers/me", {
        lat: coords.lat,
        lng: coords.lng,
        city: coords.city || null,
      });
      onSave({ lat: coords.lat, lng: coords.lng, city: coords.city });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  const hasCoords = coords.lat != null && coords.lng != null;

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      {hasCoords && (
        <p className="text-xs text-fg-muted mb-3">
          {t("current_prefix")}{" "}
          <span className="text-text">
            {coords.city ? `${coords.city} · ` : ""}
            <span dir="ltr">{coords.lat}, {coords.lng}</span>
          </span>
        </p>
      )}

      <AddressSearch
        id="producer-location-address"
        label={t("heading")}
        value={addressText}
        onChange={setAddressText}
        onSelect={handleSelect}
      />

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
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </button>
    </div>
  );
}

// ============================================================
// MEH-56: AI bio writer panel
// ============================================================

function BioPanelCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.bio");
  const [source, setSource] = useState(profile.instagram || "");
  const [generatedBio, setGeneratedBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // MEH-1100: this card had no dirty flag — the losable state is a generated
  // bio that hasn't been saved yet (typing a source alone costs nothing).
  const dirty = Boolean(generatedBio) && !saved;
  useEffect(() => {
    reportDirty("bio", dirty);
    return () => reportDirty("bio", false);
  }, [dirty, reportDirty]);

  const generate = async () => {
    if (!source.trim()) return;
    setLoading(true);
    setError("");
    setGeneratedBio("");
    setSaved(false);
    try {
      const r = await api.post("/producers/me/bio/generate", { source: source.trim() });
      setGeneratedBio(r.data.bio || "");
      if (!r.data.bio) setError(t("error_empty_bio"));
    } catch {
      setError(t("error_generate"));
    }
    setLoading(false);
  };

  const saveBio = async () => {
    if (!generatedBio) return;
    setSaving(true);
    try {
      await api.put("/producers/me", { description: generatedBio });
      onSave(generatedBio);
      setSaved(true);
    } catch {
      setError(t("error_save"));
    }
    setSaving(false);
  };

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-3">
        {t("intro")}
      </p>

      <textarea
        value={source}
        onChange={(e) => { setSource(e.target.value); setSaved(false); setGeneratedBio(""); }}
        placeholder={t("source_placeholder")}
        className="w-full border border-border rounded-[10px] px-3 py-2 text-sm resize-none h-16"
        dir="ltr"
        maxLength={500}
      />

      <button
        onClick={generate}
        disabled={loading || !source.trim()}
        className="w-full mt-2 bg-primary text-white py-2 rounded-[10px] text-sm font-medium disabled:opacity-50 hover:bg-primary-dark transition"
      >
        {loading ? t("generating") : t("generate_cta")}
      </button>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {generatedBio && (
        <div className="mt-3 space-y-2">
          <textarea
            value={generatedBio}
            onChange={(e) => setGeneratedBio(e.target.value.slice(0, 150))}
            className="w-full border border-primary/30 bg-primary/5 rounded-[10px] px-3 py-2 text-sm resize-none h-16"
            dir="rtl"
            maxLength={150}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">{generatedBio.length}/150</span>
            <button
              onClick={saveBio}
              disabled={saving}
              className="bg-primary text-white px-4 py-1.5 rounded-[8px] text-xs font-medium disabled:opacity-50 hover:bg-primary-dark transition"
            >
              {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
