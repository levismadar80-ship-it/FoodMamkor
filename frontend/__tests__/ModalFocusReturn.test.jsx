/**
 * MEH-158 — Modal focus return (WCAG 2.1 AA § 2.4.3)
 * When a modal closes, focus must return to the element that triggered it.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";

// MEH-475 PR-C4a chunk 3: mock next-intl per PR-A1/B precedent.
// Covers strings from LocationModal + LoginPromptModal that this file
// renders. Test assertions use Hebrew strings, so map them explicitly.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      // modals.location
      title: "איפה את?",
      subtitle: "נמצא עסקים קרובים אליך",
      search_label: "חיפוש עיר",
      search_placeholder: "הקלידי שם עיר...",
      aria_label: "בחירת עיר",
      close_aria: "סגור",
      geo_button: "קרוב אליי",
      geo_loading: "מחפשת...",
      geo_failure: "לא הצלחנו לקבל את המיקום שלך",
      current_location_fallback: "מיקום נוכחי",
      skip: "דלגי לעכשיו",
      "popular_cities.tel_aviv": "תל אביב",
      "popular_cities.jerusalem": "ירושלים",
      "popular_cities.haifa": "חיפה",
      "popular_cities.beersheba": "באר שבע",
      // modals.login_prompt
      default_message: "כדי לשמור עסקים אוהבים — היכנסי",
      title: "רוצה לשמור? 🌿",
      login_cta: "היכנסי",
      dismiss_cta: "אולי אחר כך",
    };
    return flat[key] ?? key;
  },
}));

import LocationModal from "@/components/LocationModal";
import LoginPromptModal from "@/components/LoginPromptModal";
import ReportButton from "@/components/ReportButton";

vi.mock("@phosphor-icons/react", () => ({
  X: () => <span />,
  Crosshair: () => <span />,
}));

vi.mock("@/components/CitySearch", () => ({
  default: () => <input aria-label="חיפוש עיר" />,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "Test" } }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(() => Promise.resolve({})),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

afterEach(() => vi.clearAllMocks());

// ─── LocationModal ────────────────────────────────────────────────────────────

function LocationWrapper() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="trigger" onClick={() => setOpen(true)}>Open</button>
      <LocationModal open={open} onClose={() => setOpen(false)} onSelectCity={() => {}} />
    </>
  );
}

describe("LocationModal focus return (MEH-158)", () => {
  it("returns focus to trigger when closed via button", async () => {
    render(<LocationWrapper />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await act(async () => { fireEvent.click(trigger); });
    await act(async () => { fireEvent.click(screen.getByText("דלגי לעכשיו")); });

    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to trigger when closed via Escape", async () => {
    render(<LocationWrapper />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();

    await act(async () => { fireEvent.click(trigger); });
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });

    expect(document.activeElement).toBe(trigger);
  });
});

// ─── LoginPromptModal ─────────────────────────────────────────────────────────

function LoginWrapper() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="trigger" onClick={() => setOpen(true)}>Open</button>
      <LoginPromptModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe("LoginPromptModal focus return (MEH-158)", () => {
  it("returns focus to trigger when closed via 'אולי אחר כך'", async () => {
    render(<LoginWrapper />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await act(async () => { fireEvent.click(trigger); });
    await act(async () => { fireEvent.click(screen.getByText("אולי אחר כך")); });

    expect(document.activeElement).toBe(trigger);
  });
});

// ─── ReportButton ─────────────────────────────────────────────────────────────

describe("ReportButton focus return + dialog semantics (MEH-158)", () => {
  it("returns focus to trigger button when modal is cancelled", async () => {
    render(<ReportButton producerId={1} />);
    const trigger = screen.getByText("🚩 דווח על עסק");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await act(async () => { fireEvent.click(trigger); });
    await act(async () => { fireEvent.click(screen.getByText("ביטול")); });

    expect(document.activeElement).toBe(trigger);
  });

  it("modal has role=dialog and aria-modal", async () => {
    render(<ReportButton producerId={1} />);
    await act(async () => {
      fireEvent.click(screen.getByText("🚩 דווח על עסק"));
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "report-dialog-title");
  });
});
