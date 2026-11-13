"use client";

import { trackChannelClick } from "@/lib/contact-tracking";

/**
 * MEH-2991: one of the organizer page's quiet contact pills. A client
 * component only so the tap can be counted (lib/contact-tracking.js) — the
 * markup is what page.js rendered inline before. The preferred channel is
 * OrganizerPrimaryContact.jsx.
 */
export default function OrganizerContactLink({ channel, label, producerId, className }) {
  const inPlace = channel.key === "phone" || channel.key === "email";
  return (
    <a
      href={channel.href}
      onClick={() => trackChannelClick(producerId, channel.key)}
      {...(inPlace ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      data-testid={`organizer-contact-${channel.key}`}
      className={className}
    >
      {label}
    </a>
  );
}
