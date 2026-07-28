import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// MEH-1709 — the producer group-buys dashboard, seen by a business owner in
// the window between registering and being approved.
//
// The backend genuinely 403-gates creation on approval (group_buys.py:187,
// "רק בעלי עסק מאושרים יכולים לפתוח קבוצת רכש"), and that gate is correct.
// Its UI expression was not: a muted, non-responding "+ קבוצת רכש חדשה" in
// the header, a why-locked line in its own paragraph below it, and — because
// EmptyState self-hides a CTA whose handler is missing — an empty state with
// no button either. Two empty regions, and the only thing on screen that
// looks pressable does nothing (NN/g on disabled controls).
//
// The fix is structural, not copy: the header button is ABSENT while
// unapproved (not disabled), and the existing gate string becomes the
// EmptyState description. Zero new i18n keys.
//
// These assertions are shown failing by construction against the pre-fix
// page — see the PR body. The discriminating case is `unapproved + empty`:
// the older sibling spec (DashboardEmptyStateFormExclusive) passes on BOTH
// versions of the page, because its mock producer carries no `status` at
// all, so it never enters this branch.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key) => `${ns}.${key}`;
    t.rich = (key) => `${ns}.${key}`;
    t.raw = (key) => `${ns}.${key}`;
    return t;
  },
  useLocale: () => "he",
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));

const stableUser = { id: "u1", role: "producer" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));

// Mutable fixture the api mock reads — set per test before render.
const fixture = { status: "approved", groupBuys: [] };

const groupBuy = (over = {}) => ({
  id: "gb1",
  producer_id: "p1",
  title: "ארגז ירקות שבועי",
  product_name: "ארגז ירקות",
  status: "open",
  price_per_unit_group: 80,
  price_per_unit_regular: 100,
  commits_count: 2,
  min_participants: 10,
  deadline: "2026-09-01T09:00:00Z",
  created_at: "2026-07-01T09:00:00Z",
  ...over,
});

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url, config) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({
          data: { producer: { id: "p1", city: "תל אביב", status: fixture.status } },
        });
      }
      if (url === "/group-buys") {
        // The page fans out over four statuses and concatenates; return the
        // fixture only for "open" so a single item is not counted four times.
        return Promise.resolve({
          data: config?.params?.status === "open" ? fixture.groupBuys : [],
        });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import ProducerGroupBuysPage from "@/app/[locale]/producer/dashboard/group-buys/page";

const K = {
  openForm: "group_buys.dashboard.btn_open_form",
  closeForm: "group_buys.dashboard.btn_close_form",
  emptyTitle: "group_buys.dashboard.empty_title",
  emptyDescription: "group_buys.dashboard.empty_description",
  emptyCta: "group_buys.dashboard.empty_cta",
  gate: "group_buys.dashboard.approval_required_hint",
};

beforeEach(() => {
  vi.clearAllMocks();
  fixture.status = "approved";
  fixture.groupBuys = [];
});

describe("group-buys dashboard — gated empty state (MEH-1709)", () => {
  describe("F1 · unapproved producer, zero group buys", () => {
    beforeEach(() => {
      fixture.status = "pending";
      fixture.groupBuys = [];
    });

    it("renders the gate explanation as the EmptyState description", async () => {
      render(<ProducerGroupBuysPage />);
      expect(await screen.findByText(K.emptyTitle)).toBeTruthy();
      // The why-locked string is inside the empty state, not in a paragraph
      // of its own above it.
      expect(screen.getByText(K.gate)).toBeTruthy();
      expect(screen.queryByTestId("group-buy-approval-hint")).toBeNull();
      // …and it REPLACES the generic pitch, rather than stacking with it.
      expect(screen.queryByText(K.emptyDescription)).toBeNull();
      // Said once, not twice.
      expect(screen.getAllByText(K.gate)).toHaveLength(1);
    });

    it("renders no create button anywhere — absent, not disabled", async () => {
      render(<ProducerGroupBuysPage />);
      await screen.findByText(K.emptyTitle);
      // Header toggle: gone. Not `toBeDisabled` — gone.
      expect(screen.queryByText(K.openForm)).toBeNull();
      expect(screen.queryByText(K.closeForm)).toBeNull();
      // EmptyState CTA: gone (no ctaLabel).
      expect(screen.queryByText(K.emptyCta)).toBeNull();
      // Nothing left on screen claims to create a group buy. The only button
      // is the "מה זה?" disclosure, which is not a create affordance.
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0].getAttribute("data-testid")).toBe("whats-this-group-buy");
    });

    it("leaves the WhatsThis disclosure untouched", async () => {
      render(<ProducerGroupBuysPage />);
      await screen.findByText(K.emptyTitle);
      const disclosure = screen.getByTestId("whats-this-group-buy");
      expect(disclosure.getAttribute("aria-expanded")).toBe("false");
      expect(disclosure.textContent).toBe("whats_this.trigger");
    });
  });

  describe("F2 · approved producer, zero group buys", () => {
    it("puts the single create CTA inside the empty state", async () => {
      fixture.status = "approved";
      render(<ProducerGroupBuysPage />);
      expect(await screen.findByText(K.emptyCta)).toBeTruthy();
      // MEH-1097 F14 precedent: one button while empty — the header toggle
      // stays hidden so the EmptyState CTA is the sole entry point.
      expect(screen.queryByText(K.openForm)).toBeNull();
      // The gate string has no business here.
      expect(screen.queryByText(K.gate)).toBeNull();
      expect(screen.getByText(K.emptyDescription)).toBeTruthy();
    });
  });

  describe("F3 · approved producer with group buys — unchanged", () => {
    it("restores the header button and renders the list", async () => {
      fixture.status = "approved";
      fixture.groupBuys = [groupBuy()];
      render(<ProducerGroupBuysPage />);
      expect(await screen.findByText(K.openForm)).toBeTruthy();
      expect(screen.getByText("ארגז ירקות שבועי")).toBeTruthy();
      expect(screen.queryByText(K.emptyTitle)).toBeNull();
      expect(screen.queryByText(K.gate)).toBeNull();
    });
  });

  describe("unapproved producer WITH group buys (suspended-after-creating)", () => {
    it("drops the dead button but keeps the reason on screen", async () => {
      fixture.status = "suspended";
      fixture.groupBuys = [groupBuy()];
      render(<ProducerGroupBuysPage />);
      expect(await screen.findByText("ארגז ירקות שבועי")).toBeTruthy();
      // No create affordance…
      expect(screen.queryByText(K.openForm)).toBeNull();
      // …but the explanation survives: this branch has no EmptyState to
      // carry it, so the standalone paragraph is still the right home.
      expect(screen.getByTestId("group-buy-approval-hint").textContent).toBe(K.gate);
    });
  });

  describe("status unknown (dashboard fetch failed) — fail-open", () => {
    it("treats a missing status as approved, matching the backend gate", async () => {
      fixture.status = undefined; // producer.status absent → producerStatus null
      fixture.groupBuys = [];
      render(<ProducerGroupBuysPage />);
      // notApproved stays false, so the empty state keeps its CTA and the
      // gate string does not appear. The backend still enforces the 403.
      expect(await screen.findByText(K.emptyCta)).toBeTruthy();
      await waitFor(() => expect(screen.queryByText(K.gate)).toBeNull());
    });
  });
});
