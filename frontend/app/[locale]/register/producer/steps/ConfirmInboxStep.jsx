// @ts-check
/**
 * ConfirmInboxStep — one frame of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx; every value it
 * reads from the wizard arrives as a prop of the same name. State lives in
 * RegisterProducerClient.jsx — this file holds no hooks.
 */
import { Link } from "@/i18n/navigation";
import { EnvelopeSimple } from "@phosphor-icons/react";

/** @param {Record<string, any>} props */
export default function ConfirmInboxStep({ router, t }) {
  return (
    <div className="text-center py-8" data-testid="register-frame-confirm">
      <div className="w-16 h-16 rounded-full bg-background mx-auto mb-4 flex items-center justify-center" aria-hidden="true">
        <EnvelopeSimple size={32} className="text-fg-muted" aria-hidden="true" />
      </div>
      <h2 className="font-headline-lg text-3xl font-black text-text mb-2">{t("auth.register.producer.success.inbox_title")}</h2>
      <p className="text-fg-muted text-sm mb-3">{t("auth.register.producer.success.inbox_body")}</p>
      <p className="text-fg-muted text-xs mb-3">{t("auth.register.producer.success.inbox_hint")}</p>
      {/* MEH-2492: say the next step up front — the link verifies, it does not log in. */}
      <p className="text-text text-sm font-medium mb-6" data-testid="register-confirm-next-step">
        {t("auth.register.producer.success.inbox_next")}
      </p>
      <p className="text-xs text-fg-muted mb-6 text-center leading-relaxed">{t("auth.register.producer.success.tier_trust")}</p>
      {/* MEH-2920: login does not wait for the email link (auth.py login
          never reads email_verified), so the screen offers the way that
          exists. This path holds no token (MEH-328 ack), hence a link to
          /login that returns to the dashboard — never router.push to a
          page that would bounce. Home drops to the secondary action. */}
      <div className="flex flex-col items-center gap-3">
        <Link
          href={`/login?redirect=${encodeURIComponent("/producer/dashboard")}`}
          data-testid="register-confirm-dashboard-cta"
          className="w-full sm:max-w-xs bg-primary-dark text-white px-6 py-3 rounded-full hover:bg-primary transition font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {t("auth.register.producer.success.cta")}
        </Link>
        <button
          onClick={() => router.push("/")}
          data-testid="register-confirm-home"
          className="text-primary-dark underline-offset-4 hover:underline px-6 py-2 rounded-md font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("auth.register.producer.success.back_home")}
        </button>
      </div>
    </div>
  );
}
