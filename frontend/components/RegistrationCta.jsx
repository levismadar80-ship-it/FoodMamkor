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
 *           MEH-3043 (13/11): the open form can be closed again (× in the
 *           card on desktop, a full-screen sheet with × on a phone) and a
 *           sticky phone bar keeps the action in reach — RegistrationOverlays.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { getWhatsAppHref, normalizePhone } from "@/lib/utils";
import Input from "@/components/ui/Input";
import CollectionNotice from "@/components/CollectionNotice";
import ShareSiteActions from "@/components/ShareSiteActions";
import { RegistrationSheet, StickyRegistrationBar, isDesktop, useInView } from "@/components/RegistrationOverlays";

const BTN =
  "flex items-center justify-center min-h-[48px] w-full bg-primary text-white px-6 rounded-full font-semibold hover:bg-primary-dark transition focus-ring disabled:opacity-60";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

// Letters in any script — the server's 2-letter rule for a name.
const LETTERS_RE = /\p{L}/gu;

/** Which form fields a FastAPI 422 body names: [{loc: [..., "email"]}] → ["email"].
 * The server's own text is Hebrew whatever the page language, so the caller
 * shows its own message per field. */
function fieldsFrom(detail) {
  if (!Array.isArray(detail)) return [];
  const fields = detail.map((d) => (Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null));
  return [...new Set(fields.filter((f) => ["name", "phone", "email"].includes(f)))];
}

function SignupForm({ kind, itemId, onDone }) {
  const t = useTranslations("registration.signup");
  // Same namespace EventForm.jsx:165 reads it from — one owner for the label.
  const tPrivacyLink = useTranslations("auth.register.consumer.terms");
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
    if (!errs.name && (form.name.match(LETTERS_RE) || []).length < 2) errs.name = t("name_short");
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
      const fields = err.response?.status === 422 ? fieldsFrom(detail) : [];
      const own = { name: "name_short", phone: "phone_invalid", email: "email_invalid" };
      if (fields.length) setErrors(Object.fromEntries(fields.map((f) => [f, t(own[f])])));
      else setBanner((detail && typeof detail === "object" && !Array.isArray(detail) && detail.message) || t("generic"));
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
      {/* MEH-2777: the SAME approved sentence, now through the
          notice-at-collection component (MEH-1981) so it carries the
          /privacy link the other eight collection points already have.
          The message string is unchanged — `registration.signup.privacy`,
          approved 6/11 — so this adds the link, not new copy.

          MEH-2798 removed the `className="text-fg-muted"` that used to sit
          here: it existed only because CollectionNotice's default tone was
          `text-muted-foreground`, which is not a token and emitted no CSS.
          The component's default is now that same token, so pinning it at
          this one call site would be a second owner for the fact. */}
      <CollectionNotice
        message={t("privacy")}
        linkLabel={tPrivacyLink("privacy_link")}
        testId="registration-collection-notice"
      />
      <button type="submit" disabled={sending} className={BTN} data-testid="registration-submit">
        {sending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

/**
 * Which action the CTA offers — one answer for the inline block AND the
 * sticky phone bar (MEH-3043), so the two can never disagree. `null` = no
 * channel reaches anyone, so nothing renders anywhere.
 */
function resolveAction({ method, phone, url, isFull, waitlistHref, title, t }) {
  const mobile = normalizePhone(phone);
  const anyPhone = phone && String(phone).replace(/\D/g, "").length >= 9 ? phone : null;
  if (isFull) return waitlistHref ? { kind: "waitlist", href: waitlistHref } : { kind: "full" };
  if (method === "external_url") return url ? { kind: "external", href: url } : null;
  if (method === "whatsapp" || method === "phone") {
    if (method === "whatsapp" && mobile) {
      return { kind: "whatsapp", href: getWhatsAppHref(mobile, t("whatsapp_message", { title })) };
    }
    // No mobile for WhatsApp → a call still reaches the business.
    return anyPhone ? { kind: "phone", href: telHref(anyPhone) } : null;
  }
  // site_form (the default for anything unknown — the server only accepts
  // the four methods, and the on-site form is the one that needs no channel).
  const questionHref = mobile
    ? getWhatsAppHref(mobile, t("question_message", { title }))
    : anyPhone
      ? telHref(anyPhone)
      : null;
  return { kind: "form", questionHref, questionExternal: Boolean(mobile) };
}

/** The action as a link — every kind except the on-site form and «full». */
function ActionLink({ action, label, testId, onClick }) {
  const external = action.kind !== "phone";
  return (
    <a
      href={action.href}
      onClick={onClick}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={BTN}
      data-testid={testId}
    >
      {label}
    </a>
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
 * @param {Function} [onWaitlistClick] counts the tap for the host (MEH-2991)
 * @param {string} [waitlistLabel]
 * @param {string} [barNote]     the date line beside the button on the phone bar
 *
 * MEH-3043 (Sapir 13/11, option ב): the form opened and could never close.
 * Now: on a phone the sign-up button also rides a sticky bar while the inline
 * one is off screen, and the form opens in a full-screen sheet with ×
 * (Eventbrite's mobile checkout). On a desktop the form opens in place in the
 * side card, under a heading with ×.
 */
export default function RegistrationCta(props) {
  const { kind, itemId, title, isFull, waitlistLabel, onWaitlistClick, barNote } = props;
  const t = useTranslations("registration.cta");
  const tSignup = useTranslations("registration.signup");
  const tCommon = useTranslations("common.aria");
  // null = closed · "inline" = in the card (desktop) · "sheet" = full screen (phone)
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState(false);
  const openBtnRef = useRef(null);
  const inlineRef = useRef(null);
  const action = resolveAction({ ...props, t });
  const inlineVisible = useInView(inlineRef, Boolean(action));
  const signupLabel = kind === "events" ? t("signup_event") : t("signup_experience");

  const openForm = () => setOpen(isDesktop() ? "inline" : "sheet");
  const closeForm = useCallback(() => {
    setOpen(null);
    // Focus goes back to the button that opened it (WAI-ARIA dialog pattern),
    // without scrolling: a sheet opened from the sticky bar must close onto
    // the same reading position. After a sign-up the button is gone and focus
    // goes to the confirmation that replaced it.
    requestAnimationFrame(() => {
      const target = openBtnRef.current ?? document.querySelector('[data-testid="registration-success"]');
      target?.focus({ preventScroll: true });
    });
  }, []);

  if (!action) return null;

  const label = {
    waitlist: waitlistLabel,
    external: t("external"),
    whatsapp: t("whatsapp"),
    phone: t("phone"),
    form: signupLabel,
  }[action.kind];
  const formAction = action.kind === "form";
  const showBar = action.kind !== "full" && !done && !open && inlineVisible === false;

  const form = <SignupForm kind={kind} itemId={itemId} onDone={() => setDone(true)} />;
  const question = formAction && action.questionHref && (
    <a
      href={action.questionHref}
      {...(action.questionExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="block text-center text-sm text-primary underline underline-offset-2 min-h-touch leading-[44px]"
      data-testid="registration-question"
    >
      {t("question")}
    </a>
  );

  return (
    <>
      <div ref={inlineRef}>
        <InlineBlock
          action={action}
          label={label}
          done={done}
          open={open}
          kind={kind}
          title={title}
          form={form}
          question={question}
          signupLabel={signupLabel}
          closeLabel={tCommon("close")}
          onOpen={openForm}
          onClose={closeForm}
          openBtnRef={openBtnRef}
          onWaitlistClick={onWaitlistClick}
          fullText={t("full")}
          successText={tSignup("success")}
        />
      </div>
      {showBar && (
        <StickyRegistrationBar note={barNote}>
          {formAction ? (
            <button type="button" className={BTN} onClick={() => setOpen("sheet")} data-testid="registration-bar-action">
              {label}
            </button>
          ) : (
            <ActionLink action={action} label={label} testId="registration-bar-action" onClick={action.kind === "waitlist" ? onWaitlistClick : undefined} />
          )}
        </StickyRegistrationBar>
      )}
      {open === "sheet" && (
        <RegistrationSheet title={`${signupLabel} · ${title}`} closeLabel={tCommon("close")} onClose={closeForm}>
          {done ? (
            <DoneBlock kind={kind} title={title} successText={tSignup("success")} />
          ) : (
            <>
              <div id="registration-form-panel">{form}</div>
              {question}
            </>
          )}
        </RegistrationSheet>
      )}
    </>
  );
}

function InlineBlock({ action, label, done, open, kind, title, form, question, signupLabel, closeLabel, onOpen, onClose, openBtnRef, onWaitlistClick, fullText, successText }) {
  if (action.kind === "full") {
    return (
      <p className="text-center font-semibold text-text" data-testid="registration-full">
        {fullText}
      </p>
    );
  }
  if (action.kind !== "form") {
    const testId = { waitlist: "registration-waitlist", external: "registration-external", whatsapp: "registration-whatsapp", phone: "registration-phone" }[action.kind];
    return <ActionLink action={action} label={label} testId={testId} onClick={action.kind === "waitlist" ? onWaitlistClick : undefined} />;
  }

  // While the phone sheet is open it carries the confirmation itself; the
  // card shows it once the sheet closes (one copy on screen at a time).
  if (done && open !== "sheet") return <DoneBlock kind={kind} title={title} successText={successText} />;

  return (
    <div className="space-y-3" data-testid="registration-site-form">
      {open === "inline" ? (
        <div id="registration-form-panel">
          {/* MEH-3043: the heading names what is open, × closes it. RTL: the
              × mirrors to the inline END and the heading reserves its width
              (rtl.md, MEH-2038). */}
          <div className="relative mb-1">
            <h3 className="font-semibold text-text pe-12 min-h-[44px] flex items-center">{signupLabel}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="absolute top-0 end-0 w-11 h-11 flex items-center justify-center rounded-full text-fg-muted hover:bg-background focus-ring"
              data-testid="registration-close"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {form}
        </div>
      ) : (
        <button
          ref={openBtnRef}
          type="button"
          className={BTN}
          onClick={onOpen}
          data-testid="registration-open"
        >
          {signupLabel}
        </button>
      )}
      {/* While the phone sheet is open it carries the question link. */}
      {open !== "sheet" && question}
    </div>
  );
}

function DoneBlock({ kind, title, successText }) {
  // MEH-2827 PR 5: just signed up is when a friend gets invited — one «שתפו»
  // that shares THIS event page (title + its own URL, no site message).
  // Events only; experiences keep the plain confirmation.
  const eventUrl = kind === "events" && typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}`
    : "";
  return (
    <div className="space-y-3">
      <p role="status" tabIndex={-1} className="text-sm bg-green-50 border border-primary/30 text-text rounded-md p-3 focus:outline-none" data-testid="registration-success">
        {successText}
      </p>
      {eventUrl && (
        <ShareSiteActions layout="compact" url={eventUrl} title={title} message="" />
      )}
    </div>
  );
}
