/**
 * MEH-2665 — stage B: an optional minimum number of sign-ups to run the
 * experience. The form takes it (never above the max); the page reads it
 * against the host-reported participants_count.
 * Page cells: no min · min not reached · min reached · past.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";

vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
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
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
}));

import ExperienceDetailClient from "@/app/[locale]/experiences/[id]/ExperienceDetailClient";
import ExperienceForm from "@/components/ExperienceForm";

const D = he.experiences.detail;
const T = he.experiences.new;
const BASE = {
  id: "x-1", title: "סדנת מחמצת", description: "סדנה של בוקר שלם", event_date: "2099-11-20",
  city: "חיפה", location_type: "public", status: "approved", is_active: true, max_participants: 8,
  participants_count: 0, spots_left: 8, host: { id: "u1", name: "נועה" },
};

function intl(ui) {
  return render(<NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem" onError={() => {}}>{ui}</NextIntlClientProvider>);
}
async function page(extra) {
  api.get.mockResolvedValue({ data: { ...BASE, ...extra } });
  intl(<ExperienceDetailClient />);
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
}

beforeEach(() => vi.clearAllMocks());

describe("experience page — minimum to run", () => {
  it("no minimum → no line", async () => {
    await page({ min_participants: null });
    expect(screen.queryByTestId("experience-min")).not.toBeInTheDocument();
  });

  it("below the minimum → «נפתחת ב-4 נרשמים לפחות»", async () => {
    await page({ min_participants: 4, participants_count: 3, spots_left: 5 });
    expect(screen.getByTestId("experience-min").textContent).toBe("נפתחת ב-4 נרשמים לפחות");
  });

  it("at the minimum → «הסדנה יוצאת לפועל»", async () => {
    await page({ min_participants: 4, participants_count: 4, spots_left: 4 });
    expect(screen.getByTestId("experience-min").textContent).toBe("הסדנה יוצאת לפועל");
  });

  it("minimum with no cap still shows", async () => {
    await page({ min_participants: 3, participants_count: 0, max_participants: null, spots_left: null });
    expect(screen.queryByTestId("experience-capacity")).not.toBeInTheDocument();
    expect(screen.getByTestId("experience-min").textContent).toBe(D.min_to_open.replace("{n}", "3"));
  });

  it("past experience → no line", async () => {
    await page({ min_participants: 4, event_date: "2020-01-01" });
    expect(screen.queryByTestId("experience-min")).not.toBeInTheDocument();
  });
});

describe("experience form — minimum field", () => {
  const ROW = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "סדנת גבינות ותיקה",
    description: "סדנה בת שלוש שעות להכנת גבינות עיזים מחלב טרי מהרפת שלנו",
    event_date: "2099-09-01", city: "חיפה", location_type: "public", max_participants: 8,
    min_participants: 3,
  };
  const renderEdit = (row = ROW) => intl(<ExperienceForm mode="edit" initial={row} />);
  const save = () => fireEvent.click(screen.getByRole("button", { name: T.save_cta }));

  it("seeds the stored minimum and sends a changed one", async () => {
    api.put.mockResolvedValue({ data: {} });
    renderEdit();
    const field = screen.getByLabelText(T.field_min_participants);
    expect(field.value).toBe("3");
    expect(screen.getByText(T.field_min_participants_hint)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "5" } });
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1].min_participants).toBe(5);
  });

  it("a minimum above the maximum blocks save with the approved message", async () => {
    renderEdit();
    fireEvent.change(screen.getByLabelText(T.field_min_participants), { target: { value: "9" } });
    save();
    await waitFor(() => expect(screen.getByText("המינימום לא יכול להיות גדול מהמקסימום")).toBeInTheDocument());
    expect(api.put).not.toHaveBeenCalled();
  });

  it("an emptied minimum is sent as null", async () => {
    api.put.mockResolvedValue({ data: {} });
    renderEdit();
    fireEvent.change(screen.getByLabelText(T.field_min_participants), { target: { value: "" } });
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1].min_participants).toBeNull();
  });
});
