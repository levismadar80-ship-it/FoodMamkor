// @ts-check
"use client";

/**
 * Module:   OwnerAssistantCard
 * Purpose:  What an assistant answer opens inside the chat: the page-fields
 *           review, the product rows read from her text, the menu upload, the
 *           photos card, or the WhatsApp check + «שליחה לבדיקה». Each one is
 *           the dashboard's own component, saved by its own route.
 * Touches:  nothing itself — PageFillReview (PUT /producers/me), MenuImport
 *           (POST /producers/me/menu-import/*), ImagesCard (POST /upload/image
 *           + PUT /producers/me), DraftSubmitBanner (submit-for-review).
 * Does NOT: decide what to open (the server's `action` / `draft` /
 *           `products` does) or hold the conversation (OwnerAssistant.jsx).
 * History:  MEH-3902 (26/11).
 */

import PageFillReview from "@/components/PageFillReview";
import MenuImport from "@/components/MenuImport";
import DraftSubmitBanner from "@/components/producer/DraftSubmitBanner";
import { ImagesCard } from "@/app/[locale]/producer/dashboard/edit/cards/ImagesCard";

/**
 * @typedef {"fields" | "products" | "photos" | "submitted"} DoneKind
 * @param {{ message: import("./OwnerAssistantPanel").OwnerMessage, profile: any,
 *   onDone: (kind: DoneKind) => void, onProfile: (patch: object) => void }} props
 */
export default function OwnerAssistantCard({ message, profile, onDone, onProfile }) {
  if (!profile || message.done) return null;
  const productCount = Array.isArray(profile.products) ? profile.products.length : 0;
  let body = null;
  if (message.draft) {
    body = (
      <PageFillReview draft={message.draft} profile={profile} saveUrl="/producers/me" onSaved={() => onDone("fields")} />
    );
  } else if (message.products?.length || message.action === "add_products") {
    body = (
      <MenuImport productCount={productCount} initialRows={message.products ?? null} onPublished={() => onDone("products")} />
    );
  } else if (message.action === "upload_photos") {
    body = <ImagesCard profile={profile} onSave={(/** @type {object} */ patch) => { onProfile(patch); onDone("photos"); }} />;
  } else if (message.action === "send_for_review" && profile.status === "draft") {
    body = (
      <DraftSubmitBanner
        producer={profile}
        onSubmitted={() => { onProfile({ status: "pending" }); onDone("submitted"); }}
        onPhoneVerified={() => onProfile({ phone_verified: true })}
      />
    );
  }
  if (!body) return null;
  return (
    <div className="rounded-md border border-border bg-surface p-3" data-testid="owner-assistant-card">
      {body}
    </div>
  );
}
