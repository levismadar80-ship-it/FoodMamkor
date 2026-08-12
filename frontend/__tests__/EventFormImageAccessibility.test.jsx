/**
 * MEH-2031 — EventForm's upload control has to be reachable by keyboard, and a
 * successful upload has to be announced.
 *
 * Both defects were found by the different-model CI reviewer on PR #2814 while
 * it was reviewing the SIBLING form (ExperienceForm), which carried the identical
 * markup. They were fixed there under MEH-2012; this file covers the same two
 * properties on EventForm, which is where the markup was copied FROM.
 *
 * 1. `className="hidden"` is Tailwind display:none, which removes the input from
 *    the tab order — and the wrapping <label> is not natively focusable, so the
 *    upload control is unreachable without a mouse (WCAG 2.1.1, Level A).
 * 2. `alt=""` marks the preview decorative. There is no live region on upload
 *    success, so the preview appearing IS the success state; an empty alt tells
 *    a screen-reader user nothing at all.
 *
 * DISCRIMINATION (.claude/rules/testing.md, MEH-1619): measured against
 * origin/staging's EventForm.jsx with everything else held constant — both cases
 * below go red, and they are the only ones that do. Recorded in the PR body.
 *
 * 🔴 HONEST LIMIT, stated rather than glossed: jsdom loads no Tailwind, so
 * `hidden` and `sr-only` compute identically here and `.focus()` succeeds either
 * way. The keyboard case therefore asserts the CLASS CONTRACT — strong enough to
 * discriminate on this change, but NOT evidence about rendered behaviour. The
 * behavioural probe (computed `display`, and `.focus()` actually landing, which a
 * display:none element cannot do) lives in
 * e2e/qa-meh2031-eventform-upload-a11y.mjs, where a stylesheet exists.
 *
 * REUSES: __tests__/EventFormSubmitValidation.test.jsx (harness shape),
 *         __tests__/ExperienceImageUpload.test.jsx (the sibling's cases).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EventForm from "@/components/EventForm";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
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

const T = he.sweep_tail.event_new;
const CLOUD_URL = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/event.jpg";

function renderForm() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EventForm />
    </NextIntlClientProvider>,
  );
}

// EventForm's file input carries no id, so it is addressed by type.
const fileInput = () => document.querySelector('input[type="file"]');
const preview = () => document.querySelector('img[src]:not([src=""])');

/**
 * jsdom will not let you assign `files`, so it is defined on the element. The
 * act() wrapper is load-bearing: handleImageUpload is async, so the state lands
 * in a microtask after the event — without it the assertions read a DOM that has
 * not re-rendered, which presents as a broken feature rather than a test that
 * measured too early.
 */
async function selectFile(input, file = new File(["x"], "cover.jpg", { type: "image/jpeg" })) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    fireEvent.change(input);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MEH-2031 — EventForm upload control accessibility", () => {
  it("the file input stays in the tab order — sr-only, never display:none", () => {
    // `hidden` drops the input out of the tab order and the wrapping <label> is
    // not focusable, so the control becomes mouse-only. See the honest-limit
    // note in the file header for what this assertion does and does not prove.
    renderForm();

    expect(fileInput()).toBeTruthy();
    expect(fileInput().className).toContain("sr-only");
    expect(fileInput().className.split(/\s+/)).not.toContain("hidden");
  });

  it("the wrapper renders a focus ring, so keyboard focus is visible", () => {
    // sr-only alone would make the control reachable but invisibly focused — a
    // sighted keyboard user would tab into nothing. focus-within on the label is
    // the other half of the fix, and asserting it separately means losing either
    // half fails a NAMED case rather than silently halving the fix.
    renderForm();

    const wrapper = fileInput().closest("label");
    expect(wrapper).toBeTruthy();
    expect(wrapper.className).toContain("focus-within:ring-2");
  });

  it("the preview announces itself — a successful upload is not silent to AT", async () => {
    api.post.mockResolvedValueOnce({ data: { url: CLOUD_URL } });
    renderForm();

    await selectFile(fileInput());
    await waitFor(() => expect(preview()).toBeInTheDocument());

    expect(preview()).toHaveAttribute("src", CLOUD_URL);
    expect(preview()).toHaveAttribute("alt", T.image_label);
  });

  it("does not regress the remove control that returns the uploader", async () => {
    // Don't-regress guard, named as one rather than counted as evidence: it is
    // green on BOTH sides. It exists so a future edit to this block cannot
    // quietly drop the remove path while the three cases above stay green.
    api.post.mockResolvedValueOnce({ data: { url: CLOUD_URL } });
    renderForm();

    await selectFile(fileInput());
    await waitFor(() => expect(preview()).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: T.image_remove_aria }));

    expect(preview()).toBeNull();
    expect(fileInput()).toBeTruthy();
  });
});
