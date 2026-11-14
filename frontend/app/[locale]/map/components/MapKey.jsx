"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Question, X } from "@phosphor-icons/react";

import { styleForProducer } from "@/lib/category-registry";

/**
 * MapKey — "מה רואים במפה?" (MEH-2424).
 *
 * The map draws these marks (photo pin, glyph pin, verified badge,
 * cluster count, same-business cluster, pickup pin, approximate halo/dashed
 * ring, faded pins while one business is selected, the "you are here" dot —
 * the last three added in MEH-3119; a further row, the
 * pickup-layer control, left with that control on 13/11) and on a phone
 * explained none of them; the desktop legend lists
 * categories only. Big maps keep marks few and explain them on tap; when a
 * map does carry several encodings it offers one small "what's on the map"
 * panel. This is that panel, reachable on every viewport.
 *
 * Each row's sample is drawn with the SAME tokens the map uses
 * (MapComponent.jsx createCategoryMarker / createSecondaryMarker /
 * iconCreateFunction), so the key cannot teach a mark the map doesn't draw.
 *
 * Positioning belongs to the caller (MapPane renders one per shell): `buttonClassName` / `buttonStyle` place the ? control,
 * `panelClassName` places the panel inside the pane.
 */

// Same token set as NearMePill.jsx (MapPane's shared constant left with the
// pickup-layer toggle, 13/11).
const CONTROL_CLASS =
  "w-11 h-11 rounded-full shadow-lg items-center justify-center transition-colors z-[1000] focus-visible:ring-2 focus-visible:ring-primary";
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
        {/* icon-ok: an 8px tick inside the 14px legend copy of the marker's verified badge — a scale step would fill it */}
        <Check size={8} weight="bold" className="text-white" />
      </span>
    </span>
  );
}

function SampleCluster() {
  return (
    <span
      className="shrink-0 w-7 h-7 rounded-full bg-primary text-white border-2 border-white shadow-lg flex items-center justify-center text-2xs font-semibold numeric"
      aria-hidden="true"
    >
      5
    </span>
  );
}

// MEH-3119: the map draws a pickup point in its BUSINESS'S category colour and
// glyph (MapComponent.jsx createSecondaryMarker → styleForProducer), so the
// sample does too, from the same registry call, instead of the green leaf it
// used to show (a leaf pickup pin appears only for an uncategorised business).
// Bakery is the example because it is the commonest pickup case.
const PICKUP_SAMPLE = styleForProducer({ categories: [{ name: "לחמים ואפייה" }] });

function SamplePickup() {
  const { color, icon: Glyph } = PICKUP_SAMPLE;
  return (
    <span className="shrink-0 w-7 h-7 flex items-center justify-center" aria-hidden="true">
      <span className="w-5 h-5 rounded-full bg-surface border-2 flex items-center justify-center" style={{ borderColor: color }}>
        <Glyph size={12} color={color} />
      </span>
    </span>
  );
}

// MEH-3119: an approximate point shows two ways on the map — a halo around a
// business pin, a dashed ring on a pickup pin (createSecondaryMarker
// borderStyle) — so the sample shows both side by side.
const APPROX_HALO = { boxShadow: "0 0 0 4px rgba(46,104,83,0.14)" };

function SampleApproximate() {
  const { color, icon: Glyph } = PICKUP_SAMPLE;
  return (
    <span className="flex items-center gap-3" aria-hidden="true">
      <span
        className="relative shrink-0 w-5 h-5 rounded-full border-2 border-primary bg-gradient-to-br from-[#c9b48a] via-[#8aa37b] to-[#4f7a5f]"
        style={APPROX_HALO}
      />
      <span
        className="w-5 h-5 rounded-full bg-surface border-2 border-dashed flex items-center justify-center"
        style={{ ...APPROX_HALO, borderColor: color }}
      >
        <Glyph size={12} color={color} />
      </span>
    </span>
  );
}

// MEH-3119: several points of ONE business that sit together cluster into its
// category glyph with a count badge (MapComponent.jsx createSingleBusinessClusterIcon).
// Scaled like every sample here: the map's 36px pin / 18px badge at 28px / 16px.
function SampleSameBusiness() {
  const { color, icon: Glyph } = PICKUP_SAMPLE;
  return (
    <span className={`${PIN} flex items-center justify-center text-surface`} style={{ background: color }} aria-hidden="true">
      <Glyph size={14} weight="fill" />
      {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: mirrors the cluster's physical top-right badge */}
      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-primary border border-surface text-surface text-2xs leading-none font-semibold numeric flex items-center justify-center">
        3
      </span>
    </span>
  );
}

// MEH-3119: while a business is selected every other pin fades — the same
// filter globals.css puts on `.mehamakor-map-focused` markers.
function SampleDimmed() {
  return (
    <span className="flex" style={{ filter: "grayscale(1) opacity(0.35)" }}>
      <SamplePhoto />
    </span>
  );
}

// MEH-3119: the "you are here" dot — MapComponent.jsx L.circleMarker
// (radius 8, primary stroke 2, primary fill at 0.85).
function SampleMyLocation() {
  return <span className="w-4 h-4 rounded-full border-2 border-primary bg-primary/85" aria-hidden="true" />;
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
    [SampleSameBusiness, t("map.pane.key.same_business")],
    [SamplePickup, t("map.pane.key.pickup")],
    [SampleApproximate, t("map.pane.key.approximate")],
    [SampleDimmed, t("map.pane.key.dimmed")],
    [SampleMyLocation, t("map.pane.key.my_location")],
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
              className="-m-2 inline-flex w-11 h-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-2.5">
            {rows.map(([Sample, label]) => (
              <li key={label} className="flex items-center gap-3">
                {/* MEH-3119: a fixed-width slot so a two-mark sample keeps every label aligned */}
                <span className="shrink-0 w-14 flex items-center justify-center">
                  <Sample />
                </span>
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
