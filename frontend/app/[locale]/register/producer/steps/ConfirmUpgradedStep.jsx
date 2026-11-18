// @ts-check
/**
 * ConfirmUpgradedStep — one frame of the business registration wizard.
 * MEH-3294: moved verbatim out of RegisterProducerClient.jsx; every value it
 * reads from the wizard arrives as a prop of the same name. State lives in
 * RegisterProducerClient.jsx — this file holds no hooks.
 */
import { CheckCircle, ShareNetwork } from "@phosphor-icons/react";

/** @param {Record<string, any>} props */
export default function ConfirmUpgradedStep({ router, shareRegisterInvite, t, whatsappSent }) {
  return (
    <div className="text-center py-8" data-testid="register-success-pending">
      <div className="mb-4 flex justify-center">
        <CheckCircle size={64} weight="fill" className="text-primary" aria-hidden="true" />
      </div>
      {/* MEH-1814: names the state ("בבדיקה") and the expected wait, then
          the two owner actions that speed approval — the Google Business
          Profile "pending review, ~3 business days" pattern. Replaces the
          old heading/body/next-stages block, which described OUR process
          stages rather than what the seller should do next. */}
      <h2 className="font-headline-lg text-3xl font-black text-text mb-2">{t("auth.register.producer.success.title")}</h2>
      <p className="text-fg-muted mb-6">{t("auth.register.producer.success.body")}</p>
      {!whatsappSent && (
        <div
          role="status"
          className="bg-background border border-border text-fg-muted rounded-md px-4 py-3 mb-6 text-sm text-end"
        >
          {t("auth.register.producer.success.whatsapp_warning")}
        </div>
      )}
      <div className="bg-green-50 rounded-lg p-5 text-start mb-6">
        <p className="text-sm text-text leading-relaxed">{t("auth.register.producer.success.next")}</p>
      </div>
      {/* MEH-2136: the dashboard CTA sits directly under the box that names
          the dashboard, and is the only primary weight on the screen. It
          used to be an outline button two blocks further down, tied in
          weight with the WhatsApp share beside it — Sapir registered and
          did not find the dashboard. Share drops to secondary below it;
          signature + tier_trust follow the buttons instead of splitting
          the box from the action it points at. */}
      <div className="flex flex-col gap-3 mb-6 sm:mx-auto sm:max-w-xs">
        <button
          data-testid="register-success-dashboard-cta"
          onClick={() => router.push("/producer/dashboard")}
          className="w-full bg-primary-dark text-white px-6 py-3 rounded-full hover:bg-primary transition font-medium text-sm"
        >
          {t("auth.register.producer.success.cta")}
        </button>
        {/* MEH-2827 PR 8: the phone's own share sheet, not WhatsApp only.
            The message's link goes as `url`, the rest as text. */}
        <button
          type="button"
          onClick={shareRegisterInvite}
          data-testid="register-success-share"
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md font-medium text-sm border border-border bg-background text-text hover:border-primary transition"
        >
          <ShareNetwork size={20} aria-hidden="true" />
          {t("auth.register.producer.success.share_cta")}
        </button>
      </div>
      {/* MEH-132: S7 06A founder sign-off */}
      <p className="font-headline-md text-text text-center mb-2">{t("auth.register.producer.success.signature")}</p>
      <p className="text-xs text-fg-muted text-center leading-relaxed">{t("auth.register.producer.success.tier_trust")}</p>
    </div>
  );
}
