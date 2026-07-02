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

// Default rows-per-page on the admin producers table (MEH-23 pagination).
const DEFAULT_PER_PAGE = 25;

// Sub-hook 1 — data state, list fetch, filter/page state.
function useProducersData() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";

  const [producers, setProducers] = useState([]);
  const [producerSearch, setProducerSearch] = useState("");
  const [producerStatus, setProducerStatus] = useState(initialStatus);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  // MEH-23 — client-side pagination on the admin producers table.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  // MEH-53: which producer's story-card panel is open.
  const [storyCardOpenId, setStoryCardOpenId] = useState(null);

  const loadAllProducers = (search = producerSearch) => {
    const params = {};
    if (producerStatus && producerStatus !== "all") params.status = producerStatus;
    if (search) params.search = search;
    api.get("/admin/producers", { params }).then((r) => setProducers(r.data)).catch(() => setProducers([]));
  };

  useEffect(() => {
    loadAllProducers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producerStatus]);

  return {
    producers, setProducers,
    producerSearch, setProducerSearch,
    producerStatus, setProducerStatus,
    incompleteOnly, setIncompleteOnly,
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
function useProducerActions(loadAllProducers) {
  const t = useTranslations("admin");
  // MEH-848: errorMessage() copy now lives under the error.* namespace.
  const tError = useTranslations("error");
  const { run, isBusy } = useAdminAction();
  const quickApprove = (id) =>
    run(`approve:${id}`, async () => {
      await api.post(`/admin/producers/${id}/approve`);
      loadAllProducers();
    });
  const toggleStatus = (id) =>
    run(
      `status:${id}`,
      async () => {
        await api.post(`/admin/producers/${id}/toggle-status`);
        loadAllProducers();
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
  const deleteProducer = (id, name) => {
    if (!confirm(t("producers.table.confirm_delete", { name }))) return;
    // MEH-747: surface delete failures — the 500 was previously swallowed
    // silently (no catch), so a failed delete looked like a no-op to the admin.
    return run(
      `delete:${id}`,
      async () => {
        await api.delete(`/admin/producers/${id}`);
        loadAllProducers();
      },
      t("producers.table.delete_error"),
    );
  };
  const toggleAmbassador = (id, current) =>
    run(`ambassador:${id}`, async () => {
      await api.post(`/admin/producers/${id}/set-ambassador`, { ambassador: !current });
      loadAllProducers();
    });
  return { quickApprove, toggleStatus, deleteProducer, toggleAmbassador, isBusy };
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
  const actions = useProducerActions(data.loadAllProducers);
  const importFlow = useImportFlow(data.loadAllProducers);

  const exportExcel = () => exportProducersToCSV(data.producers);

  const handleStoryCardUpload = (id, url) =>
    data.setProducers((prev) => prev.map((p) => (p.id === id ? { ...p, story_card_url: url } : p)));

  const handlePerPageChange = (n) => {
    data.setPerPage(n);
    data.setPage(1);
  };

  // Derived: annotate, filter, paginate.
  const annotated = data.producers.map((p) => ({ ...p, _completeness: producerCompleteness(p) }));
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
    ...data, ...actions, ...importFlow,
    exportExcel, handleStoryCardUpload, handlePerPageChange,
    incompleteCount, visible, pagedVisible, safePage, totalPages,
  };
}
