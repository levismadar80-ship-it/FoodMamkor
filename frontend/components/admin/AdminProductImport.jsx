// @ts-check
"use client";

/**
 * Module:   AdminProductImport
 * Purpose:  The admin imports a business's catalog from its existing store as
 *           DRAFTS, reviews them, and approves (in the owner's place, Sapir
 *           16.11) or deletes them. Nothing is public until approved.
 * Touches:  POST /admin/producers/{id}/product-import,
 *           GET /admin/producers/{id}/product-drafts,
 *           POST /admin/producers/{id}/product-drafts/approve,
 *           DELETE /admin/producers/{id}/product-drafts/{product_id}.
 * Does NOT: Fetch the source store (the rows are pasted as JSON — the
 *           extractor is scripts/import/mypips-extract.mjs), show or upload
 *           images (MEH-1184), or edit published products.
 * History:  MEH-2312 (creation).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import InlineMessage from "@/components/ui/InlineMessage";
// Rule 19: parse both responses before reading them (generated from openapi).
import {
  AdminImportProductsAdminProducersProducerIdProductImportPostResponse as ImportResultSchema,
  AdminListProductDraftsAdminProducersProducerIdProductDraftsGetResponse as DraftListSchema,
} from "@/lib/generated/api.zod";

const UNIT_KEYS = new Set(["unit", "kg", "100g"]);

/**
 * @param {string} text
 * @returns {{ rows: any[] } | { error: string }}
 */
function parseRows(text) {
  try {
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : data?.rows;
    if (!Array.isArray(rows)) return { error: "shape" };
    return { rows };
  } catch {
    return { error: "json" };
  }
}

/** @param {{ producerId: string }} props */
export default function AdminProductImport({ producerId }) {
  const t = useTranslations("admin.producers.product_import");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState(/** @type {any[] | null} */ (null));
  const [result, setResult] = useState(/** @type {any} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);

  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api.get(`/admin/producers/${producerId}/product-drafts`);
      const parsed = DraftListSchema.safeParse(r.data);
      if (!parsed.success) throw new Error("schema");
      setDrafts(parsed.data);
      setLoadFailed(false);
    } catch {
      // A failed load is NOT "nothing to approve" — say so instead.
      setDrafts(null);
      setLoadFailed(true);
    }
  }, [producerId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (/** @type {() => Promise<void>} */ fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("error"));
    } finally {
      setBusy(false);
    }
  };

  const onImport = () => {
    const parsed = parseRows(text);
    if ("error" in parsed) {
      setError(t(parsed.error === "json" ? "error_json" : "error_shape"));
      return;
    }
    run(async () => {
      const r = await api.post(`/admin/producers/${producerId}/product-import`, { rows: parsed.rows });
      const checked = ImportResultSchema.safeParse(r.data);
      if (!checked.success) throw new Error("schema");
      setResult(checked.data);
      setText("");
      await load();
    });
  };

  const onApproveAll = () =>
    run(async () => {
      // Exactly the drafts on screen — a second import that landed after this
      // list loaded is never published unseen.
      const r = await api.post(`/admin/producers/${producerId}/product-drafts/approve`, {
        product_ids: (drafts || []).map((d) => d.id),
      });
      setResult({ approved: r.data.approved });
      await load();
    });

  const onDelete = (/** @type {string} */ id) =>
    run(async () => {
      await api.delete(`/admin/producers/${producerId}/product-drafts/${id}`);
      await load();
    });

  const count = drafts?.length ?? 0;

  return (
    <section className="bg-surface rounded-md border border-border p-6 space-y-4" data-testid="admin-product-import">
      <h2 className="font-semibold text-lg text-primary">{t("title")}</h2>
      <p className="text-sm text-fg-muted">{t("intro")}</p>

      <Textarea
        label={t("paste_label")}
        helperText={t("paste_help")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        dir="ltr"
        className="font-mono text-xs resize-y"
      />
      <Button type="button" size="sm" onClick={onImport} disabled={busy || !text.trim()}>
        {t("import_cta")}
      </Button>

      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      {result && "created" in result && (
        <InlineMessage tone="success" data-testid="import-result">
          {t("result", {
            created: result.created,
            skipped: result.skipped_duplicates.length,
            invalid: result.invalid.length,
          })}
        </InlineMessage>
      )}
      {result?.invalid?.length > 0 && (
        <ul className="text-xs text-fg-muted list-disc ps-5" data-testid="import-invalid">
          {result.invalid.map((/** @type {any} */ row) => (
            <li key={row.index}>
              {t("invalid_row", { n: row.index + 1, name: row.name || "—", reason: row.reason })}
            </li>
          ))}
        </ul>
      )}
      {result?.unknown_units?.length > 0 && (
        <InlineMessage tone="error" data-testid="import-unknown-units">
          {t("unknown_units", { units: result.unknown_units.join(", ") })}
        </InlineMessage>
      )}
      {result && "approved" in result && (
        <InlineMessage tone="success">{t("approved", { count: result.approved })}</InlineMessage>
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{t("drafts_title", { count })}</h3>
        {count > 0 && (
          <Button type="button" size="sm" variant="outlined" onClick={onApproveAll} disabled={busy}>
            {t("approve_all_cta", { count })}
          </Button>
        )}
      </div>
      {loadFailed && <InlineMessage tone="error">{t("load_failed")}</InlineMessage>}
      {drafts !== null && count === 0 && <p className="text-sm text-fg-muted">{t("drafts_empty")}</p>}
      {count > 0 && (
        <ul className="divide-y divide-border text-sm" data-testid="draft-list">
          {drafts?.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <span className="flex-1 min-w-0 truncate">{d.name}</span>
              <span className="text-fg-muted shrink-0">
                <span className="numeric" dir="ltr">
                  ₪{Number(d.price_min ?? 0)}
                </span>{" "}
                {t(`unit.${UNIT_KEYS.has(d.price_unit) ? d.price_unit : "unit"}`)}
              </span>
              <Button type="button" size="sm" variant="text" onClick={() => onDelete(d.id)} disabled={busy}>
                {t("delete_cta")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
