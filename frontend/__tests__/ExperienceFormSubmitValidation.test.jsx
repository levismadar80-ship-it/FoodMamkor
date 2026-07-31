/**
 * MEH-1809 — ExperienceForm submit validation.
 *
 * The old `submit` was a chain of `return setServerError(...)` calls, so exactly
 * one message reached the screen per submit and it landed in the banner at the
 * top of the form. Each assertion below reds against that shape:
 *   - asserting title AND description AND date simultaneously (old: only title)
 *   - asserting focus (old: never called)
 *   - asserting the message is wired to the field (old: detached banner)
 *   - asserting the duration/price/participant bounds produce messages at all
 *     (old: native attributes only, unenforced on a programmatic submit)
 *
 * REUSES: __tests__/EventFormSubmitValidation.test.jsx (harness shape).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceForm from "@/components/ExperienceForm";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(() => new Promise(() => {})), put: vi.fn() },
}));

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

const T = he.experiences.new;

function renderForm() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ExperienceForm />
    </NextIntlClientProvider>,
  );
}

const submitButton = () => screen.getByRole("button", { name: T.submit_cta });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ExperienceForm — submit validation (MEH-1809)", () => {
  it("empty submit shows title, description AND date errors together", () => {
    renderForm();

    fireEvent.click(submitButton());

    expect(screen.getByText(T.error_title_short)).toBeInTheDocument();
    expect(screen.getByText(T.error_description_short)).toBeInTheDocument();
    expect(screen.getByText(T.error_date_required)).toBeInTheDocument();
    // /experiences was never called (the debounced /experiences/validate is a
    // different path and is mocked to a never-settling promise)
    expect(api.post).not.toHaveBeenCalledWith("/experiences", expect.anything());
  });

  it("empty submit moves focus to the first invalid field (title)", () => {
    renderForm();

    fireEvent.click(submitButton());

    expect(document.activeElement).toBe(document.getElementById("experience-title"));
  });

  it("the title error is wired to the title input, not to a detached banner", () => {
    renderForm();

    fireEvent.click(submitButton());

    const title = document.getElementById("experience-title");
    expect(title).toHaveAttribute("aria-invalid", "true");
    const describedBy = title.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy)).toHaveTextContent(T.error_title_short);
  });

  it("the description error renders on the textarea, which ui/Input cannot host", () => {
    renderForm();

    fireEvent.click(submitButton());

    const description = document.getElementById("experience-description");
    expect(description.tagName).toBe("TEXTAREA");
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("experience-description-error")).toHaveTextContent(
      T.error_description_short,
    );
  });

  it("range bounds that used to live only in native attributes are enforced", () => {
    renderForm();

    fireEvent.change(document.getElementById("experience-duration"), { target: { value: "5" } });
    fireEvent.change(document.getElementById("experience-price"), { target: { value: "-1" } });
    fireEvent.change(document.getElementById("experience-max-participants"), {
      target: { value: "0" },
    });
    fireEvent.click(submitButton());

    expect(screen.getByText(T.error_duration_range)).toBeInTheDocument();
    expect(screen.getByText(T.error_price_negative)).toBeInTheDocument();
    expect(screen.getByText(T.error_max_participants_min)).toBeInTheDocument();
  });

  it("fixing the title clears only its own error", () => {
    renderForm();

    fireEvent.click(submitButton());
    fireEvent.change(document.getElementById("experience-title"), {
      target: { value: "סדנת גבינות" },
    });

    expect(screen.queryByText(T.error_title_short)).not.toBeInTheDocument();
    expect(screen.getByText(T.error_date_required)).toBeInTheDocument();
  });

  it("a fully valid submit passes validation and posts", () => {
    renderForm();

    fireEvent.change(document.getElementById("experience-title"), {
      target: { value: "סדנת גבינות" },
    });
    fireEvent.change(document.getElementById("experience-description"), {
      target: { value: "סדנה בת שלוש שעות להכנת גבינות עיזים מחלב טרי מהרפת שלנו" },
    });
    fireEvent.change(document.getElementById("experience-date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(submitButton());

    expect(api.post).toHaveBeenCalledWith(
      "/experiences",
      expect.objectContaining({ title: "סדנת גבינות", event_date: "2026-09-01" }),
    );
  });
});
