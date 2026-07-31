/**
 * MEH-1809 — EventForm submit validation.
 *
 * Before this change the form had NO client-side validation: `required` / `min`
 * attributes handed the job to the browser, which jsdom does not enforce on a
 * programmatic submit at all. So against the old component the submit went
 * straight through and `api.post` was called with an empty title — which is what
 * these assertions catch. Each one reds on the old file:
 *   - no message existed to find (the banner held server errors only)
 *   - focus() was never called
 *   - the request was NOT blocked
 *
 * REUSES: __tests__/ProductsSectionSubmitValidation.test.jsx (harness shape).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EventForm from "@/components/EventForm";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

// Both are autocomplete widgets with their own network paths — irrelevant here,
// and neither field is under validation. Reduced to plain inputs.
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const T = he.sweep_tail.event_new;

function renderForm() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EventForm />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EventForm — submit validation (MEH-1809)", () => {
  it("empty submit shows the title AND date errors together and blocks the request", () => {
    renderForm();

    fireEvent.click(screen.getByText(T.submit));

    expect(screen.getByText(T.error_title_required)).toBeInTheDocument();
    expect(screen.getByText(T.error_date_required)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("empty submit moves focus to the first invalid field (title)", () => {
    renderForm();

    fireEvent.click(screen.getByText(T.submit));

    expect(document.activeElement).toBe(document.getElementById("title"));
  });

  it("the title error is wired to the title input, not to a detached banner", () => {
    renderForm();

    fireEvent.click(screen.getByText(T.submit));

    const title = document.getElementById("title");
    expect(title).toHaveAttribute("aria-invalid", "true");
    const describedBy = title.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy)).toHaveTextContent(T.error_title_required);
  });

  it("out-of-range price and participants are caught alongside the required fields", () => {
    renderForm();

    fireEvent.change(document.getElementById("price"), { target: { value: "-5" } });
    fireEvent.change(document.getElementById("max_participants"), { target: { value: "0" } });
    fireEvent.click(screen.getByText(T.submit));

    // all four at once — the browser would have stopped at the first
    expect(screen.getByText(T.error_title_required)).toBeInTheDocument();
    expect(screen.getByText(T.error_date_required)).toBeInTheDocument();
    expect(screen.getByText(T.error_price_negative)).toBeInTheDocument();
    expect(screen.getByText(T.error_max_participants_min)).toBeInTheDocument();
  });

  it("fixing the title clears only its own error", () => {
    renderForm();

    fireEvent.click(screen.getByText(T.submit));
    fireEvent.change(document.getElementById("title"), { target: { value: "יום פתוח" } });

    expect(screen.queryByText(T.error_title_required)).not.toBeInTheDocument();
    expect(screen.getByText(T.error_date_required)).toBeInTheDocument();
  });

  it("a fully valid submit passes validation and posts", () => {
    renderForm();
    api.post.mockResolvedValue({ data: { id: 3 } });

    fireEvent.change(document.getElementById("title"), { target: { value: "יום פתוח" } });
    fireEvent.change(document.getElementById("event_date"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByText(T.submit));

    expect(api.post).toHaveBeenCalledWith(
      "/events",
      expect.objectContaining({ title: "יום פתוח", event_date: "2026-09-01" }),
    );
  });
});
