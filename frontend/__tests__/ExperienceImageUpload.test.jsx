/**
 * MEH-2012 — the experience image is uploaded, not pasted.
 *
 * `ExperienceForm` was the LAST surface still asking a business owner for a raw
 * Cloudinary URL (`<Input type="url" dir="ltr">` with a
 * `https://res.cloudinary.com/...` placeholder). Every other producer surface —
 * products, avatar, owner photo, kashrut cert, events — already posts to
 * `POST /upload/image`. Nobody outside the team can produce a CDN URL, so the
 * field was effectively "leave this blank".
 *
 * DISCRIMINATION (.claude/rules/testing.md, MEH-1619). Measured against
 * `origin/staging`'s `ExperienceForm.jsx`, with `messages/*.json` left at their
 * NEW values so failures are behavioural rather than missing-key: **8 of 9
 * red**.
 *
 * The ninth — "does not name Cloudinary" — stays green, and the reason is worth
 * naming rather than glossing: that case discriminates on the **copy**, not the
 * component, and the control deliberately held the copy fixed to isolate the
 * component. Run against the old messages it goes red; run against the old
 * component it cannot. It is a real assertion about a real part of this ticket,
 * measured by a different control than the other eight.
 *
 * The reference implementation is `EventForm.jsx` (upload → preview → remove →
 * error). This file asserts the one place the experiences form DEPARTS from it:
 * an inline field error wired to `aria-describedby`, rather than a toast,
 * because this form is the MEH-1809 inline-per-field one.
 *
 * REUSES: __tests__/ExperienceFormSubmitValidation.test.jsx (harness shape).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceForm from "@/components/ExperienceForm";

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

const T = he.experiences.new;
const CLOUD_URL = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/abc.jpg";

function renderForm(props = {}) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ExperienceForm {...props} />
    </NextIntlClientProvider>,
  );
}

const fileInput = () => document.getElementById("experience-image");
const preview = () => document.querySelector('img[src]:not([src=""])');
const submitButton = () => screen.getByRole("button", { name: T.submit_cta });
// By type, not by label: the label CHANGES while an upload is in flight, so a
// name-based query would fail to find the very button whose state is the
// subject — and read as "the button is missing" rather than "it is busy".
const submitEl = () => document.querySelector('button[type="submit"]');

/**
 * Fire a file selection. jsdom will not let you assign `files`, so it is
 * defined on the element — the same shape the browser hands the handler.
 *
 * The `act()` wrapper is load-bearing, not ceremony: `handleImageUpload` is
 * async, so `setUploading(true)` and any error state land in a microtask after
 * the event. Without it the assertions read a DOM that has not re-rendered yet,
 * which shows up as "the button is not disabled" / "the message is not there" —
 * i.e. as a broken feature rather than a test that measured too early. Both of
 * those happened here before this wrapper existed.
 */
async function selectFile(input, file = new File(["x"], "photo.jpg", { type: "image/jpeg" })) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    fireEvent.change(input);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The form's debounced moderation check also uses api.post; default it to a
  // never-settling promise so only the upload assertions below drive state.
  api.post.mockImplementation(() => new Promise(() => {}));
});

describe("MEH-2012 — the image field is an upload, not a URL box", () => {
  it("renders a file input, and no free-text URL box", () => {
    renderForm();

    // The whole defect in one assertion: it used to be type="url".
    expect(fileInput()).toHaveAttribute("type", "file");
    expect(fileInput()).toHaveAttribute("accept", "image/*");
  });

  it("does not name Cloudinary anywhere in the field's copy", () => {
    // The provider leaking into user-facing copy is half of what the ticket is
    // about — an owner cannot act on the name of our CDN.
    renderForm();

    expect(document.body.textContent).not.toMatch(/cloudinary/i);
  });

  it("posts the chosen file as multipart and stores the returned url", async () => {
    api.post.mockResolvedValueOnce({ data: { url: CLOUD_URL } });
    renderForm();

    await selectFile(fileInput());

    const [path, body] = api.post.mock.calls[0];
    expect(path).toBe("/upload/image");
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toBeInstanceOf(File);
    await waitFor(() => expect(preview()).toHaveAttribute("src", CLOUD_URL));
  });

  it("shows a thumbnail preview, and remove clears it back to the upload control", async () => {
    api.post.mockResolvedValueOnce({ data: { url: CLOUD_URL } });
    renderForm();

    await selectFile(fileInput());
    await waitFor(() => expect(preview()).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("experience-image-remove"));

    expect(preview()).toBeNull();
    expect(fileInput()).toHaveAttribute("type", "file");
  });

  it("edit mode seeds the preview from initial.image_url", () => {
    // mode="edit" must not make the owner re-upload an image she already has.
    renderForm({ mode: "edit", initial: { image_url: CLOUD_URL, title: "", description: "" } });

    expect(preview()).toHaveAttribute("src", CLOUD_URL);
  });

  it("a failed upload reports INLINE, not as a toast", async () => {
    // The departure from EventForm, which toasts. This form is the MEH-1809
    // inline-per-field one, so the message belongs where the eye already is.
    api.post.mockRejectedValueOnce({ response: { data: {} } });
    renderForm();

    await selectFile(fileInput());

    await waitFor(() => expect(screen.getByText(T.error_image_upload)).toBeInTheDocument());
    // Wired to the field, not floating: aria-describedby must point at it.
    expect(screen.getByText(T.error_image_upload)).toHaveAttribute(
      "id",
      "experience-image-error",
    );
  });

  it("a failed upload leaves the uploader usable — not stuck mid-upload", async () => {
    // The ticket's "previous image_url preserved" AC is NOT reachable through
    // this UI and no test here pretends otherwise: the field is a ternary —
    // preview-with-remove OR uploader — so a second upload cannot begin until
    // the first image is removed, and by then there is no previous image left
    // to preserve. EventForm has the identical shape. Reported in the PR rather
    // than covered by a test whose setup would have to fake an unreachable
    // state; a case that constructs a state the product cannot produce proves
    // nothing about the product.
    //
    // What IS reachable, and what actually protects the owner, is that a failed
    // attempt does not leave the control dead: `uploading` is cleared in
    // `finally`, and the input's value is reset so the SAME file can be picked
    // again.
    api.post.mockRejectedValueOnce({ response: { data: {} } });
    renderForm();
    await selectFile(fileInput());
    await waitFor(() => expect(screen.getByText(T.error_image_upload)).toBeInTheDocument());

    expect(fileInput()).not.toBeDisabled();
    expect(fileInput()).toHaveValue("");
    expect(submitButton()).not.toBeDisabled();
  });

  it("surfaces the endpoint's own Hebrew detail when it sends one", async () => {
    // upload.py:105 returns a real sentence for the free-plan 3-image cap.
    // Replacing it with our generic string would hide the only actionable part.
    const detail = "אפשר להעלות עד 3 תמונות לבית עסק.";
    api.post.mockRejectedValueOnce({ response: { data: { detail } } });
    renderForm();

    await selectFile(fileInput());

    await waitFor(() => expect(screen.getByText(detail)).toBeInTheDocument());
  });

  it("blocks submit while an upload is in flight", async () => {
    // Don't-regress-shaped but red against the old component too: the old form
    // had no `uploading` state at all, so the button was never gated. Submitting
    // mid-upload would persist the PREVIOUS image_url while the owner watches a
    // new one upload.
    api.post.mockImplementation(() => new Promise(() => {})); // never settles
    renderForm();

    await selectFile(fileInput());

    expect(submitEl()).toBeDisabled();
    // …and it SAYS why. A silently greyed button is the NN/g disabled-control
    // complaint that MEH-2014 PR 1 was opened for on this very codebase.
    expect(submitEl()).toHaveTextContent(T.field_image_uploading);
  });

  // ---- Both findings below come from the CI reviewer on PR #2814 (a different
  // model from the one that wrote the code — the ORDERS §3.2 independent pass).
  // Both were filed as "Minor"; the second is treated here as more than that,
  // because it is a regression THIS diff introduces rather than one it inherits.

  it("no label points at an id that does not exist — including in preview state", async () => {
    // The field-name label was rendered unconditionally with
    // htmlFor="experience-image", but that id only exists in the uploader
    // branch. Once an image is set, the association pointed at nothing — which
    // presents to AT as a labelled control that is not on the page.
    //
    // Asserted as an invariant over EVERY label in the form rather than as a
    // check on this one: a dangling `for` is the defect, and stating it
    // generally means a future field cannot reintroduce it silently.
    api.post.mockResolvedValueOnce({ data: { url: CLOUD_URL } });
    renderForm();

    await selectFile(fileInput());
    await waitFor(() => expect(preview()).toBeInTheDocument());

    const dangling = [...document.querySelectorAll("label[for]")]
      .map((el) => el.getAttribute("for"))
      .filter((id) => document.getElementById(id) === null);
    expect(dangling).toEqual([]);
  });

  it("the file input stays in the tab order — sr-only, never display:none", () => {
    // `className="hidden"` is Tailwind display:none, which takes the input OUT
    // of the tab order. The wrapping <label> is not natively focusable, so the
    // upload control became unreachable by keyboard — and the field this PR
    // replaces was a text <Input>, which was reachable. So this is a WCAG 2.1.1
    // regression introduced by the diff, not inherited from EventForm.
    //
    // 🔴 HONEST LIMIT, stated rather than glossed: jsdom loads no Tailwind, so
    // `hidden` and `sr-only` compute identically here and `.focus()` succeeds
    // either way. This case therefore asserts the CLASS CONTRACT, which is the
    // strongest thing available at this layer — it is red against the old code
    // and green against the new, but it is NOT evidence about rendered
    // behaviour. The behavioural assertion (real Chromium, computed display and
    // a Tab landing on the input) lives in
    // e2e/qa-meh2012-experience-image-upload.mjs, where a stylesheet exists.
    renderForm();

    expect(fileInput().className).toContain("sr-only");
    expect(fileInput().className.split(/\s+/)).not.toContain("hidden");
  });
});
