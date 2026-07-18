"use client";

/**
 * MEH-54: Alert preference panel shown after a producer is favorited.
 * Allows users to choose which notifications to receive and opt in to push.
 */

import { useEffect, useState } from "react";
import { Bell, BellSlash, Check, Confetti, Handbag, Truck, ChatCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { validateIsraeliPhone } from "@/lib/validators";

const DEFAULT_PREFS = {
  notify_new_event: true,
  notify_new_product: true,
  notify_delivery_area: true,
  whatsapp_opt_in: false,
};

export default function AlertPrefsPanel({ producerId, producerName, onClose }) {
  const t = useTranslations("sweep_tail.alert_prefs");
  const { user, updateProfile } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushStatus, setPushStatus] = useState("unknown"); // unknown | granted | denied | unsupported
  // MEH-1191: just-in-time phone collection when opting into WhatsApp alerts.
  const [showPhoneField, setShowPhoneField] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const hasPhone = !!(user?.phone && user.phone.trim());
  const phoneValid = validateIsraeliPhone(phoneInput.trim());

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

    // MEH-1326: gate the push button on a server-provided VAPID key. With no
    // key configured, Web Push can never deliver, so we keep pushStatus at
    // "unsupported" (button not rendered) rather than showing a dead promise.
    let alive = true;
    (async () => {
      const { getVapidPublicKey } = await import("@/lib/push");
      const key = await getVapidPublicKey();
      if (!alive) return;
      if (!key || !("Notification" in window)) {
        setPushStatus("unsupported");
        return;
      }
      setPushStatus(Notification.permission === "granted" ? "granted" : "prompt");
    })();
    return () => {
      alive = false;
    };
  }, [producerId]);

  const toggle = (key) => {
    // MEH-1191: turning WhatsApp ON without a phone → collect it just-in-time
    // rather than saving an opt-in that fire_alerts can never deliver. The
    // toggle does NOT flip until a valid phone is saved.
    if (key === "whatsapp_opt_in" && !prefs.whatsapp_opt_in && !hasPhone) {
      setPhoneInput("");
      setShowPhoneField(true);
      return;
    }
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  const enablePush = async () => {
    const { requestPushPermission, subscribeToPush } = await import("@/lib/push");
    const granted = await requestPushPermission();
    if (!granted) {
      setPushStatus("denied");
      showToast.error(t("push_denied_toast"));
      return;
    }
    setPushStatus("granted");
    const sub = await subscribeToPush();
    if (sub) {
      // Save subscription immediately so it persists on next save
      setPrefs((p) => ({ ...p, _push_subscription: sub }));
    }
  };

  const save = async (override) => {
    if (!prefs) return;
    setSaving(true);
    try {
      // MEH-1191: `override` lets savePhoneAndEnable persist whatsapp_opt_in=true
      // in the same interaction without waiting on the async setPrefs to flush.
      const effective = { ...prefs, ...(override || {}) };
      let push_subscription = prefs._push_subscription || null;
      if (!push_subscription && pushStatus === "granted") {
        const { subscribeToPush } = await import("@/lib/push");
        push_subscription = await subscribeToPush();
      }
      await api.put(`/users/me/favorites/${producerId}/alerts`, {
        notify_new_event: effective.notify_new_event,
        notify_new_product: effective.notify_new_product,
        notify_delivery_area: effective.notify_delivery_area,
        whatsapp_opt_in: effective.whatsapp_opt_in,
        push_subscription,
      });
      showToast.success(t("save_success_toast"), { icon: <Check size={18} /> });
      onClose?.();
    } catch {
      showToast.error(t("save_error_toast"));
    } finally {
      setSaving(false);
    }
  };

  // MEH-1191: save the just-collected phone (reusing PATCH /users/me from
  // MEH-1190), flip the toggle ON, and persist the opt-in — one interaction.
  const savePhoneAndEnable = async () => {
    if (!phoneValid) return;
    setPhoneSaving(true);
    try {
      await updateProfile({ phone: phoneInput.trim() });
      setPrefs((p) => ({ ...p, whatsapp_opt_in: true }));
      setShowPhoneField(false);
      setPhoneInput("");
      await save({ whatsapp_opt_in: true });
    } catch {
      showToast.error(t("save_error_toast"));
    } finally {
      setPhoneSaving(false);
    }
  };

  const cancelPhone = () => {
    setShowPhoneField(false);
    setPhoneInput("");
  };

  if (loading) {
    return (
      <div className="p-4 text-sm text-fg-muted text-center animate-pulse">{t("loading")}</div>
    );
  }

  const toggleRow = (key, label, Icon) => (
    <label key={key} className="flex items-center justify-between gap-3 py-2 cursor-pointer select-none">
      <span className="flex items-center gap-2 text-sm text-text">
        <Icon size={18} className="text-primary" aria-hidden="true" />
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
        {toggleRow("notify_new_event", t("row_new_event"), Confetti)}
        {toggleRow("notify_new_product", t("row_new_product"), Handbag)}
        {toggleRow("notify_delivery_area", t("row_delivery_area"), Truck)}
        {toggleRow("whatsapp_opt_in", t("row_whatsapp_opt_in"), ChatCircle)}
      </div>

      {showPhoneField && (
        <div className="rounded-[8px] bg-primary/5 border border-primary/20 p-3 space-y-2">
          <p className="text-xs text-text">{t("phone_required_prompt")}</p>
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="050-1234567"
            dir="ltr"
            aria-label={t("phone_required_prompt")}
            className="w-full border border-border rounded-[8px] px-3 py-2 text-sm text-start outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={savePhoneAndEnable}
              disabled={!phoneValid || phoneSaving}
              className="flex-1 bg-primary text-white text-sm py-2 rounded-[8px] hover:bg-primary-dark transition disabled:opacity-50"
            >
              {phoneSaving ? t("saving") : t("phone_save_cta")}
            </button>
            <button
              onClick={cancelPhone}
              className="text-fg-muted hover:text-text text-lg leading-none px-2 py-2"
              aria-label={t("close_aria")}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {(pushStatus === "prompt" || pushStatus === "denied") && (
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
        onClick={() => save()}
        disabled={saving}
        className="w-full bg-primary text-white text-sm py-2 rounded-[8px] hover:bg-primary-dark transition disabled:opacity-50"
      >
        {saving ? t("saving") : t("save_cta")}
      </button>
    </div>
  );
}
