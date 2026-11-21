// @ts-check
"use client";
/**
 * Module:   OrderSheetChoices
 * Purpose:  The tap-to-pick parts of the order sheet: pickup or delivery as
 *           two buttons, the time slots as buttons (four shown, «מועדים
 *           נוספים» for the rest), and the note behind «+ הוספת הערה».
 *           Wolt shows delivery/pickup as a switch and times as a list, not a
 *           dropdown (MEH-3658 research).
 * Does NOT: decide which ways or slots exist (lib/order-sheet.js) or hold the
 *           form (OrderSheet.jsx owns it and passes values down).
 * Related:  components/public/OrderSheet.jsx, components/public/ProductGroupChips.jsx
 *           (the same pill look)
 * History:  MEH-3658 (creation; replaced two Selects and an always-open note)
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Textarea from "@/components/ui/Textarea";
import { dayLabel, rangeEnds } from "@/lib/product-orders";

// REUSES: components/public/ProductGroupChips.jsx:18 — the pill look.
const PILL =
  "inline-flex items-center justify-center min-h-touch px-3.5 rounded-full border text-sm transition focus-visible:ring-2 focus-visible:ring-primary";
const ON = "bg-primary text-white border-primary";
const OFF = "bg-surface-card text-text border-border hover:border-primary/40";
export const SLOTS_SHOWN = 4;

/**
 * One choice among a few, as buttons. Arrow keys are not wired: each option
 * is its own tab stop, which is enough for two to six options.
 * @param {{ label: string, value: string, options: { value: string, label: string }[], onChange: (v: string) => void, testId: string, hideLabel?: boolean }} props
 */
function PillChoice({ label, value, options, onChange, testId, hideLabel = false }) {
  return (
    <div>
      {!hideLabel && <p className="text-sm font-medium text-text mb-2" aria-hidden="true">{label}</p>}
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2" data-testid={testId}>
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              data-value={option.value}
              onClick={() => onChange(option.value)}
              className={`${PILL} ${on ? ON : OFF}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** @param {{ ways: string[], value: string, onChange: (v: string) => void }} props */
export function WayChoice({ ways, value, onChange }) {
  const t = useTranslations("producer.detail.order_sheet");
  if (ways.length < 2) return null;
  return (
    <PillChoice
      label={t("how")}
      hideLabel
      value={value}
      options={ways.map((way) => ({ value: way, label: t(way) }))}
      onChange={onChange}
      testId="order-sheet-fulfilment"
    />
  );
}

/** @param {{ slots: { start: string, end: string }[], value: string, onChange: (v: string) => void }} props */
export function SlotChoice({ slots, value, onChange }) {
  const t = useTranslations("producer.detail.order_sheet");
  const locale = useLocale();
  const [all, setAll] = useState(false);
  // The picked slot stays visible even when it sits past the first four.
  const pickedAt = slots.findIndex((slot) => slot.start === value);
  const shown = all || slots.length <= SLOTS_SHOWN || pickedAt >= SLOTS_SHOWN ? slots : slots.slice(0, SLOTS_SHOWN);
  return (
    <div>
      <PillChoice
        label={t("when")}
        value={value}
        options={shown.map((slot) => ({ value: slot.start, label: t("slot", { day: dayLabel(slot.start, locale), ...rangeEnds(slot.start, slot.end) }) }))}
        onChange={onChange}
        testId="order-sheet-slot"
      />
      {shown.length < slots.length && (
        <button type="button" onClick={() => setAll(true)} className="mt-2 text-sm text-primary underline focus-ring" data-testid="order-sheet-more-slots">
          {t("more_slots")}
        </button>
      )}
    </div>
  );
}

/** @param {{ value: string, onChange: (v: string) => void }} props */
export function NoteField({ value, onChange }) {
  const t = useTranslations("producer.detail.order_sheet");
  const [open, setOpen] = useState(Boolean(value));
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-primary underline focus-ring" data-testid="order-sheet-add-note">
        {t("add_note")}
      </button>
    );
  }
  return (
    <Textarea label={t("note")} value={value} onChange={(event) => onChange(event.target.value)} maxLength={500} rows={2} data-testid="order-sheet-note" />
  );
}
