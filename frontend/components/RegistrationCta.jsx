"use client";

/**
 * Module:   RegistrationCta
 * Purpose:  The sign-up block on a public event / workshop page, by the
 *           owner's «איך נרשמים?» choice (MEH-2768):
 *             site_form    → «הרשמה לסדנה/לאירוע» opens the form below it,
 *                            plus «או שאלה למארחת» through the business phone;
 *             whatsapp     → «הרשמה ב-WhatsApp» to the business mobile;
 *             phone        → «התקשרות להרשמה» (tel:);
 *             external_url → «להרשמה ←» to the owner's link.
 *           A method whose channel is missing renders NOTHING rather than a
 *           link that reaches nobody — the recipient-less wa.me that started
 *           MEH-2762. WhatsApp falls back to a call when only a landline exists.
 * Touches:  POST /{events|experiences}/{id}/registrations (no account).
 * Does NOT: decide whether sign-up is open at all (past / cancelled /
 *           unapproved) — the caller renders it only when it is; the server
 *           re-checks everything (routers/registrations.py).
 * Related:  app/[locale]/experiences/[id]/ExperienceDetailClient.jsx,
 *           app/[locale]/events/[id]/EventDetailClient.jsx
 * History:  MEH-2768 (creation). Copy approved by Sapir 6/11 (items 5–9).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { getWhatsAppHref, normalizePhone } from "@/lib/utils";
import Input from "@/components/ui/Input";

const BTN =
  "flex items-center justify-center min-h-[48px] w-full bg-primary text-white px-6 rounded-full font-semibold hover:bg-primary-dark transition focus-ring disabled:opacity-60";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

/** Field errors from a FastAPI 422 body: [{loc: [..., "email"], msg}] → {email: msg}. */
function fieldErrorsFrom(detail) {
  if (!Array.isArray(detail)) return null;
  const out = {};
  for (const d of detail) {
    const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
    if (field && !out[field]) out[field] = String(d.msg || "").replace(/^Value error, /, "");
  }
  return Object.keys(out).length ? out : null;
}

function SignupForm({ kind, itemId, onDone }) {
  const t = useTranslations("registration.signup");
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [sending, setSending] = useState(false);

  // The button that opened the form is gone; focus lands on the first field.
  useEffect(() => {
    document.getElementById("signup-name")?.focus();
  }, []);

  const set = (field) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((errs) => (errs[field] ? { ...errs, [field]: undefined } : errs));
  };

  const validate = () => {
    const errs = {};
    for (const f of ["name", "phone", "email"]) if (!form[f].trim()) errs[f] = t("required");
    if (!errs.email && !EMAIL_RE.test(form.email.trim())) errs.email = t("email_invalid");
    if (!errs.phone && String(form.phone).replace(/\D/g, "").length < 9) errs.phone = t("phone_invalid");
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    setBanner("");
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      document.getElementById(`signup-${["name", "phone", "email"].find((f) => errs[f])}`)?.focus();
      return;
    }
    setSending(true);
    try {
      // Literal paths, so the API-contract audit can resolve both routes.
      const path = kind === "events" ? `/events/${itemId}/registrations` : `/experiences/${itemId}/registrations`;
      await api.post(path, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      });
      onDone();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const fieldErrs = err.response?.status === 422 ? fieldErrorsFrom(detail) : null;
      if (fieldErrs) setErrors(fieldErrs);
      else setBanner((detail && typeof detail === "object" && detail.message) || t("generic"));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3" data-testid="registration-form">
      {banner && (
        <p role="alert" className="text-sm bg-danger-50 border border-danger-200 text-danger-700 rounded-md p-3">
          {banner}
        </p>
      )}
      <Input id="signup-name" label={t("name")} required autoComplete="name" value={form.name} onChange={set("name")} error={errors.name} />
      <Input
        id="signup-phone"
        type="tel"
        label={t("phone")}
        required
        autoComplete="tel"
        inputMode="tel"
        dir="ltr"
        value={form.phone}
        onChange={set("phone")}
        error={errors.phone}
      />
      <Input
        id="signup-email"
        type="email"
        label={t("email")}
        required
        autoComplete="email"
        dir="ltr"
        value={form.email}
        onChange={set("email")}
        error={errors.email}
      />
      <p className="text-xs text-fg-muted">{t("privacy")}</p>
      <button type="submit" disabled={sending} className={BTN} data-testid="registration-submit">
        {sending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

/**
 * @param {"events"|"experiences"} kind
 * @param {string} itemId
 * @param {string} title
 * @param {string} method        registration_method
 * @param {string|null} phone    the business phone (raw)
 * @param {string|null} url      registration_url (external_url only)
 * @param {boolean} isFull       no spots left
 * @param {string} [waitlistHref] WhatsApp waitlist link when full (workshops)
 * @param {string} [waitlistLabel]
 */
export default function RegistrationCta({ kind, itemId, title, method, phone, url, isFull, waitlistHref, waitlistLabel }) {
  const t = useTranslations("registration.cta");
  const tSignup = useTranslations("registration.signup");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const mobile = normalizePhone(phone);
  const anyPhone = phone && String(phone).replace(/\D/g, "").length >= 9 ? phone : null;

  if (isFull) {
    if (waitlistHref) {
      return (
        <a href={waitlistHref} target="_blank" rel="noopener noreferrer" className={BTN} data-testid="registration-waitlist">
          {waitlistLabel}
        </a>
      );
    }
    return (
      <p className="text-center font-semibold text-text" data-testid="registration-full">
        {t("full")}
      </p>
    );
  }

  if (method === "external_url") {
    if (!url) return null;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={BTN} data-testid="registration-external">
        {t("external")}
      </a>
    );
  }

  if (method === "whatsapp" || method === "phone") {
    if (method === "whatsapp" && mobile) {
      return (
        <a
          href={getWhatsAppHref(mobile, t("whatsapp_message", { title }))}
          target="_blank"
          rel="noopener noreferrer"
          className={BTN}
          data-testid="registration-whatsapp"
        >
          {t("whatsapp")}
        </a>
      );
    }
    // No mobile for WhatsApp → a call still reaches the business.
    if (!anyPhone) return null;
    return (
      <a href={telHref(anyPhone)} className={BTN} data-testid="registration-phone">
        {t("phone")}
      </a>
    );
  }

  // site_form (the default for anything unknown — the server only accepts
  // the four methods, and the on-site form is the one that needs no channel).
  const questionHref = mobile
    ? getWhatsAppHref(mobile, t("question_message", { title }))
    : anyPhone
      ? telHref(anyPhone)
      : null;

  if (done) {
    return (
      <p role="status" className="text-sm bg-green-50 border border-primary/30 text-text rounded-md p-3" data-testid="registration-success">
        {tSignup("success")}
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="registration-site-form">
      {!open && (
        <button
          type="button"
          className={BTN}
          onClick={() => setOpen(true)}
          data-testid="registration-open"
        >
          {kind === "events" ? t("signup_event") : t("signup_experience")}
        </button>
      )}
      {open && (
        <div id="registration-form-panel">
          <SignupForm kind={kind} itemId={itemId} onDone={() => setDone(true)} />
        </div>
      )}
      {questionHref && (
        <a
          href={questionHref}
          {...(mobile ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="block text-center text-sm text-primary underline underline-offset-2 min-h-touch leading-[44px]"
          data-testid="registration-question"
        >
          {t("question")}
        </a>
      )}
    </div>
  );
}
