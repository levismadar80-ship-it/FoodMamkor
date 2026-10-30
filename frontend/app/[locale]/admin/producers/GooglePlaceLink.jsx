"use client";

/**
 * GooglePlaceLink — MEH-2582
 *
 * Links a pending business to its Google profile from the approval row, so the
 * public Google-rating line (MEH-1490, GoogleRatingLine) can render. Before
 * this, the place_id could be set only in ProducerForm's edit page, and no
 * business was ever mapped.
 *
 * Same search as ProducerForm (MEH-1506): GET
 * /admin/producers/{id}/google-place-candidates, up to 3 candidates, the admin
 * PICKS one — no auto-select. Here the pick saves at once through the one-field
 * PUT /admin/producers/{id}/google-place-id — not the full admin PUT, whose
 * licence gate refuses any edit of a pending business that has no licence
 * number yet (exactly who is in this queue). "Linked"
 * follows the PUT's success, never the click; `onLinked` then updates the
 * table row so a collapse + reopen stays "linked". Only the place_id is stored; the
 * review count is display-only (Google ToS, see routers/google_rating.py).
 *
 * Copy approved by Sapir 29/10/2026; search/result strings match ProducerForm.
 *
 * MEH-2602: after a search that found nothing (or failed) the admin gets one
 * field: the name the business uses on Google (sent as `q`), or a pasted
 * place_id, which is saved directly — the same paste ProducerForm accepts.
 */

import { useState } from "react";
import api from "@/lib/api";

// Mirrors routers/google_rating.py MIN_REVIEWS and ProducerForm.jsx.
const GOOGLE_MIN_REVIEWS = 20;
// A Google place_id: "ChI…" plus base64url characters (normalize_google_place_id
// on the server is the real gate; this only decides search vs. save).
const PLACE_ID_RE = /^ChI[A-Za-z0-9_-]{10,}$/;

export default function GooglePlaceLink({ producerId, placeId, onLinked }) {
  const [linkedId, setLinkedId] = useState(placeId || null);
  const [replacing, setReplacing] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchState, setSearchState] = useState(null); // null | "empty" | "error"
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [manual, setManual] = useState("");

  const search = async (q) => {
    if (searching) return;
    setSearching(true);
    setCandidates(null);
    setSearchState(null);
    setSaveError(false);
    try {
      const url = `/admin/producers/${producerId}/google-place-candidates`;
      const r = q ? await api.get(url, { params: { q } }) : await api.get(url);
      const found = r.data?.candidates;
      if (r.status === 204 || !found?.length) setSearchState("empty");
      else setCandidates(found);
    } catch {
      setSearchState("error");
    } finally {
      setSearching(false);
    }
  };

  const pick = async (id) => {
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await api.put(`/admin/producers/${producerId}/google-place-id`, { google_place_id: id });
      setLinkedId(id);
      onLinked?.(id);
      setReplacing(false);
      setCandidates(null);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const showSearch = !linkedId || replacing;

  const submitManual = (e) => {
    e.preventDefault();
    const value = manual.trim();
    if (!value) return;
    if (PLACE_ID_RE.test(value)) pick(value);
    else search(value);
  };

  return (
    <div className="mt-3 max-w-xl text-xs">
      <p className="font-medium text-text">פרופיל Google</p>

      {linkedId && !replacing && (
        <p className="mt-1 flex items-center gap-2 text-text">
          <span>מקושר ✓</span>
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="text-primary underline"
          >
            החלפה
          </button>
        </p>
      )}

      {!linkedId && (
        <p className="mt-1 text-muted">
          לא מקושר — בלי קישור, הדירוג מגוגל לא יופיע בדף העסק.
        </p>
      )}

      {showSearch && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => search()}
            disabled={searching}
            className="rounded-lg border border-border px-3 py-1.5 text-text hover:bg-background-alt disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {searching ? "מחפשת…" : "חפשי בגוגל"}
          </button>

          {searchState === "empty" && (
            <p className="mt-2 text-muted" role="status">
              לא נמצאו תוצאות בגוגל
            </p>
          )}
          {searchState === "error" && (
            <p className="mt-2 text-error" role="alert">
              החיפוש נכשל, נסי שוב
            </p>
          )}

          {searchState && (
            <form onSubmit={submitManual} className="mt-2 flex gap-2" data-testid="google-place-manual">
              <label className="sr-only" htmlFor={`gpl-manual-${producerId}`}>
                השם בגוגל או place_id
              </label>
              <input
                id={`gpl-manual-${producerId}`}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="השם בגוגל או place_id"
                dir="auto"
                className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button
                type="submit"
                disabled={searching || saving || !manual.trim()}
                className="rounded-lg border border-border px-3 py-1.5 text-text hover:bg-background-alt disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                חיפוש
              </button>
            </form>
          )}

          {candidates?.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {candidates.map((c) => (
                <li key={c.place_id}>
                  <button
                    type="button"
                    onClick={() => pick(c.place_id)}
                    disabled={saving}
                    className="w-full rounded-lg border border-border p-2.5 text-start hover:bg-background-alt disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="block font-medium text-text">{c.display_name}</span>
                    {c.formatted_address && (
                      <span className="block text-muted">{c.formatted_address}</span>
                    )}
                    <span className="block text-muted">{c.user_rating_count} ביקורות</span>
                    {c.user_rating_count < GOOGLE_MIN_REVIEWS && (
                      <span className="mt-0.5 block text-error">
                        פחות מ-20 ביקורות — השורה לא תוצג
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {saving && <p className="mt-2 text-muted">שומרת…</p>}
      {saveError && (
        <p className="mt-2 text-error" role="alert">
          השמירה נכשלה, נסי שוב
        </p>
      )}
    </div>
  );
}
