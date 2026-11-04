/**
 * «מה להביא» on the experience page: the host's free text becomes a checklist.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { splitBringList } from "@/lib/bring-list";
import ExperienceDetailClient from "@/app/[locale]/experiences/[id]/ExperienceDetailClient";

vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "x-1" }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

describe("splitBringList", () => {
  it.each([
    ["נעליים סגורות", ["נעליים סגורות"]],
    ["סינר, נעליים סגורות, יכולת עמידה של שעתיים", ["סינר", "נעליים סגורות", "יכולת עמידה של שעתיים"]],
    ["סינר\nנעליים סגורות, גרביים", ["סינר", "נעליים סגורות, גרביים"]],
    ["- סינר\n• כובע\n\n", ["סינר", "כובע"]],
    ["", []],
    [null, []],
    ["  ,  ", []],
    ["גרביים (לבנות, לא צבעוניות), סינר", ["גרביים (לבנות, לא צבעוניות)", "סינר"]],
    // An unclosed "(" must not swallow the rest of the line into one item.
    ["סינר (גדול, נעליים, כובע", ["סינר (גדול", "נעליים", "כובע"]],
  ])("%j → %j", (text, items) => {
    expect(splitBringList(text)).toEqual(items);
  });
});

async function renderWith(extra) {
  api.get.mockResolvedValue({
    data: {
      id: "x-1", title: "סדנת מחמצת", description: "סדנה של בוקר שלם", event_date: "2026-11-20",
      city: "חיפה", location_type: "public", status: "approved", host: { id: "u1", name: "נועה" }, ...extra,
    },
  });
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <ExperienceDetailClient />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
}

describe("experience page — «מה להביא»", () => {
  it("one item per comma, under the approved heading", async () => {
    await renderWith({ requirements: "סינר, נעליים סגורות" });
    const box = screen.getByTestId("experience-bring");
    expect(within(box).getByRole("heading", { level: 2 }).textContent).toBe("מה להביא");
    expect(within(box).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["סינר", "נעליים סגורות"]);
  });

  it("sits above the description", async () => {
    await renderWith({ requirements: "סינר" });
    const bring = screen.getByTestId("experience-bring");
    const desc = screen.getByText("סדנה של בוקר שלם");
    expect(bring.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("many items, one per line, with no description", async () => {
    await renderWith({ requirements: "סינר\nנעליים סגורות\nבקבוק מים", description: "" });
    const items = within(screen.getByTestId("experience-bring")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["סינר", "נעליים סגורות", "בקבוק מים"]);
  });

  it("no requirements → no box", async () => {
    await renderWith({ requirements: null });
    expect(screen.queryByTestId("experience-bring")).not.toBeInTheDocument();
  });
});
