// @ts-check
"use client";

/**
 * Module:   MenuImport
 * Purpose:  «העלו תפריט» on the products card (MEH-3430). The owner picks
 *           photos or a PDF of her menu, the server reads it with Claude and
 *           returns rows, she checks and edits them here, and publishes.
 *           Placement (rule 37, decided 18/11): 0–2 products → a strip with a
 *           title and an explanation; 3+ → one secondary button.
 * Touches:  POST /producers/me/menu-import/read (multipart, nothing saved) ·
 *           POST /producers/me/menu-import/publish (creates the products).
 * Does NOT: keep the files (the read is stateless), save drafts (closing the
 *           review drops the rows), or fetch the product list — the parent
 *           reloads it through `onPublished` (ProductsSection's reloadKey).
 * Related:  backend/app/routers/menu_import.py · components/MenuReviewRow.jsx ·
 *           lib/menu-image.js.
 * History:  MEH-3430 (creation).
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileArrowUp } from "@phosphor-icons/react";
import api from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { detailToMessage } from "@/lib/errors";
import { shrinkMenuImage } from "@/lib/menu-image";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import MenuReviewRow, { rowProblem } from "@/components/MenuReviewRow";
import {
  ReadMyMenuProducersMeMenuImportReadPostResponse as MenuReadOut,
  PublishMyMenuProducersMeMenuImportPublishPostResponse as MenuPublishOut,
  readMyMenuProducersMeMenuImportReadPostResponseRowsItemPriceUnitDefault as DEFAULT_UNIT,
} from "@/lib/generated/api.zod";

const MAX_MENU_FILES = 5;
const MAX_PRODUCTS = 100; // backend/app/limits.py MAX_PRODUCTS
const STRIP_UNTIL = 2; // 0–2 products → the strip; 3+ → the button
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

/** @param {any} r @param {number} i @returns {import("./MenuReviewRow").MenuDraftRow} */
function toDraft(r, i) {
  const num = (/** @type {any} */ v) => (v === null || v === undefined ? "" : String(Number(v)));
  return {
    key: `m${i}`,
    name: r.name ?? "",
    description: r.description ?? "",
    price_min: num(r.price_min),
    price_max: num(r.price_max),
    price_unit: r.price_unit ?? DEFAULT_UNIT,
    uncertain: Array.isArray(r.uncertain) ? r.uncertain : [],
  };
}

/** @param {import("./MenuReviewRow").MenuDraftRow} r */
function toPayload(r) {
  return {
    name: r.name.trim(),
    description: r.description.trim() || null,
    price_min: Number(r.price_min),
    price_max: r.price_max.trim() ? Number(r.price_max) : null,
    price_unit: r.price_unit,
  };
}

/** @param {any} err @param {string} fallback */
function errorText(err, fallback) {
  const status = err?.response?.status;
  // 409 / 413 / 415 / 422 / 429 carry a specific Hebrew line (a pydantic 422
  // list does not, and falls through); anything else (503, network, a model
  // that read nothing) is the caller's fallback.
  if ([409, 413, 415, 422, 429].includes(status)) {
    return detailToMessage(err.response.data?.detail) || fallback;
  }
  return fallback;
}

/** @param {File[]} files */
async function buildForm(files) {
  const fd = new FormData();
  let total = 0;
  for (const f of files.slice(0, MAX_MENU_FILES)) {
    const blob = await shrinkMenuImage(f);
    total += blob.size;
    fd.append("files", blob, f.name);
  }
  // Vercel refuses the whole body above ~4.5 MB (MEH-3399), not per file.
  return total > MAX_UPLOAD_BYTES ? null : fd;
}

/**
 * `hidden`: a product form is open. The entry point steps aside, but a read or
 * review in progress stays — closing it would drop rows the owner paid a read
 * for (review 18/11).
 * @param {{ productCount: number, onPublished: () => void, hidden?: boolean }} props
 */
export default function MenuImport({ productCount, onPublished, hidden = false }) {
  const t = useTranslations("settings.products.menu_import");
  const tp = useTranslations("settings.products");
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [phase, setPhase] = useState(/** @type {"idle"|"reading"|"review"|"publishing"} */ ("idle"));
  const [rows, setRows] = useState(/** @type {import("./MenuReviewRow").MenuDraftRow[]} */ ([]));
  const [error, setError] = useState("");

  const onFiles = async (/** @type {FileList | null} */ list) => {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setError("");
    setPhase("reading");
    try {
      const fd = await buildForm(files);
      if (!fd) throw { response: { status: 413, data: { detail: tp("errors.upload_size") } } };
      const res = await api.post("/producers/me/menu-import/read", fd);
      // Rule 19: parse before use; a shape we don't know is a failed read.
      const parsed = MenuReadOut.safeParse(res.data);
      const found = parsed.success ? parsed.data.rows.map(toDraft) : [];
      if (found.length === 0) throw new Error("empty");
      setRows(found);
      setPhase("review");
    } catch (err) {
      setError(errorText(err, t("failed")));
      setPhase("idle");
    }
  };

  const publish = async () => {
    setError("");
    setPhase("publishing");
    try {
      const res = await api.post("/producers/me/menu-import/publish", { products: rows.map(toPayload) });
      // The products exist once the server said 201; a body we can't parse
      // still reloads the list, which is the source of truth.
      MenuPublishOut.safeParse(res.data);
      setRows([]);
      setPhase("idle");
      onPublished();
    } catch (err) {
      // Not the read line: the rows are still here, the save is what failed.
      setError(errorText(err, tp("errors.save_failed")));
      setPhase("review");
    }
  };

  const picker = (
    <input ref={inputRef} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1}
      aria-hidden="true" data-testid="menu-file-input" onChange={(e) => onFiles(e.target.files)} />
  );
  const pickButton = (/** @type {string} */ variant) => (
    <Button type="button" variant={variant} size="sm" loading={phase === "reading"}
      leadingIcon={<FileArrowUp size={16} aria-hidden="true" />}
      onClick={() => inputRef.current?.click()} disabled={phase === "reading"}
      // the shared loading label is generic; this one says what is happening
      aria-label={phase === "reading" ? t("reading") : undefined}>
      {phase === "reading" ? t("reading") : t("button")}
    </Button>
  );

  if (phase === "review" || phase === "publishing") {
    const overCap = productCount + rows.length > MAX_PRODUCTS;
    const missingPrice = rows.some((r) => rowProblem(r) !== null);
    return (
      <section data-testid="menu-review" className="border border-primary/30 rounded-lg p-4 mb-4 space-y-3">
        <p className="text-sm font-semibold text-text" role="status">{t("found", { count: rows.length })}</p>
        {overCap && <InlineMessage tone="info" size="xs" data-testid="menu-cap">{t("cap")}</InlineMessage>}
        <ul className="space-y-3">
          {rows.map((r) => (
            <MenuReviewRow key={r.key} row={r}
              onChange={(key, patch) => setRows((rs) => rs.map((x) => (x.key === key ? { ...x, ...patch } : x)))}
              onRemove={(key) => setRows((rs) => rs.filter((x) => x.key !== key))} />
          ))}
        </ul>
        {error && <InlineMessage size="sm">{error}</InlineMessage>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={publish} loading={phase === "publishing"}
            disabled={rows.length === 0 || overCap || missingPrice || phase === "publishing"}>
            {t("publish", { count: rows.length })}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setRows([]); setError(""); setPhase("idle"); }}>
            {tp("cancel_edit_cta")}
          </Button>
        </div>
      </section>
    );
  }

  if (hidden && phase === "idle") return null;
  if (productCount <= STRIP_UNTIL) {
    return (
      <section data-testid="menu-strip" className="border border-primary/30 bg-primary/5 rounded-lg p-4 mb-4">
        <p className="text-sm font-semibold text-text">{t("strip_title")}</p>
        <p className="text-sm text-fg-muted mt-1 mb-3">{t("strip_body")}</p>
        {pickButton("outlined")}
        {picker}
        {error && <InlineMessage size="sm" className="mt-2">{error}</InlineMessage>}
      </section>
    );
  }
  return (
    <div data-testid="menu-button" className="mb-4">
      {pickButton("outlined")}
      {picker}
      {error && <InlineMessage size="sm" className="mt-2">{error}</InlineMessage>}
    </div>
  );
}
