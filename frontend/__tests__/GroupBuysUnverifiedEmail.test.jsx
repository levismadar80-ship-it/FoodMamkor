/**
 * MEH-2918 — group-buys dashboard: the verified-email notice opens the form
 * (it used to sit only beside «פתיחה», after the 403). Cells: approved ×
 * unverified → one notice at the top of the form · approved × verified →
 * none · pending × unverified → no form, so no email line.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key) => `${ns}.${key}`;
    t.rich = (key) => `${ns}.${key}`;
    t.raw = (key) => `${ns}.${key}`;
    return t;
  },
  useLocale: () => "he",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ href, children, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));
const fixture = { status: "approved", user: { id: "u1", role: "producer", email_verified: false } };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: fixture.user, loading: false }),
}));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({ data: { producer: { id: "p1", city: "תל אביב", status: fixture.status } } });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import ProducerGroupBuysPage from "@/app/[locale]/producer/dashboard/group-buys/page";

const GATE = /auth\.verify\.publish_gate$/;
const OPEN = "group_buys.dashboard.empty_cta";
const HEADING = "group_buys.dashboard.form.heading";

beforeEach(() => {
  fixture.status = "approved";
  fixture.user = { id: "u1", role: "producer", email_verified: false };
});

describe("group-buys form — verified-email notice up front (MEH-2918)", () => {
  it("approved + unverified: one notice, above the first field", async () => {
    render(<ProducerGroupBuysPage />);
    fireEvent.click(await screen.findByText(OPEN));
    const heading = await screen.findByText(HEADING);
    const found = screen.getAllByText(GATE);
    expect(found).toHaveLength(1);
    // Before the fields, not beside the submit button.
    const form = heading.closest("form");
    const firstInput = form.querySelector("input, textarea, select");
    expect(found[0].compareDocumentPosition(firstInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("approved + verified: no notice", async () => {
    fixture.user = { id: "u1", role: "producer", email_verified: true };
    render(<ProducerGroupBuysPage />);
    fireEvent.click(await screen.findByText(OPEN));
    await screen.findByText(HEADING);
    expect(screen.queryAllByText(GATE)).toHaveLength(0);
  });

  it("pending + unverified: no form, no email line", async () => {
    fixture.status = "pending";
    render(<ProducerGroupBuysPage />);
    await screen.findByText("group_buys.dashboard.empty_title");
    expect(screen.queryByText(OPEN)).toBeNull();
    expect(screen.queryAllByText(GATE)).toHaveLength(0);
  });
});
