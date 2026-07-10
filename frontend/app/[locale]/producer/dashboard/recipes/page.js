"use client";

/**
 * Producer dashboard — recipes tab (MEH-590 chunk 3/4).
 *
 * List view + inline "Add new" toggle mirroring
 * frontend/app/[locale]/producer/dashboard/group-buys/page.js:193-335.
 * Edit lives at recipes/[id]/edit/page.js to keep route shape predictable.
 *
 * Auth: producer-role guard via useAuth(); reads recipes from
 * GET /producers/me/recipes (returns all moderation states).
 *
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { Bread } from "@phosphor-icons/react";
import EmptyState from "@/components/ui/EmptyState";
import RecipeForm from "@/components/RecipeForm";
import RecipeStatusBadge from "@/components/RecipeStatusBadge";

export default function ProducerRecipesPage() {
  const t = useTranslations("recipes.dashboard");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const load = async () => {
    try {
      const res = await api.get("/producers/me/recipes");
      setItems(res.data || []);
    } catch {
      setItems([]);
    }
  };

  const handleDelete = async (recipeId) => {
    if (!window.confirm(t("delete_confirm"))) return;
    try {
      await api.delete(`/producers/me/recipes/${recipeId}`);
      showToast.success(t("toast_deleted"));
      load();
    } catch (err) {
      showToast.error(detailToMessage(err.response?.data?.detail) || t("toast_delete_error"));
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/producer/dashboard"
            className="text-sm text-primary hover:underline"
          >
            {t("back")}
          </Link>
          <h1 className="font-headline-md text-2xl font-bold text-text mt-1">
            {t("heading")}
          </h1>
        </div>
        {/* MEH-1097 F14: hide the top toggle in the empty state — the EmptyState
            CTA is the single "publish" button there. It returns once recipes
            exist, or while the create form is open (rendering as "close"). */}
        {!(items?.length === 0 && !showForm) && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition"
          >
            {showForm ? t("btn_close_form") : t("btn_open_form")}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-8">
          <RecipeForm
            mode="create"
            onSaved={() => {
              setShowForm(false);
              load();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {items === null ? (
        <div className="text-center py-16 text-fg-muted">{t("loading")}</div>
      ) : items.length === 0 ? (
        // MEH-996: empty state and the open create form are mutually
        // exclusive — never mounted together (settings/page.jsx precedent).
        !showForm && (
          <EmptyState
            icon={Bread}
            title={t("empty_title")}
            description={t("empty_description")}
            ctaLabel={t("empty_cta")}
            ctaOnClick={() => setShowForm(true)}
            example={
              <div className="w-full max-w-xs text-start opacity-70">
                <p className="text-[11px] text-fg-muted mb-1">{t("sample_label")}</p>
                <div className="border border-border rounded-[12px] p-3 bg-surface-card flex items-center gap-3">
                  <div className="w-14 h-14 rounded-[8px] bg-green-50 flex items-center justify-center shrink-0">
                    <Bread size={22} className="text-fg-muted" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{t("sample_title")}</p>
                    <p className="text-xs text-fg-muted">{t("sample_meta")}</p>
                  </div>
                </div>
              </div>
            }
          />
        )
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-[14px] border border-border p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-text truncate">
                    {r.title}
                  </h2>
                  {r.description && (
                    <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">
                      {r.description}
                    </p>
                  )}
                </div>
                <RecipeStatusBadge status={r.moderation_status} />
              </div>

              {r.moderation_status === "needs_revision" && r.moderation_notes && (
                <div className="rounded-[10px] p-3 text-sm mb-3 bg-orange-50 border border-orange-200 text-orange-800">
                  <strong>{t("notes_needs_revision")}</strong> {r.moderation_notes}
                </div>
              )}
              {r.moderation_status === "rejected" && r.moderation_notes && (
                <div className="rounded-[10px] p-3 text-sm mb-3 bg-red-50 border border-red-200 text-red-800">
                  <strong>{t("notes_rejected")}</strong> {r.moderation_notes}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-fg-muted">
                <span>
                  {r.published ? t("published") : t("not_published")}
                </span>
                <span>·</span>
                <Link
                  href={`/producer/dashboard/recipes/${r.id}/edit`}
                  className="text-primary hover:underline"
                >
                  {t("edit")}
                </Link>
                <span>·</span>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-red-600 hover:underline"
                >
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
