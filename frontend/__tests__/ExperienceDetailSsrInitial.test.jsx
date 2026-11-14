/**
 * MEH-3199 — the workshop page's first HTML carries the workshop.
 * Cells: server copy + no client answer yet (SSR string) · server copy + refetch
 * fails (kept) · server copy + refetch succeeds (replaced) · no server copy +
 * refetch fails (client «not found», as before) · the segment's not-found.js
 * shows a pending workshop to its host with the «נשלח» banner · page.js wiring.
 * Harness: ExperienceSpotsLeft.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";

vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const SEARCH = { value: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "x-1" }),
  useSearchParams: () => SEARCH.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ href, children, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

import ExperienceDetailClient from "@/app/[locale]/experiences/[id]/ExperienceDetailClient";
import ExperienceNotFound from "@/app/[locale]/experiences/[id]/not-found";

const T = he.experiences.detail;
const EX = {
  id: "x-1", title: "סדנת מחמצת", description: "סדנה של בוקר שלם", event_date: "2099-11-20",
  city: "חיפה", location_type: "public", status: "approved", is_active: true, max_participants: 8,
  registration_method: "whatsapp",
  host: { id: "u1", name: "נועה", producer_id: "p1", producer_name: "מאפיית נועה", producer_phone: "050-1234567" },
};
const never = () => new Promise(() => {});
const wrap = (ui) => (
  <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">{ui}</NextIntlClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  SEARCH.value = new URLSearchParams();
  api.get.mockImplementation(never);
});

describe("MEH-3199 — workshop page SSR", () => {
  it("server copy: the HTML string already has the title, not the skeleton", () => {
    const html = renderToString(wrap(<ExperienceDetailClient initialExperience={EX} />));
    expect(html).toContain("סדנת מחמצת");
    expect(html).not.toContain('aria-busy="true"');
  });

  it("server copy + refetch fails: the workshop stays on screen", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    render(wrap(<ExperienceDetailClient initialExperience={EX} />));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/experiences/x-1"));
    await Promise.resolve();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("סדנת מחמצת");
    expect(document.body.textContent).not.toContain(T.not_found);
  });

  it("server copy + refetch succeeds: the fresh copy replaces it", async () => {
    api.get.mockResolvedValue({ data: { ...EX, title: "סדנת מחמצת — עודכן" } });
    render(wrap(<ExperienceDetailClient initialExperience={EX} />));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("סדנת מחמצת — עודכן"));
  });

  it("no server copy + refetch fails: the client «not found» (unchanged)", async () => {
    api.get.mockRejectedValue(new Error("404"));
    render(wrap(<ExperienceDetailClient />));
    await waitFor(() => expect(document.body.textContent).toContain(T.not_found));
  });

  it("not-found.js: the host's token fetch shows her pending workshop + the «נשלח» banner", async () => {
    SEARCH.value = new URLSearchParams("pending=1");
    api.get.mockResolvedValue({ data: { ...EX, status: "pending" } });
    render(wrap(<ExperienceNotFound />));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("סדנת מחמצת"));
    expect(document.body.textContent).toContain(T.just_submitted);
  });

  it("page.js hands its server fetch to the client, keyed by id", () => {
    const src = readFileSync(join(process.cwd(), "app/[locale]/experiences/[id]/page.js"), "utf8");
    expect(src).toMatch(/<ExperienceDetailClient\s+key=\{experience\.id \?\? params\.id\}\s+initialExperience=\{experience\}\s*\/>/);
  });
});
