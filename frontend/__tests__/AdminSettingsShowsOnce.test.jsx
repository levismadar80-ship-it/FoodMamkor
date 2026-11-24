/**
 * MEH-3818 — /admin/settings appears once, with its cards already filled.
 *
 * On a slow phone the page used to show its own sections first, with the
 * checklist card at the top as a one-line «טוענת…»; a beat later that card grew
 * to ~1,650px and pushed every section below it down (0.55 layout shift). The
 * page now reads the checklist and the passkeys together with its settings and
 * holds its skeleton until all three answered, or until SECTIONS_WAIT_MS.
 *
 * The assertions are about what the admin sees: whether the sections are on
 * screen while a card is still reading, and whether the one-line placeholder
 * was ever inserted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { renderHe as render } from "./helpers/render-with-he";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminSettingsPage, { SECTIONS_WAIT_MS } from "@/app/[locale]/admin/settings/page";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));

const HOLIDAY = he.admin.settings.sections.holiday;
const CHECKLIST_TITLE = he.admin.settings.checklist.title;
const CARD_LOADING = he.admin.settings.checklist.loading;
const ITEMS = [{ id: "11111111-1111-1111-1111-111111111111", label: "פרטים בסיסיים", hint: null, active: true }];
const PASSKEYS = { passkeys: [], has_password: true, recovery_codes_left: 0 };

let releaseChecklist;
let placeholderSeen;
let observer;

function answer(url) {
  if (url.startsWith("/admin/checklist-items"))
    return new Promise((resolve) => { releaseChecklist = () => resolve({ data: ITEMS }); });
  if (url === "/auth/passkey") return Promise.resolve({ data: PASSKEYS });
  if (url === "/admin/settings/vacation") return Promise.resolve({ data: { active: false } });
  return Promise.resolve({ data: { friday_mode_override: "false" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(answer);
  placeholderSeen = false;
  observer = new MutationObserver(() => {
    if (document.body.textContent.includes(CARD_LOADING)) placeholderSeen = true;
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
});
afterEach(() => {
  observer.disconnect();
  vi.useRealTimers();
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("MEH-3818 — the settings page shows once", () => {
  it("holds the sections while the checklist is still reading, then shows them with the list", async () => {
    render(<AdminSettingsPage />);
    await flush();
    expect(screen.queryByText(HOLIDAY)).toBeNull();

    await act(async () => releaseChecklist());
    expect(await screen.findByText(HOLIDAY)).toBeInTheDocument();
    expect(screen.getByText(CHECKLIST_TITLE)).toBeInTheDocument();
    expect(screen.getByDisplayValue("פרטים בסיסיים")).toBeInTheDocument();
    expect(placeholderSeen, "the card's one-line «טוענת…» was painted").toBe(false);
  });

  it("does not wait past the cap for a slow checklist", async () => {
    vi.useFakeTimers();
    render(<AdminSettingsPage />);
    await flush();
    expect(screen.queryByText(HOLIDAY)).toBeNull();
    await act(async () => { vi.advanceTimersByTime(SECTIONS_WAIT_MS); });
    expect(screen.getByText(HOLIDAY)).toBeInTheDocument();
    // …and the late list still lands in the card.
    await act(async () => releaseChecklist());
    expect(screen.getByDisplayValue("פרטים בסיסיים")).toBeInTheDocument();
  });

  it("reads the checklist once, from the page (the card does not read it again)", async () => {
    render(<AdminSettingsPage />);
    await act(async () => releaseChecklist());
    await screen.findByText(HOLIDAY);
    const reads = api.get.mock.calls.filter(([u]) => u.startsWith("/admin/checklist-items"));
    expect(reads).toHaveLength(1);
  });
});
