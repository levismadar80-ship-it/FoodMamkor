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

  // MEH-2012 REPLACED the case that used to sit here — "restores the url-format
  // boundary that noValidate turned off". It is deleted rather than relaxed,
  // because the behaviour it asserted is deliberately gone along with the field
  // it guarded: image_url is no longer typed by anyone, it is whatever
  // POST /upload/image returned. Keeping a softened version would have been the
  // forbidden move (never weaken a test to make it pass); the honest one is to
  // assert the new contract, which is what this case does.
  //
  // The removal is not cosmetic. /upload/image answers with a RELATIVE path
  // when Cloudinary is unconfigured — `/placeholder-image.png?name=…`
  // (upload.py:115) — and the old check ran `new URL(value)`, which throws on a
  // relative path. Had the guard survived the field, the form would have
  // rejected the server's own successful response on every environment without
  // Cloudinary credentials.
  it("no longer type-checks image_url as a URL — the server supplies it now", () => {
    renderForm();

    // The old free-text input is gone; this is the file input that replaced it.
    const imageInput = document.getElementById("experience-image");
    expect(imageInput).toHaveAttribute("type", "file");

    fireEvent.click(submitButton());

    // A URL-format complaint about a field nobody types in would be unfixable.
    //
    // The expected string is INLINE, not `T.error_invalid_url`, and that is the
    // point of a not-present assertion: it has to name the string it is
    // asserting away without depending on the key that carried it. Reading the
    // key here made the test hostage to it — `experiences.new.error_invalid_url`
    // has no production reader once the URL field is gone, so deleting it (as
    // this PR does) would have turned this into `queryByText(undefined)`, which
    // throws a TypeError instead of failing an assertion. A test that errors
    // rather than fails is a test that stopped measuring.
    // (CI reviewer, PR #2814.)
    expect(
      screen.queryByText("הכתובת אינה תקינה — התחילו ב-https://"),
    ).not.toBeInTheDocument();
  });

  it("restores the whole-number boundary on duration (an int server-side)", () => {
    renderForm();

    fireEvent.change(document.getElementById("experience-duration"), { target: { value: "20.5" } });
    fireEvent.click(submitButton());

    expect(screen.getByText(T.error_whole_number)).toBeInTheDocument();
  });

  it("a fractional price is still allowed — price_per_person is a Decimal, not an int", () => {
    renderForm();

    fireEvent.change(document.getElementById("experience-price"), { target: { value: "20.5" } });
    fireEvent.click(submitButton());

    // the price field must NOT be the thing complaining here
    expect(screen.queryByText(T.error_whole_number)).not.toBeInTheDocument();
    expect(screen.queryByText(T.error_price_negative)).not.toBeInTheDocument();
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
    // MEH-2013: city + location_type are now required, so "fully valid" means
    // filling them too. Their own coverage lives in
    // ExperienceFormRequiredFields.test.jsx; here they are only fixture.
    fireEvent.click(screen.getByRole("button", { name: T.location_home }));
    fireEvent.change(document.getElementById("experience-city"), {
      target: { value: "תל אביב" },
    });
    fireEvent.click(submitButton());

    expect(api.post).toHaveBeenCalledWith(
      "/experiences",
      expect.objectContaining({ title: "סדנת גבינות", event_date: "2026-09-01" }),
    );
  });
});
