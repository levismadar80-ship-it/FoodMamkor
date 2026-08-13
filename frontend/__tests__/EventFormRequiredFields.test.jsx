/**
 * MEH-2013 — the event form's two starred fields, enforced.
 *
 * Before this change:
 *   - "עיר *" was checked in NEITHER layer (validateEventForm skipped it,
 *     EventCreate.city was `str | None = None`)
 *   - "קטגוריה *" WAS required server-side, but DEFAULTS.category = "אחר"
 *     pre-filled it and the form is `noValidate`, so the <select>'s native
 *     `required` never fires. The gate was real and unreachable: every
 *     submission satisfied it with a catch-all nobody chose, and the only
 *     failure path left was a raw 422 with no message beside the field.
 *
 * Each assertion reds against that shape. Two guards exist specifically so
 * this cannot pass by rejecting everything:
 *   - "אחר" must remain SELECTABLE (only the preselection was removed)
 *   - a complete submit must still POST
 *
 * REUSES: __tests__/EventExperienceAddress.test.jsx (harness shape).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "producer" }, loading: false }),
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, id }) => (
    <input aria-label="city" id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const T = he.sweep_tail.event_new;

function wrap(node) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {node}
    </NextIntlClientProvider>,
  );
}

async function renderNewEventPage() {
  const { default: NewEventPage } = await import(
    "@/app/[locale]/producer/dashboard/events/new/page"
  );
  return wrap(<NewEventPage />);
}

const submit = (container) =>
  fireEvent.click(container.querySelector('button[type="submit"]'));

/** Everything required EXCEPT city and category. */
function fillEverythingElse(container) {
  fireEvent.change(container.querySelector("#title"), {
    target: { value: "יום פתוח במאפייה" },
  });
  fireEvent.change(container.querySelector("#event_date"), {
    target: { value: "2026-09-01" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { status: "approved" } });
  api.post.mockResolvedValue({ data: { id: "new-id" } });
});

describe("EventForm — category is a real choice (MEH-2013)", () => {
  it("a fresh form has no category preselected", async () => {
    const { container } = await renderNewEventPage();

    // "" is the disabled placeholder — NOT "אחר", which is what it was.
    expect(container.querySelector("#category").value).toBe("");
  });

  it("renders a disabled placeholder option, so 'unchosen' is a real state", async () => {
    const { container } = await renderNewEventPage();

    const placeholder = container.querySelector('#category option[value=""]');
    expect(placeholder).not.toBeNull();
    expect(placeholder).toBeDisabled();
    expect(placeholder).toHaveTextContent(T.field_category_placeholder);
  });

  it("submitting with no category is blocked by an inline message, not a raw 422", async () => {
    const { container } = await renderNewEventPage();
    fillEverythingElse(container);
    fireEvent.change(screen.getByLabelText("city"), { target: { value: "תל אביב" } });

    submit(container);

    expect(await screen.findByText(T.error_category_required)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/events", expect.anything());
  });

  it("the category error is wired to the select", async () => {
    const { container } = await renderNewEventPage();
    fillEverythingElse(container);
    fireEvent.change(screen.getByLabelText("city"), { target: { value: "תל אביב" } });

    submit(container);
    await screen.findByText(T.error_category_required);

    const select = container.querySelector("#category");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(select.getAttribute("aria-describedby"))).toHaveTextContent(
      T.error_category_required,
    );
  });

  it("category is reachable by first-invalid focus", async () => {
    const { container } = await renderNewEventPage();
    fillEverythingElse(container);
    fireEvent.change(screen.getByLabelText("city"), { target: { value: "תל אביב" } });

    submit(container);
    await screen.findByText(T.error_category_required);

    // Not <body>: proves "category" reached EVENT_FIELD_ORDER. EventForm maps
    // field name → element id directly (getElementById(firstInvalid)), so the
    // id IS the key — there is no separate id map to update.
    expect(document.activeElement).toBe(container.querySelector("#category"));
  });

  it("'אחר' is still selectable — only the preselection was removed", async () => {
    const { container } = await renderNewEventPage();

    const other = [...container.querySelectorAll("#category option")].find(
      (o) => o.value === "אחר",
    );
    expect(other).toBeDefined();
    expect(other).not.toBeDisabled();
  });
});

describe("EventForm — the city asterisk is enforced (MEH-2013)", () => {
  it("submitting with an empty city is blocked with a Hebrew error", async () => {
    const { container } = await renderNewEventPage();
    fillEverythingElse(container);
    fireEvent.change(container.querySelector("#category"), { target: { value: "שוק" } });

    submit(container);

    expect(await screen.findByText(T.error_city_required)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/events", expect.anything());
  });

  it("a whitespace-only city does not satisfy the requirement", async () => {
    const { container } = await renderNewEventPage();
    fillEverythingElse(container);
    fireEvent.change(container.querySelector("#category"), { target: { value: "שוק" } });
    fireEvent.change(screen.getByLabelText("city"), { target: { value: "   " } });

    submit(container);

    expect(await screen.findByText(T.error_city_required)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/events", expect.anything());
  });

  it("typing a city clears its error", async () => {
    const { container } = await renderNewEventPage();
    fillEverythingElse(container);
    fireEvent.change(container.querySelector("#category"), { target: { value: "שוק" } });
    submit(container);
    await screen.findByText(T.error_city_required);

    fireEvent.change(screen.getByLabelText("city"), { target: { value: "חיפה" } });

    expect(screen.queryByText(T.error_city_required)).not.toBeInTheDocument();
  });

  it("a complete submit posts a trimmed city and the chosen category", async () => {
    const { container } = await renderNewEventPage();
    fillEverythingElse(container);
    fireEvent.change(container.querySelector("#category"), { target: { value: "שוק" } });
    fireEvent.change(screen.getByLabelText("city"), { target: { value: "  תל אביב  " } });

    submit(container);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/events", expect.anything()),
    );
    const body = api.post.mock.calls.find((c) => c[0] === "/events")[1];
    expect(body.city).toBe("תל אביב");
    expect(body.category).toBe("שוק");
  });
});
