"use client";

/**
 * ChecklistSettings — MEH-1399 chunk 2. Edit the pre-approval review checklist
 * without a deploy: reword an item, change its hint, reorder, retire, add.
 *
 * Lives in its own file rather than inside settings/page.js because that file
 * is already 356 lines with a blanket `max-lines-per-function` disable; adding
 * a fifth stateful section to it would make the disable load-bearing rather
 * than historical. The page takes a two-line touch.
 *
 * Does NOT delete. Retirement is `active: false`, and the constraint is below
 * this component: `producer_review_checks.item_id` is ON DELETE RESTRICT, so a
 * delete button could only ever produce a 500 on the items that have history.
 * The UI says «הפסקת שימוש» rather than offering a bin, so the affordance
 * matches what the database will actually allow.
 *
 * Saves the WHOLE list in one PUT — order in the array is the order on screen,
 * and the server assigns `position` from the index. That is why reordering here
 * is local state plus one save, not a per-row API call.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "@phosphor-icons/react";
import api from "@/lib/api";
import Input from "@/components/ui/Input";

const ICON = 16;

// A row the admin has added but not yet saved has no server id. `null` is the
// signal the API uses to mean "create this one", so the client never invents a
// temporary id that could collide with a real one.
const blankItem = () => ({ id: null, label: "", hint: "", active: true });

export default function ChecklistSettings() {
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(() => {
    setLoadError(false);
    api
      // include_inactive: editing a list you cannot fully see is not editing —
      // a retired item has to stay reachable to be brought back.
      .get("/admin/checklist-items?include_inactive=true")
      .then((res) =>
        setItems(
          res.data.map((item) => ({
            id: item.id,
            label: item.label,
            hint: item.hint ?? "",
            active: item.active,
          })),
        ),
      )
      .catch(() => setLoadError(true));
  }, []);

  useEffect(load, [load]);

  // Every mutation clears the confirmation. "נשמר" is a claim about the list
  // on screen, not about a save that happened at some point in the past — so
  // the first keystroke after a save has to withdraw it, or the admin reads a
  // tick next to unsaved work. Same defect class as a checked DoD box: an
  // artifact asserting a state it is no longer describing.
  const dirty = () => setSaved(false);

  const update = (index, patch) => {
    dirty();
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const move = (index, delta) => {
    dirty();
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addItem = () => {
    dirty();
    setItems((prev) => [...prev, blankItem()]);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const { data } = await api.put("/admin/checklist-items", {
        items: items.map((item) => ({
          id: item.id,
          label: item.label,
          // "" is how an empty input reads; the API normalises it to NULL.
          hint: item.hint || null,
          active: item.active,
        })),
      });
      setItems(
        data.map((item) => ({
          id: item.id,
          label: item.label,
          hint: item.hint ?? "",
          active: item.active,
        })),
      );
      setSaved(true);
    } catch (err) {
      // Surfaced rather than swallowed: a 404 here means another admin retired
      // an item this tab still had open, and silently reloading would discard
      // whatever the admin just typed.
      setSaveError(
        err?.response?.status === 404
          ? "אחד הסעיפים כבר לא קיים — רענני את העמוד"
          : "השמירה נכשלה",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <h2 className="font-semibold mb-2">רשימת בדיקה לפני אישור</h2>
        <p className="text-sm text-muted mb-3">טעינת הרשימה נכשלה.</p>
        <button
          type="button"
          onClick={load}
          className="text-sm text-primary underline"
        >
          נסי שוב
        </button>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 text-sm text-muted">
        טוענת…
      </div>
    );
  }

  const canSave = items.every((item) => item.label.trim().length > 0);

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h2 className="font-semibold">רשימת בדיקה לפני אישור</h2>
      <p className="text-xs text-muted mt-1 mb-4">
        הסעיפים שמופיעים לפנייך כשאת בודקת בית עסק. שינוי כאן משתקף מיד, בלי
        deploy. סעיף שאינו רלוונטי עוד — הפסיקי את השימוש בו; אי אפשר למחוק
        סעיף שכבר סומן לעסק כלשהו, כדי שתיעוד הבדיקות לא יאבד את הנושא שלו.
      </p>

      <ul className="space-y-3">
        {items.map((item, index) => (
          <li
            key={item.id ?? `new-${index}`}
            className={`border border-border rounded-lg p-3 ${
              item.active ? "" : "opacity-60"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`העלי את «${item.label || "סעיף חדש"}»`}
                  className="text-muted hover:text-primary disabled:opacity-30"
                >
                  <ArrowUp size={ICON} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`הורידי את «${item.label || "סעיף חדש"}»`}
                  className="text-muted hover:text-primary disabled:opacity-30"
                >
                  <ArrowDown size={ICON} weight="bold" aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 space-y-2">
                <Input
                  label="סעיף"
                  value={item.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                  maxLength={300}
                />
                <Input
                  label="הסבר (אופציונלי)"
                  value={item.hint}
                  onChange={(e) => update(index, { hint: e.target.value })}
                  maxLength={300}
                />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.active}
                    onChange={(e) => update(index, { active: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <span>{item.active ? "בשימוש" : "הופסק השימוש"}</span>
                </label>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus size={ICON} weight="bold" aria-hidden="true" />
          הוספת סעיף
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving || !canSave}
          className="ms-auto bg-primary text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? "שומרת…" : "שמירת הרשימה"}
        </button>
      </div>

      {!canSave && (
        <p className="text-xs text-error mt-2">
          לכל סעיף חייב להיות טקסט.
        </p>
      )}
      {saveError && <p className="text-xs text-error mt-2">{saveError}</p>}
      {saved && !saveError && (
        <p className="text-xs text-primary mt-2">נשמר ✓</p>
      )}
    </div>
  );
}
