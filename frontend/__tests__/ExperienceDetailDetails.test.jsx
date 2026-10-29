/**
 * MEH-2476 — what the host fills in ExperienceForm reaches the experience
 * page: duration, the recurring schedule, the kind of place, and the host's
 * business (a link + a WhatsApp CTA that actually reaches the host).
 * Each field: shown when set, absent when not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceDetailClient from "@/app/[locale]/experiences/[id]/ExperienceDetailClient";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "x-1" }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

const t = he.experiences.detail;

const BASE = {
  id: "x-1",
  title: "סדנת מחמצת",
  description: "סדנה של בוקר שלם",
  event_date: "2026-11-20",
  event_time: "10:00:00",
  city: "חיפה",
  location_type: "public",
  price_per_person: 120,
  status: "approved",
  is_recurring: false,
  recurring_schedule: null,
  duration_minutes: null,
  host: { id: "u1", name: "נועה" },
};

async function renderWith(extra) {
  api.get.mockResolvedValue({ data: { ...BASE, ...extra } });
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <ExperienceDetailClient />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
}

beforeEach(() => vi.clearAllMocks());

describe("MEH-2476 — experience details", () => {
  it.each([
    [45, "45 דקות"],
    [60, "שעה"],
    [90, "שעה וחצי"],
    [120, "שעתיים"],
    [150, "שעתיים וחצי"],
    [180, "3 שעות"],
    [210, "3 שעות וחצי"],
    [80, "שעה ו-20 דקות"],
  ])("duration %i min reads «%s»", async (minutes, text) => {
    await renderWith({ duration_minutes: minutes });
    expect(screen.getByTestId("experience-duration").textContent).toBe(text);
  });

  it("no duration → no duration line", async () => {
    await renderWith({});
    expect(screen.queryByTestId("experience-duration")).not.toBeInTheDocument();
  });

  it("recurring with a schedule shows the schedule, and the date as a start", async () => {
    await renderWith({ is_recurring: true, recurring_schedule: "כל יום שישי 9:00–12:00" });
    expect(screen.getByTestId("experience-recurring").textContent).toBe(
      t.recurring.replace("{schedule}", "כל יום שישי 9:00–12:00"),
    );
    expect(screen.getByTestId("experience-date").textContent).toContain("החל מ-");
  });

  it("one-off experience: no recurring line, a plain date", async () => {
    await renderWith({});
    expect(screen.queryByTestId("experience-recurring")).not.toBeInTheDocument();
    expect(screen.getByTestId("experience-date").textContent).not.toContain("החל מ-");
  });

  it("the kind of place is named next to the city", async () => {
    await renderWith({ location_type: "home" });
    expect(screen.getByTestId("experience-place").textContent).toContain(he.experiences.new.location_home);
  });

  it("host with an approved business: her business is linked and WhatsApp reaches her", async () => {
    await renderWith({
      host: {
        id: "u1",
        name: "נועה",
        producer_id: "p-1",
        producer_slug: "chavat-noa",
        producer_name: "חוות נועה",
        producer_phone: "052-1234567",
      },
    });
    const link = screen.getByTestId("experience-host-link");
    expect(link.getAttribute("href")).toBe("/chavat-noa");
    // Avatar initial «ח», the label, the business name; plus a chevron.
    expect(link.textContent).toBe(`ח${t.host_label} חוות נועה`);
    expect(link.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: t.whatsapp_cta }).getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/972521234567\?text=/,
    );
  });

  it("host without a business link keeps the plain name", async () => {
    await renderWith({});
    expect(screen.queryByTestId("experience-host-link")).not.toBeInTheDocument();
    const row = screen.getByTestId("experience-host");
    expect(row.textContent).toBe(`נ${t.host_label} נועה`);
    // No link → no chevron promising one.
    expect(row.querySelector("a")).toBeNull();
    expect(row.querySelector("svg")).toBeNull();
  });
});
