"use client";

/**
 * MEH-54: Alert preference panel shown after a producer is favorited.
 * Allows users to choose which notifications to receive and opt in to push.
 */

import { useEffect, useState, useCallback } from "react";
import { Bell, BellSlash } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

const DEFAULT_PREFS = {
  notify_new_event: true,
  notify_new_product: true,
  notify_delivery_area: true,
  whatsapp_opt_in: false,
};

export default function AlertPrefsPanel({ producerId, producerName, onClose }) {
  const t = useTranslations("sweep_tail.alert_prefs");
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushStatus, setPushStatus] = useState("unknown"); // unknown | granted | denied | unsupported

  useEffect(() => {
    if (!producerId) return;
    api
      .get(`/users/me/favorites/${producerId}/alerts`)
      .then((r) => {
        if (r.data.enabled) {
          setPrefs({
            notify_new_event: r.data.notify_new_event,
            notify_new_product: r.data.notify_new_product,
            notify_delivery_area: r.data.notify_delivery_area,
            whatsapp_opt_in: r.data.whatsapp_opt_in,
          });
        } else {
          setPrefs({ ...DEFAULT_PREFS });
        }
      })
      .catch(() => setPrefs({ ...DEFAULT_PREFS }))
      .finally(() => setLoading(false));

    if ("Notification" in window) {
      setPushStatus(Notification.permission === "granted" ? "granted" : "prompt");
    } else {
      setPushStatus("unsupported");
    }
  }, [producerId]);

  const toggle = useCallback((key) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const enablePush = async () => {
    const { requestPushPermission, subscribeToPush } = await import("@/lib/push");
    const granted = await requestPushPermission();
    if (!granted) {
      setPushStatus("denied");
      showToast(t("push_denied_toast"), "error");
      return;
    }
    setPushStatus("granted");
    const sub = await subscribeToPush();
    if (sub) {
      // Save subscription immediately so it persists on next save
      setPrefs((p) => ({ ...p, _push_subscription: sub }));
    }
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      let push_subscription = prefs._push_subscription || null;
      if (!push_subscription && pushStatus === "granted") {
        const { subscribeToPush } = await import("@/lib/push");
        push_subscription = await subscribeToPush();
      }
      await api.put(`/users/me/favorites/${producerId}/alerts`, {
        notify_new_event: prefs.notify_new_event,
        notify_new_product: prefs.notify_new_product,
        notify_delivery_area: prefs.notify_delivery_area,
        whatsapp_opt_in: prefs.whatsapp_opt_in,
        push_subscription,
      });
      showToast(t("save_success_toast"), "success");
      onClose?.();
    } catch {
      showToast(t("save_error_toast"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-sm text-fg-muted text-center animate-pulse">{t("loading")}</div>
    );
  }

  const toggleRow = (key, label, emoji) => (
    <label key={key} className="flex items-center justify-between gap-3 py-2 cursor-pointer select-none">
      <span className="flex items-center gap-2 text-sm text-text">
        <span aria-hidden="true">{emoji}</span>
        {label}
      </span>
      <button
        role="switch"
        aria-checked={prefs[key]}
        onClick={() => toggle(key)}
        className={`relative w-10 h-6 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
          prefs[key] ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
            prefs[key] ? "end-1" : "start-1"
          }`}
        />
      </button>
    </label>
  );

  return (
    <div className="rounded-[12px] border border-border bg-white p-4 space-y-3 shadow-sm" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text text-sm flex items-center gap-1.5">
          <Bell size={16} weight="fill" className="text-primary" aria-hidden="true" />
          {t("heading")}
          <span className="font-normal text-fg-muted">({producerName})</span>
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-text text-lg leading-none"
            aria-label={t("close_aria")}
          >
            ×
          </button>
        )}
      </div>

      <div className="divide-y divide-border/40">
        {toggleRow("notify_new_event", t("row_new_event"), "🎉")}
        {toggleRow("notify_new_product", t("row_new_product"), "🛍️")}
        {toggleRow("notify_delivery_area", t("row_delivery_area"), "🚚")}
        {toggleRow("whatsapp_opt_in", t("row_whatsapp_opt_in"), "💬")}
      </div>

      {pushStatus !== "unsupported" && pushStatus !== "granted" && (
        <button
          onClick={enablePush}
          disabled={pushStatus === "denied"}
          className="w-full text-xs border border-primary/30 text-primary px-3 py-2 rounded-[8px] hover:bg-primary/5 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {pushStatus === "denied" ? (
            <>
              <BellSlash size={14} aria-hidden="true" />
              {t("push_blocked")}
            </>
          ) : (
            <>
              <Bell size={14} aria-hidden="true" />
              {t("push_enable")}
            </>
          )}
        </button>
      )}

      {pushStatus === "granted" && (
        <p className="text-xs text-primary flex items-center gap-1">
          <Bell size={12} weight="fill" aria-hidden="true" />
          {t("push_active")}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-primary text-white text-sm py-2 rounded-[8px] hover:bg-primary-dark transition disabled:opacity-50"
      >
        {saving ? t("saving") : t("save_cta")}
      </button>
    </div>
  );
}
