"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Leaf, Question, Stack, X } from "@phosphor-icons/react";

/**
 * MapKey — "מה רואים במפה?" (MEH-2424).
 *
 * The map draws seven kinds of marks (photo pin, glyph pin, verified badge,
 * cluster count, hollow pickup pin, approximate halo, the pickup-layer
 * control) and on a phone explained none of them; the desktop legend lists
 * categories only. Big maps keep marks few and explain them on tap; when a
 * map does carry several encodings it offers one small "what's on the map"
 * panel. This is that panel, reachable on every viewport.
 *
 * Each row's sample is drawn with the SAME tokens the map uses
 * (MapComponent.jsx createCategoryMarker / createSecondaryMarker /
 * iconCreateFunction), so the key cannot teach a mark the map doesn't draw.
 * The pickup-layer row reuses that control's own accessible name: MEH-2046
 * keeps the control icon-only (a label made it read as a filter), and this
 * row is where it gets its words.
 *
 * Positioning belongs to the caller (MapPane renders one per shell, like the
 * layer toggle): `buttonClassName` / `buttonStyle` place the ? control,
 * `panelClassName` places the panel inside the pane.
 */

// Same token set as MapPane's MAP_CONTROL_CLASS + MAP_CONTROL_OFF.
const CONTROL_CLASS =
  "w-11 h-11 rounded-full shadow-md items-center justify-center transition-colors z-[1000] focus-visible:ring-2 focus-visible:ring-primary/40";
const CONTROL_OFF = "bg-surface-floating text-primary border border-border hover:bg-green-50";
const CONTROL_ON = "bg-primary text-white border border-primary";

// 28px stand-ins for the 36px pins — small enough to sit in a text row,
// same border / ring / badge recipe as the real marker.
const PIN = "relative shrink-0 w-7 h-7 rounded-full border-2 border-primary";

function SamplePhoto() {
  return (
    <span className={`${PIN} overflow-hidden bg-gradient-to-br from-[#c9b48a] via-[#8aa37b] to-[#4f7a5f]`} aria-hidden="true" />
  );
}

function SampleVerified() {
  return (
    <span className={`${PIN} bg-gradient-to-br from-[#c9b48a] via-[#8aa37b] to-[#4f7a5f]`} aria-hidden="true">
      {/* rtl-ok: mirrors the marker's physical bottom-right badge */}
      {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: the map badge is physically bottom-right in every locale */}
      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary border border-white flex items-center justify-center">
        <Check size={8} weight="bold" className="text-white" />
      </span>
    </span>
  );
}

function SampleCluster() {
  return (
    <span
      className="shrink-0 w-7 h-7 rounded-full bg-primary text-white border-2 border-white shadow-md flex items-center justify-center text-[11px] font-semibold numeric"
      aria-hidden="true"
    >
      5
    </span>
  );
}

function SamplePickup() {
  return (
    <span className="shrink-0 w-7 h-7 flex items-center justify-center" aria-hidden="true">
      <span className="w-5 h-5 rounded-full bg-white border-2 border-primary flex items-center justify-center">
        <Leaf size={10} className="text-primary" />
      </span>
    </span>
  );
}

function SampleApproximate() {
  return (
    <span
      className={`${PIN} bg-gradient-to-br from-[#c9b48a] via-[#8aa37b] to-[#4f7a5f]`}
      style={{ boxShadow: "0 0 0 5px rgba(46,104,83,0.18)" }}
      aria-hidden="true"
    />
  );
}

function SampleLayer() {
  return (
    <span
      className="shrink-0 w-7 h-7 rounded-full bg-surface-floating border border-border text-primary flex items-center justify-center"
      aria-hidden="true"
    >
      <Stack size={14} />
    </span>
  );
}

export default function MapKey({ buttonClassName = "", buttonStyle, panelClassName = "", testIdSuffix = "" }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const closeRef = useRef(null);
  const panelId = useId();

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const rows = [
    [SamplePhoto, t("map.pane.key.photo")],
    [SampleVerified, t("map.pane.key.verified")],
    [SampleCluster, t("map.pane.key.cluster")],
    [SamplePickup, t("map.pane.key.pickup")],
    [SampleApproximate, t("map.pane.key.approximate")],
    [SampleLayer, t("map.pane.pickup_layer.aria")],
  ];

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("map.pane.key.title")}
        data-testid={`map-key-toggle${testIdSuffix}`}
        style={buttonStyle}
        className={`${buttonClassName} ${CONTROL_CLASS} ${open ? CONTROL_ON : CONTROL_OFF}`}
      >
        <Question size={20} weight={open ? "bold" : "regular"} aria-hidden="true" />
      </button>
      {open && (
        <section
          id={panelId}
          aria-labelledby={`${panelId}-title`}
          data-testid="map-key-panel"
          className={`absolute z-[1000] rounded-lg border border-border bg-surface-floating p-4 shadow-lg ${panelClassName}`}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 id={`${panelId}-title`} className="font-headline-md text-base font-bold text-text">
              {t("map.pane.key.title")}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={t("common.aria.close")}
              className="-m-2 inline-flex w-11 h-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-2.5">
            {rows.map(([Sample, label]) => (
              <li key={label} className="flex items-center gap-3">
                <Sample />
                <span data-testid="map-key-row" className="text-sm text-text leading-snug">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
