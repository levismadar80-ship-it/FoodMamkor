import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

/**
 * MEH-3720 — one «צרו קשר» pattern: the dashboard sheet offers WhatsApp ·
 * email · form in that order, the welcome card opens that sheet, and /contact
 * carries the same WhatsApp row above its email row.
 */

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/contact",
}));

import SupportContactSheet from "@/components/SupportContactSheet";
import OwnerWelcomeCard from "@/components/producer/OwnerWelcomeCard";
import ContactClient from "@/app/[locale]/contact/ContactClient";

const wrap = (ui) => render(<NextIntlClientProvider locale="he" messages={he}>{ui}</NextIntlClientProvider>);

describe("SupportContactSheet (MEH-3720)", () => {
  it("lists WhatsApp, email, form — in that order — and the form row opens /contact?topic=business", () => {
    wrap(<SupportContactSheet onClose={() => {}} />);
    const sheet = screen.getByTestId("support-contact-sheet");
    const rows = within(sheet).getAllByRole("link");
    expect(rows.map((r) => r.dataset.testid)).toEqual(["support-whatsapp", "support-email", "support-form"]);
    expect(rows[0].getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    expect(rows[1].getAttribute("href")).toBe("mailto:contact@mehamakor.co.il");
    expect(rows[2]).toHaveAttribute("href", "/contact?topic=business");
    expect(rows[2]).toHaveTextContent("טופס פנייה");
  });

  it("«סגרו» calls onClose", () => {
    const onClose = vi.fn();
    wrap(<SupportContactSheet onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "סגרו" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    wrap(<SupportContactSheet onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("OwnerWelcomeCard question line (MEH-3720)", () => {
  it("opens the support sheet instead of linking straight to wa.me", () => {
    const onSupport = vi.fn();
    wrap(<OwnerWelcomeCard onClose={() => {}} onSupport={onSupport} />);
    const line = screen.getByTestId("owner-welcome-whatsapp");
    expect(line.tagName).toBe("BUTTON");
    fireEvent.click(line);
    expect(onSupport).toHaveBeenCalledOnce();
  });
});

describe("/contact WhatsApp row (MEH-3720)", () => {
  it("shows WhatsApp before the email address, with the same copy as the sheet", () => {
    wrap(<ContactClient />);
    const wa = screen.getByTestId("contact-whatsapp");
    expect(wa).toHaveTextContent(he.contact.whatsapp_label);
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    const mail = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "mailto:contact@mehamakor.co.il");
    expect(wa.compareDocumentPosition(mail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("/contact and the sheet name WhatsApp the same way (MEH-3720)", () => {
  it.each(["whatsapp_label", "whatsapp_hours"])("contact.%s equals the sheet's", (key) => {
    expect(he.contact[key]).toBe(he.dashboard.producer.status.support[key]);
  });
});

describe("the dashboard help row promises the same reply time as /contact", () => {
  // Reads the message catalog, not source: the promise lives only in copy.
  const days = (s) => s.match(/(\d+)\s*ימי עסקים/)?.[1];
  it("both name the same number of business days", () => {
    const contact = days(he.contact.response_sla);
    expect(contact).toBeTruthy();
    expect(days(he.dashboard.producer.help_row.body)).toBe(contact);
  });
});
