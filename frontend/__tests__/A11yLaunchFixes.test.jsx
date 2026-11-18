import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

/**
 * MEH-3191 — pre-launch accessibility fixes (IS 5568 / WCAG 2.1 AA audit,
 * 14/11). One case per finding, named after the screen it covers.
 */

const post = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock("@/lib/api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

import ContactClient from "@/app/[locale]/contact/ContactClient";
import EmptyState from "@/components/ui/EmptyState";
import { dashboardTitle, useDashboardTitle } from "@/lib/use-dashboard-title";

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

describe("/contact — our own Hebrew field errors, not the browser's bubbles", () => {
  const renderContact = () =>
    render(
      <NextIntlClientProvider locale="he" messages={he}>
        <ContactClient />
      </NextIntlClientProvider>,
    );

  it("an empty submit marks the three fields invalid, sends nothing, focuses the first", () => {
    renderContact();
    const form = document.getElementById("contact-message").closest("form");
    expect(form.noValidate).toBe(true);
    fireEvent.submit(form);
    for (const id of ["contact-name", "contact-email", "contact-message"]) {
      expect(document.getElementById(id).getAttribute("aria-invalid")).toBe("true");
    }
    expect(document.activeElement.id).toBe("contact-name");
    expect(post).not.toHaveBeenCalled();
    expect(screen.getAllByText(he.registration.signup.required).length).toBeGreaterThanOrEqual(3);
  });

  it("a malformed email gets the email-invalid message, tied to the field", () => {
    renderContact();
    fireEvent.change(document.getElementById("contact-name"), { target: { value: "דנה" } });
    fireEvent.change(document.getElementById("contact-email"), { target: { value: "dana@" } });
    fireEvent.change(document.getElementById("contact-message"), { target: { value: "שאלה" } });
    fireEvent.submit(document.getElementById("contact-message").closest("form"));
    const email = document.getElementById("contact-email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    const described = email.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    expect(described.split(" ").map((id) => document.getElementById(id)?.textContent).join(" ")).toContain(
      he.registration.signup.email_invalid,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("editing a field clears its own error (no stale aria-invalid)", () => {
    renderContact();
    fireEvent.submit(document.getElementById("contact-message").closest("form"));
    const name = document.getElementById("contact-name");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(name, { target: { value: "דנה" } });
    expect(name.getAttribute("aria-invalid")).not.toBe("true");
    // the other fields keep theirs until edited
    expect(document.getElementById("contact-email").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("/login — the field error is linked to its field", () => {
  const src = read("app/[locale]/login/LoginClient.jsx");
  it("email field points at login-email-error, and that id exists", () => {
    expect(src).toContain('aria-describedby={emailInvalid ? "login-email-error" : undefined}');
    expect(src).toContain('id="login-email-error"');
  });
  it("password field points at login-password-error, and that id exists", () => {
    expect(src).toMatch(/aria-describedby=\{[^}]*"login-password-error"/);
    expect(src).toContain('id="login-password-error"');
  });
});

describe("dashboard — each screen has its own title", () => {
  it("«<tab> | מהמקור» in Hebrew, Latin brand in English", () => {
    expect(dashboardTitle("עריכה", "he")).toBe("עריכה | מהמקור");
    expect(dashboardTitle("Edit", "en")).toBe("Edit | Mehamakor");
  });
  it("no active tab → null, so the page keeps its own title", () => {
    expect(dashboardTitle(null, "he")).toBeNull();
  });
  it("the hook sets the tab's title and restores the previous one when no tab is active", () => {
    document.title = "לוח בקרה | מהמקור";
    const { rerender } = renderHook(({ label, path }) => useDashboardTitle(label, "he", path), {
      initialProps: { label: "סקירה", path: "/producer/dashboard" },
    });
    expect(document.title).toBe("סקירה | מהמקור");
    rerender({ label: "כלים", path: "/producer/dashboard/tools" });
    expect(document.title).toBe("כלים | מהמקור");
    rerender({ label: null, path: "/producer/dashboard/somewhere" });
    expect(document.title).toBe("לוח בקרה | מהמקור");
  });

  it("the dashboard shell calls the hook", () => {
    expect(read("app/[locale]/producer/dashboard/DashboardLayoutClient.jsx")).toContain("useDashboardTitle(");
  });
});

describe("EmptyState headingLevel — /group-buys empty state does not skip a level", () => {
  it("default stays h3 for every other caller", () => {
    render(<EmptyState title="ריק" />);
    expect(screen.getByRole("heading", { name: "ריק" }).tagName).toBe("H3");
  });
  it("headingLevel={2} renders an h2, and /group-buys passes it", () => {
    render(<EmptyState title="אין" headingLevel={2} />);
    expect(screen.getByRole("heading", { name: "אין" }).tagName).toBe("H2");
    expect(read("app/[locale]/group-buys/GroupBuysClient.jsx")).toMatch(/<EmptyState[^>]*headingLevel=\{2\}/);
  });
});

describe("static fixes", () => {
  it("business-page contact row: no role=listitem on links (it replaced the link role)", () => {
    expect(read("app/[locale]/producer/[id]/components/ContactCard.jsx")).not.toMatch(/role="listitem"/);
  });
  it("home category photo: alt=\"\" inside the already-named link", () => {
    const src = read("app/[locale]/home/HomeCategoryGrid.jsx");
    expect(src).toMatch(/data-testid="home-category-image"[\s\S]{0,80}alt=""/);
    expect(src).not.toContain("alt={card.name}");
  });
  it("bottom-nav glass: background alpha ≥ 0.88 so the label keeps 4.5:1 over dark content", () => {
    const m = read("app/globals.css").match(/\.nav-pill-glass[\s\S]*?rgba\(255,\s*254,\s*251,\s*([0-9.]+)\)/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(0.88);
  });
  it("dashboard group-buy description textarea has a label", () => {
    const src = read("app/[locale]/producer/dashboard/group-buys/page.js");
    expect(src).toContain('htmlFor="group-buy-description"');
    expect(src).toContain('id="group-buy-description"');
  });
});
