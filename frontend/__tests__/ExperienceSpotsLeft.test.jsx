/**
 * MEH-2663 — the host reports sign-ups from her dashboard; the experience page
 * names the spots only when few are left, and a full one offers a waitlist.
 * Cells: no cap · plenty (4+) · few (2–3) · last (1) · full (0) · past + full.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";

vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const ROUTER = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "x-1" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ROUTER,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ROUTER,
  Link: ({ href, children, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1", role: "producer" }, loading: false }) }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

import ExperienceDetailClient from "@/app/[locale]/experiences/[id]/ExperienceDetailClient";
import ManageExperiencesPage from "@/app/[locale]/producer/dashboard/experiences/page";

const D = he.experiences.detail;
const M = he.dashboard.producer.manage_experiences;
const BASE = {
  id: "x-1", title: "סדנת מחמצת", description: "סדנה של בוקר שלם", event_date: "2099-11-20",
  city: "חיפה", location_type: "public", status: "approved", is_active: true, max_participants: 8,
  host: { id: "u1", name: "נועה" },
};

function intl(ui) {
  return render(<NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">{ui}</NextIntlClientProvider>);
}
async function page(extra) {
  api.get.mockResolvedValue({ data: { ...BASE, ...extra } });
  intl(<ExperienceDetailClient />);
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
}

beforeEach(() => vi.clearAllMocks());

describe("experience page — spots", () => {
  it.each([
    [8, "עד 8 משתתפים"],
    [4, "עד 8 משתתפים"],
    [3, "נשארו 3 מקומות"],
    [2, "נשארו 2 מקומות"],
    [1, "נשאר מקום אחרון"],
    [0, "הסדנה מלאה"],
  ])("spots_left %i → «%s»", async (spots, text) => {
    await page({ spots_left: spots, participants_count: 8 - spots });
    expect(screen.getByTestId("experience-capacity").textContent).toBe(text);
  });

  it("no cap → no capacity line, sign-up CTA", async () => {
    await page({ max_participants: null, spots_left: null });
    expect(screen.queryByTestId("experience-capacity")).not.toBeInTheDocument();
    expect(screen.getByTestId("experience-whatsapp-cta").textContent).toBe(D.whatsapp_cta);
  });

  it("spots left → the sign-up CTA and message", async () => {
    await page({ spots_left: 2 });
    const cta = screen.getByTestId("experience-whatsapp-cta");
    expect(cta.textContent).toBe(D.whatsapp_cta);
    expect(decodeURIComponent(cta.getAttribute("href"))).toContain("אני רוצה להירשם");
  });

  it("full → the waitlist CTA with the waitlist message", async () => {
    await page({ spots_left: 0, participants_count: 8 });
    const cta = screen.getByTestId("experience-whatsapp-cta");
    expect(cta.textContent).toBe("לרשימת ההמתנה ב-WhatsApp");
    expect(decodeURIComponent(cta.getAttribute("href"))).toContain('היי! אשמח להיכנס לרשימת ההמתנה של "סדנת מחמצת"');
  });

  it("host-cancelled → no sign-up or waitlist CTA", async () => {
    await page({ is_active: false, spots_left: 0 });
    expect(screen.queryByTestId("experience-whatsapp-cta")).not.toBeInTheDocument();
  });

  it("past and full → no CTA at all", async () => {
    await page({ event_date: "2020-01-01", spots_left: 0 });
    expect(screen.queryByTestId("experience-whatsapp-cta")).not.toBeInTheDocument();
  });
});

describe("dashboard — «כמה כבר נרשמו»", () => {
  async function dash(rows) {
    api.get.mockResolvedValue({ data: rows });
    intl(<ManageExperiencesPage />);
    await waitFor(() => expect(screen.getByText(rows[0].title)).toBeInTheDocument());
  }

  it("approved + cap → field with hint; saves a bare participants_count", async () => {
    await dash([{ ...BASE, participants_count: 2 }]);
    const field = screen.getByLabelText(M.signed_up_label);
    expect(field.value).toBe("2");
    expect(screen.getByText(M.signed_up_hint)).toBeInTheDocument();
    api.put.mockResolvedValue({ data: { ...BASE, participants_count: 6, spots_left: 2 } });
    fireEvent.change(field, { target: { value: "6" } });
    fireEvent.blur(field);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/experiences/x-1", { participants_count: 6 }));
  });

  it("a number above the cap is clamped to the cap", async () => {
    await dash([{ ...BASE, participants_count: 0 }]);
    api.put.mockResolvedValue({ data: { ...BASE, participants_count: 8, spots_left: 0 } });
    const field = screen.getByLabelText(M.signed_up_label);
    fireEvent.change(field, { target: { value: "12" } });
    fireEvent.blur(field);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/experiences/x-1", { participants_count: 8 }));
  });

  it("unchanged value → no request", async () => {
    await dash([{ ...BASE, participants_count: 3 }]);
    fireEvent.blur(screen.getByLabelText(M.signed_up_label));
    expect(api.put).not.toHaveBeenCalled();
  });

  it.each([
    ["no cap", { max_participants: null }],
    ["pending", { status: "pending" }],
    ["past", { event_date: "2020-01-01" }],
  ])("%s → no field", async (_label, extra) => {
    await dash([{ ...BASE, ...extra }]);
    expect(screen.queryByTestId("experience-signup-count")).not.toBeInTheDocument();
  });
});
