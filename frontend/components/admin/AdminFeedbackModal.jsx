// @ts-check
"use client";
/**
 * Module:   AdminFeedbackModal
 * Purpose:  The «request changes» / «reject» dialog of the admin review
 *           queues: a title, the item line, a feedback textarea, cancel and
 *           send. The copy comes from the queue's own namespace
 *           (`<ns>.modal.*`), so each queue keeps its words.
 * Does NOT: send anything (the page's onSubmit does) or decide which action
 *           is open (the page's state).
 * Related:  app/[locale]/admin/experiences/page.js,
 *           app/[locale]/admin/recipes/page.js (callers).
 * History:  MEH-3623 (creation: the two queues carried the same 50-line
 *           dialog; clone-baseline listed the pair at 14 windows).
 */
import Dialog from "@/components/ui/Dialog";

/**
 * @param {{
 *   ns: "experiences" | "recipes",
 *   t: (key: string) => string,
 *   action: "changes" | "reject",
 *   itemLine: string,
 *   feedback: string,
 *   onFeedback: (value: string) => void,
 *   busy: boolean,
 *   onClose: () => void,
 *   onSubmit: () => void,
 *   testId?: string,
 * }} props
 */
export default function AdminFeedbackModal({
  ns, t, action, itemLine, feedback, onFeedback, busy, onClose, onSubmit, testId,
}) {
  const titleId = `${ns === "recipes" ? "recipe" : "experience"}-feedback-title`;
  const changes = action === "changes";
  return (
    <Dialog closeOnBackdrop={false}
      labelledBy={titleId}
      size="lg"
      dismissible={!busy}
      onClose={onClose}
      testId={testId}
    >
        <h2 id={titleId} className="font-headline-md text-xl font-bold text-text mb-2">
          {changes ? t(`${ns}.modal.changes_title`) : t(`${ns}.modal.reject_title`)}
        </h2>
        <p className="text-fg-muted text-sm mb-4">{itemLine}</p>
        <label className="block text-sm font-medium text-text mb-1">
          {changes ? t(`${ns}.modal.changes_label`) : t(`${ns}.modal.reject_label`)}
        </label>
        <textarea
          value={feedback}
          onChange={(e) => onFeedback(e.target.value)}
          rows={5}
          className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-surface focus-ring"
          placeholder={
            changes ? t(`${ns}.modal.changes_placeholder`) : t(`${ns}.modal.reject_placeholder`)
          }
        />
        <div className="flex gap-2 justify-end mt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-sm border border-border text-text hover:bg-green-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onSubmit}
            disabled={busy}
            className={`px-4 py-2 rounded-sm text-white ${
              changes ? "bg-accent hover:opacity-90" : "bg-danger-600 hover:bg-danger-700"
            } disabled:opacity-50`}
          >
            {busy ? t("common.sending") : t(`${ns}.modal.submit`)}
          </button>
        </div>
    </Dialog>
  );
}
