"use client";

/**
 * Module:   RegistrationMethodField
 * Purpose:  «איך נרשמים?» — the owner picks how visitors sign up to an event
 *           or an experience (MEH-2762 chunk 2): on-site form (default),
 *           WhatsApp, phone, or an external link. Shared by EventForm and
 *           ExperienceForm so both read the same four options.
 * Touches:  GET /producers/me (once) — only to know whether the business has
 *           a mobile (WhatsApp) / any phone (phone). The server re-checks both
 *           (services/registrations.py::method_problem), so this is a hint,
 *           not the boundary.
 * Does NOT: submit anything; the hosting form owns state and the PUT/POST.
 * Related:  components/EventForm.jsx, components/ExperienceForm.jsx,
 *           backend/app/routers/registrations.py
 * History:  MEH-2766 (creation). Copy approved by Sapir 6/11 (items 1–4).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { normalizePhone } from "@/lib/utils";
import Input from "@/components/ui/Input";

/**
 * Which methods the business can use, from GET /producers/me.
 * `null` while loading — nothing is disabled until the answer arrives, so a
 * slow request never flashes the options off.
 */
function useBusinessPhone() {
  const [phone, setPhone] = useState(null);
  useEffect(() => {
    let alive = true;
    // Wrapped so a missing/mocked client degrades to "unknown" (nothing
    // disabled) instead of throwing inside the effect.
    Promise.resolve()
      .then(() => api.get("/producers/me"))
      .then((r) => alive && setPhone(r.data?.phone || ""))
      // 403/404 = no business on this account → no phone to reach, so
      // WhatsApp and phone are off (the server would refuse them). Any other
      // failure stays "unknown".
      .catch((err) => {
        if (!alive) return;
        const status = err?.response?.status;
        setPhone(status === 403 || status === 404 ? "" : null);
      });
    return () => {
      alive = false;
    };
  }, []);
  return phone;
}

/**
 * @param {string} value                 "site_form" | "whatsapp" | "phone" | "external_url"
 * @param {(m:string)=>void} onChange
 * @param {string} url                   registration_url (external_url only)
 * @param {(u:string)=>void} onUrlChange
 * @param {string} [urlError]
 */
export default function RegistrationMethodField({ value, onChange, url, onUrlChange, urlError }) {
  const t = useTranslations("registration.form");
  const phone = useBusinessPhone();
  // normalizePhone accepts Israeli MOBILE numbers only — the same rule the
  // public page uses to build wa.me (ExperienceDetailClient.jsx).
  const noMobile = phone !== null && !normalizePhone(phone);
  const noPhone = phone !== null && !phone.trim();

  const options = [
    { key: "site_form", label: t("site_form"), hint: t("site_form_hint") },
    {
      key: "whatsapp",
      label: t("whatsapp"),
      hint: noMobile ? t("whatsapp_needs_mobile") : t("whatsapp_hint"),
      disabled: noMobile,
    },
    {
      key: "phone",
      label: t("phone"),
      hint: noPhone ? t("phone_needs_phone") : null,
      disabled: noPhone,
    },
    { key: "external_url", label: t("external_url"), hint: t("external_url_hint") },
  ];

  return (
    <fieldset data-testid="registration-method">
      <legend className="block text-sm font-medium text-text mb-2">{t("legend")}</legend>
      <div className="space-y-2">
        {options.map((o) => {
          const id = `registration_method_${o.key}`;
          const hintId = o.hint ? `${id}-hint` : undefined;
          const checked = value === o.key;
          return (
            <div key={o.key}>
              <label
                htmlFor={id}
                className={`flex items-start gap-3 rounded-sm border px-3 py-3 min-h-touch ${
                  checked ? "border-primary bg-green-50" : "border-border bg-surface"
                } ${o.disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <input
                  id={id}
                  type="radio"
                  name="registration_method"
                  value={o.key}
                  checked={checked}
                  disabled={o.disabled}
                  aria-describedby={hintId}
                  onChange={() => onChange(o.key)}
                  className="mt-1 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-text">{o.label}</span>
                  {o.hint && (
                    <span id={hintId} className="block text-xs text-fg-muted mt-0.5">
                      {o.hint}
                    </span>
                  )}
                </span>
              </label>
              {o.key === "external_url" && checked && (
                <div className="mt-2">
                  <Input
                    id="registration_url"
                    type="url"
                    aria-label={t("external_url")}
                    value={url}
                    onChange={(e) => onUrlChange(e.target.value)}
                    placeholder={t("external_url_placeholder")}
                    dir="ltr"
                    error={urlError}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
