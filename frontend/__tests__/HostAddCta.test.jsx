import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HostAddCta from "@/components/HostAddCta";

// MEH-3969 — «הוסיפו חוויה / אירוע» on /events. Before: one plain link to the
// dashboard form for everyone, so a visitor landed on /login and then on
// «אין גישה ללוח הבקרה». Owner → form; guest / customer → dialog to
// business sign-up; admin → nothing.

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
  useLocale: () => localeState.locale,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

const authState = { user: null, loading: false };
const localeState = { locale: "he" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

const FORM = "/producer/dashboard/experiences/new";

beforeEach(() => {
  authState.user = null;
  authState.loading = false;
  localeState.locale = "he";
});

function renderCta() {
  return render(
    <HostAddCta href={FORM} kind="experiences" testId="add-cta">
      add
    </HostAddCta>,
  );
}

describe("HostAddCta (MEH-3969)", () => {
  it("guest: the CTA opens a dialog with business sign-up and sign-in back to the form", () => {
    renderCta();
    const cta = screen.getByTestId("add-cta");
    expect(cta.tagName).toBe("BUTTON");
    expect(cta).not.toHaveAttribute("href");
    expect(screen.queryByTestId("host-gate")).toBeNull();

    fireEvent.click(cta);
    const dialog = screen.getByTestId("host-gate");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveTextContent("events.list.host_gate.title_experiences");
    expect(screen.getByTestId("host-gate-register")).toHaveAttribute("href", "/register/producer");
    expect(screen.getByTestId("host-gate-login")).toHaveAttribute(
      "href",
      `/login?redirect=${encodeURIComponent(FORM)}`,
    );
  });

  it("guest on /en: the sign-in return keeps the /en prefix", () => {
    localeState.locale = "en";
    renderCta();
    fireEvent.click(screen.getByTestId("add-cta"));
    expect(screen.getByTestId("host-gate-login")).toHaveAttribute(
      "href",
      `/login?redirect=${encodeURIComponent(`/en${FORM}`)}`,
    );
  });

  it("the dialog closes on its X", () => {
    renderCta();
    fireEvent.click(screen.getByTestId("add-cta"));
    fireEvent.click(screen.getByRole("button", { name: "common.aria.close" }));
    expect(screen.queryByTestId("host-gate")).toBeNull();
  });

  it("signed-in customer: sign-up only — no sign-in link (she is signed in)", () => {
    authState.user = { role: "consumer" };
    renderCta();
    fireEvent.click(screen.getByTestId("add-cta"));
    expect(screen.getByTestId("host-gate-register")).toHaveAttribute("href", "/register/producer");
    expect(screen.queryByTestId("host-gate-login")).toBeNull();
  });

  it("events kind: the dialog names events", () => {
    render(
      <HostAddCta href="/producer/dashboard/events/new" kind="events" testId="add-cta">
        add
      </HostAddCta>,
    );
    fireEvent.click(screen.getByTestId("add-cta"));
    expect(screen.getByTestId("host-gate")).toHaveTextContent("events.list.host_gate.title_events");
  });

  it("business owner: a straight link to the form, no dialog", () => {
    authState.user = { role: "producer" };
    renderCta();
    const cta = screen.getByTestId("add-cta");
    expect(cta.tagName).toBe("A");
    expect(cta).toHaveAttribute("href", FORM);
    fireEvent.click(cta);
    expect(screen.queryByTestId("host-gate")).toBeNull();
  });

  it("while auth resolves: the dialog button, never the link to the old /login dead end", () => {
    authState.loading = true;
    renderCta();
    const cta = screen.getByTestId("add-cta");
    expect(cta.tagName).toBe("BUTTON");
    expect(cta).not.toHaveAttribute("href");
  });

  it("order staff (signed in, not the owner): the dialog, sign-up only", () => {
    authState.user = { role: "consumer", staff_of: "b1" };
    renderCta();
    expect(screen.getByTestId("add-cta").tagName).toBe("BUTTON");
    fireEvent.click(screen.getByTestId("add-cta"));
    expect(screen.getByTestId("host-gate-register")).toBeInTheDocument();
    expect(screen.queryByTestId("host-gate-login")).toBeNull();
  });

  it("Escape closes the dialog", () => {
    renderCta();
    fireEvent.click(screen.getByTestId("add-cta"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("host-gate")).toBeNull();
  });

  it("admin: no CTA at all", () => {
    authState.user = { role: "admin" };
    renderCta();
    expect(screen.queryByTestId("add-cta")).toBeNull();
  });
});
