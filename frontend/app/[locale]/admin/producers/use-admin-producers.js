"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { producerCompleteness } from "@/lib/producer-completeness";
import { clampPage } from "@/lib/pagination";
import { exportProducersToCSV } from "@/lib/admin-producers-export";
import { useAdminAction } from "@/lib/use-admin-action";
import { detailToMessage, errorMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { useDecisionFlow } from "./use-reject-flow";
import { CHANGES, decisionValue } from "./ProducerDecisionModal";

// Default rows-per-page on the admin producers table (MEH-23 pagination).
const DEFAULT_PER_PAGE = 25;

// MEH-1011 Chunk 2: map an approve-422 detail string to the request-changes
// chip key. The license gate detail (MEH-971) contains "רישיון"; the photo
// gate (MEH-799) doesn't — so "רישיון" present → license, else → photo.
// Pure + exported so the mapping is unit-testable without the hook.
export function approveGateReason(detail) {
  return (detail || "").includes("רישיון") ? "license" : "photo";
}

// MEH-2209: the same gate, mapped to the decision modal's completion-group
// preset. The chip TEXT is kept as well (prefilled into the free text) — it is
// more specific than the label on the licence side ("חסר מספר רישיון יצרן" vs
// "מסמכים חסרים / לא קריאים"), so dropping it would make the owner's mail
// vaguer than it is today.
const GATE_PRESET_KEY = { photo: "missing_image", license: "missing_docs" };

// Sub-hook 1 — data state, list fetch, filter/page state.
function useProducersData() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";

  const [producers, setProducers] = useState([]);
  // MEH-2096: THE priority case. Manual approval of every business is a locked
  // product invariant (docs/CONTEXT.md §2), so a catch that emptied the list
  // rendered "no businesses awaiting approval" when the API was down — real
  // businesses waiting, and nobody able to tell.
  const [loadError, setLoadError] = useState(false);
  const [producerSearch, setProducerSearch] = useState("");
  const [producerStatus, setProducerStatus] = useState(initialStatus);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  // MEH-2274 (MEH-1494 chunk B): the annual-review queue. Unlike
  // `incompleteOnly`, which filters the already-fetched list client-side, this
  // one is a SERVER filter — `recommended_at IS NULL OR < now()-12mo` is a
  // clause the client cannot evaluate, because `recommended_at` is not on the
  // public list payload at all (it is admin-only, ProducerAdminOut). So it
  // joins `producerStatus` in the effect dependency list below and re-fetches.
  const [reviewDueOnly, setReviewDueOnly] = useState(false);
  // MEH-23 — client-side pagination on the admin producers table.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  // MEH-53: which producer's story-card panel is open.
  const [storyCardOpenId, setStoryCardOpenId] = useState(null);

  const loadAllProducers = (search = producerSearch) => {
    const params = {};
    if (producerStatus && producerStatus !== "all") params.status = producerStatus;
    if (search) params.search = search;
    // MEH-2274: only sent when ON. Sending `false` would be harmless today
    // (admin.py defaults it to False) but would put a dead parameter on every
    // request, and the backend reads presence-or-absence for the other flags.
    if (reviewDueOnly) params.recommended_review_due = true;
    setLoadError(false);
    api
      .get("/admin/producers", { params })
      .then((r) => { setProducers(r.data); setLoadError(false); })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    loadAllProducers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producerStatus, reviewDueOnly]);

  return {
    producers, setProducers,
    loadError,
    producerSearch, setProducerSearch,
    producerStatus, setProducerStatus,
    incompleteOnly, setIncompleteOnly,
    reviewDueOnly, setReviewDueOnly,
    page, setPage,
    perPage, setPerPage,
    storyCardOpenId, setStoryCardOpenId,
    loadAllProducers,
  };
}

// Sub-hook 2 — admin action handlers (each calls loadAllProducers after).
// UIS Pattern A (MEH-228): every mutating handler routes through
// `useAdminAction.run` so a rapid double-click can't double-fire and a
// failed request surfaces a toast instead of a silent no-op. `isBusy(key)`
// is threaded out to AdminProducersTable to disable the in-flight button.
function useProducerActions(loadAllProducers, deps) {
  const t = useTranslations("admin");
  // MEH-848: errorMessage() copy now lives under the error.* namespace.
  const tError = useTranslations("error");
  // MEH-2209: `run` is created by the orchestrator and shared, so the decision
  // flow can be constructed BEFORE this hook — the approve-422 handler below
  // needs its `openDecision`, and a hook cannot use a value defined after it.
  const { run, openDecision } = deps;

  const quickApprove = (producer) =>
    run(
      `approve:${producer.id}`,
      async () => {
        await api.post(`/admin/producers/${producer.id}/approve`);
        loadAllProducers();
        showToast.success(t("producers.toast_approved")); // MEH-1446
      },
      // MEH-1011 Chunk 2: the MEH-799 (photo) / MEH-971 (license) approve gates
      // return 422. Instead of a dead-end toast, auto-open request-changes with
      // the gate-matched chip prefilled so the admin can send it in one click.
      (err) => {
        if (err?.response?.status === 422) {
          const reason = approveGateReason(err.response.data?.detail);
          openDecision(producer, {
            preselect: decisionValue(CHANGES, GATE_PRESET_KEY[reason]),
            text: t(`producers.request_changes.chips.${reason}`),
          });
          showToast.info(t("producers.request_changes.approve_blocked_info"));
        } else {
          showToast.error(errorMessage(err, tError));
        }
      },
    );
  const toggleStatus = (id) =>
    run(
      `status:${id}`,
      async () => {
        await api.post(`/admin/producers/${id}/toggle-status`);
        loadAllProducers();
        showToast.success(t("producers.toast_status_updated")); // MEH-1446
      },
      // MEH-769: a 409 means the producer isn't in a toggleable state
      // (pending / rejected) — surface the message-key copy that steers the
      // admin to the approve/reject flow. Any other error falls back to the
      // central errorMessage toast (MEH-251).
      (err) =>
        showToast.error(
          err?.response?.status === 409
            ? t("producers.toggle.invalid_transition")
            : errorMessage(err, tError),
        ),
    );
  // MEH-1027 Chunk B: the native browser confirm was replaced by a modal dialog
  // (page.js renders it — mirrors the content/page.js category-delete dialog,
  // MEH-1023 Ch.B pattern). Signature unchanged so AdminProducersTable's
  // kebab wiring (Chunk A) is untouched; this now only OPENS the dialog.
  const [confirmDelete, setConfirmDelete] = useState(null); // {id, name} | null
  const deleteProducer = (id, name) => setConfirmDelete({ id, name });
  const closeDeleteConfirm = () => setConfirmDelete(null);
  const confirmDeleteProducer = () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    // MEH-747: surface delete failures — the 500 was previously swallowed
    // silently (no catch), so a failed delete looked like a no-op to the admin.
    // Dialog closes only on success; on failure the delete_error toast fires
    // (run's onError) and the dialog stays open for retry/cancel.
    return run(
      `delete:${id}`,
      async () => {
        await api.delete(`/admin/producers/${id}`);
        loadAllProducers();
        setConfirmDelete(null);
      },
      t("producers.table.delete_error"),
    );
  };
  const toggleAmbassador = (id, current) =>
    run(`ambassador:${id}`, async () => {
      await api.post(`/admin/producers/${id}/set-ambassador`, { ambassador: !current });
      loadAllProducers();
    });
  return {
    quickApprove, toggleStatus, deleteProducer, toggleAmbassador,
    // MEH-1027 Chunk B: delete confirm dialog controller.
    confirmDelete, closeDeleteConfirm, confirmDeleteProducer,
  };
}

// Sub-hook 3 — Excel import flow (dry-run preview, then confirm).
function useImportFlow(loadAllProducers) {
  const t = useTranslations("admin");
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const handleImportFile = async (file) => {
    if (!file) return;
    setImportError("");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/admin/producers/import?dry_run=true", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview({ ...r.data, _file: file });
    } catch (err) {
      setImportError(detailToMessage(err.response?.data?.detail) || t("producers.import.errors_loading"));
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview?._file) return;
    setImporting(true);
    setImportError("");
    try {
      const fd = new FormData();
      fd.append("file", importPreview._file);
      await api.post("/admin/producers/import?dry_run=false", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview(null);
      loadAllProducers();
    } catch (err) {
      setImportError(detailToMessage(err.response?.data?.detail) || t("producers.import.errors_importing"));
    } finally {
      setImporting(false);
    }
  };

  return { importPreview, setImportPreview, importing, importError, handleImportFile, confirmImport };
}

// Outer orchestrator — composes the three sub-hooks and computes
// completeness / pagination derivatives. The return object is the
// only surface page.js consumes.
export function useAdminProducers() {
  const data = useProducersData();
  // MEH-226/MEH-2209: ONE busy registry for every admin action on a row — a
  // second useAdminAction instance would let a decision fire while another
  // action on the same row is still in flight. Hoisted here (was inside
  // useProducerActions) so both hooks below share it and the decision flow can
  // be built first; the approve-422 handler needs its opener.
  const { run, isBusy } = useAdminAction();
  const decision = useDecisionFlow(data.loadAllProducers, run);
  const actions = useProducerActions(data.loadAllProducers, {
    run, openDecision: decision.openDecision,
  });
  const importFlow = useImportFlow(data.loadAllProducers);

  const exportExcel = () => exportProducersToCSV(data.producers);

  const handleStoryCardUpload = (id, url) =>
    data.setProducers((prev) => prev.map((p) => (p.id === id ? { ...p, story_card_url: url } : p)));

  const handlePerPageChange = (n) => {
    data.setPerPage(n);
    data.setPage(1);
  };

  // MEH-1421 (MEH-1388 chunk 4a): read-only dedup signal. Flag a producer that
  // shares a (normalized) name OR city with ANOTHER producer so the admin can
  // eyeball likely-duplicate registrations at approval time (epic "עסק קיים
  // באותו שם/עיר"; MEH-409 dedup). Signal only — no mutation, no auto-block. The
  // badge's title states which axis collided so a shared-city match (weaker than
  // a shared-name match on a growing dataset) reads as context, not a verdict.
  const _norm = (s) => (s || "").trim().toLowerCase();
  const nameCounts = {};
  const cityCounts = {};
  for (const p of data.producers) {
    const n = _norm(p.name);
    const c = _norm(p.city);
    if (n) nameCounts[n] = (nameCounts[n] || 0) + 1;
    if (c) cityCounts[c] = (cityCounts[c] || 0) + 1;
  }

  // Derived: annotate, filter, paginate.
  const annotated = data.producers.map((p) => ({
    ...p,
    _completeness: producerCompleteness(p),
    _dup: {
      name: nameCounts[_norm(p.name)] > 1,
      city: cityCounts[_norm(p.city)] > 1,
    },
  }));
  const incompleteCount = annotated.filter((p) => p._completeness.priority !== "green").length;
  const visible = data.incompleteOnly
    ? annotated.filter((p) => p._completeness.priority !== "green")
    : annotated;
  // MEH-23 — paginate the filtered list. Re-clamp whenever visible or
  // perPage changes so a filter reducing the list doesn't leave the
  // user stranded on an out-of-range page.
  const totalPages = Math.max(1, Math.ceil(visible.length / data.perPage));
  const safePage = clampPage(data.page, totalPages);
  const pagedVisible = visible.slice((safePage - 1) * data.perPage, safePage * data.perPage);

  return {
    ...data, ...actions, ...decision, ...importFlow, isBusy,
    // MEH-2209: the two row entry points keep their names and signatures, so
    // AdminProducersTable's wiring is untouched — only where they land moved.
    // The kebab's "דחייה" opens with nothing chosen; the row's "בקשת השלמה"
    // lands on the completion group without choosing for the admin.
    openReject: decision.openDecision,
    openRequestChanges: (producer) => decision.openDecision(producer, { focus: CHANGES }),
    exportExcel, handleStoryCardUpload, handlePerPageChange,
    incompleteCount, visible, pagedVisible, safePage, totalPages,
  };
}
