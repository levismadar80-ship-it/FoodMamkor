import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import RegisterProducerClient from "@/app/[locale]/register/producer/RegisterProducerClient";
import api from "@/lib/api";

/**
 * MEH-1838 chunk B — the delivery axis on producer registration,
 * as MEH-2640 reshaped it.
 *
 * MEH-2640 REPLACED the four controls (two checkboxes, a nationwide toggle and
 * a city picker) with ONE required radio: מגיעים אלינו / משלוחים / גם וגם. The
 * nationwide flag and the city list are no longer collected at registration at
 * all — the dashboard owns delivery areas (dashboard/edit/cards.jsx:1572,
 * covered by EditTabDeliveryCard.test.jsx), and ProducerRegister defaults both
 * (schemas.py:959-960).
 *
 * So the cells that asserted nationwide/city-list payload shapes and the
 * "delivery with neither nationwide nor cities" gate are gone with the
 * controls they drove. What survives, and is what this file now pins, is the
 * part that still exists and still matters: the ONE question maps to the right
 * pair of booleans in the POST body, and it is required.
 *
 * Chunk A (#2959) added the four fields to `ProducerRegister`
 * (schemas.py:701-704). The form never sent them, and **Pydantic drops unknown
 * fields silently** — so the request returned 200, the seller saw success, and
 * every business landed on the same default shape. That is the failure mode
 * this file is built against: a green happy-path test proves nothing here,
 * because the happy path was already green while the feature did not exist.
 *
 * So the load-bearing assertions read the **POST body** (`api.post.mock.calls`)
 * rather than the rendered form or the response. Delete the payload block in
 * `handleSubmit` and every one of them goes red; delete the UI and the gate
 * tests go red. Neither can pass against a form that captures nothing.
 */

// next-intl unscoped in the component, so t(key) returns the literal key path.
// NOTE this is exactly why the i18n block at the bottom of this file reads the
// real JSON instead: under this mock a MISSING key is indistinguishable from a
// present one, so the mock can never catch the wrong-namespace trap.
// MEH-2200: `.rich` added for the collection notice on the STORY frame, which
// this file walks through. Plain-string lookups are unchanged.
// MEH-3074: the STORY-step preview mounts the real ProducerCard, which this
// file's mocks do not feed; its wiring is covered in RegisterProducerClient.test.jsx.
vi.mock("@/components/RegisterCardPreview", () => ({ default: () => null }));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => {
    const t = (key, values) => {
      const p = scope ? `${scope}.${key}` : key;
      return values ? `${p} ${Object.values(values).join(" ")}` : p;
    };
    t.rich = (key, tags = {}) => {
      const p = scope ? `${scope}.${key}` : key;
      return [
        p,
        ...Object.entries(tags).map(([name, render]) => (
          <span key={name}>{render(name)}</span>
        )),
      ];
    };
    return t;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const refreshUser = vi.fn();
const authState = { user: null, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading, refreshUser }),
}));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

vi.mock("@/components/CitySearch", () => ({
  // MEH-2241 chunk B: the wizard gates DETAILS→CATEGORY on CitySearch's
  // `{ known }` verdict (chunk A contract), so a one-argument emit now reads
  // as an unknown town and blocks the advance. This file's subject is not
  // the city gate — every town it types is vouched for.
  default: ({ value, onChange, id }) => (
    <input data-testid="city" id={id} value={value || ""} onChange={(e) => onChange(e.target.value, { known: true })} />
  ),
}));

vi.mock("@/components/CategorySelector", () => ({
  default: ({ onChange }) => (
    <button type="button" data-testid="pick-category" onClick={() => onChange(1)}>
      category
    </button>
  ),
}));

vi.mock("@/components/ProducerOAuthButtons", () => ({ default: () => <div data-testid="oauth" /> }));

vi.mock("@/components/MiniMap", () => ({ default: () => <div data-testid="mini-map" /> }));

vi.mock("@/components/AddressSearch", () => ({
  default: ({ value, onChange, inputTestId, id, placeholder }) => (
    <input
      id={id}
      data-testid={inputTestId}
      placeholder={placeholder}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// CitiesAutocomplete stub — the real component owns its own tests. Two distinct
// buttons so a test can prove the list is carried through as DATA (two cities,
// in order) rather than merely "something non-empty was set".
vi.mock("@/components/CitiesAutocomplete", () => ({
  default: ({ value, onChange }) => (
    <div>
      <span data-testid="cities-value">{(value || []).join("|")}</span>
      <button type="button" data-testid="add-city" onClick={() => onChange(["חיפה"])}>
        add
      </button>
      <button
        type="button"
        data-testid="add-two-cities"
        onClick={() => onChange(["חיפה", "זכרון יעקב"])}
      >
        add two
      </button>
    </div>
  ),
}));

const K = "auth.register.producer";
const ph = (key) => screen.getByPlaceholderText(`${K}.fields.${key}`);
const nextBtn = () => screen.getByText(`${K}.actions.next`);

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [{ id: 1, name: "ביצים" }] });
  api.post.mockResolvedValue({ data: {} });
  authState.user = null;
  refreshUser.mockReset();
  try {
    localStorage.clear();
  } catch {
    /* jsdom */
  }
});

async function renderWizard() {
  render(<RegisterProducerClient />);
  fireEvent.click(await screen.findByTestId("register-preflight-start"));
}

async function fillAccountToDetails() {
  fireEvent.change(ph("name"), { target: { value: "טסט" } });
  fireEvent.change(ph("email"), { target: { value: "t@example.com" } });
  fireEvent.change(ph("password"), { target: { value: "Abcdefgh1234" } });
  fireEvent.click(nextBtn());
  await screen.findByText(`${K}.steps.business.title`);
}

// Fills the DETAILS required fields but does NOT advance — so each test below
// can set the axis itself and then decide whether the advance should succeed.
function fillDetailsFields() {
  fireEvent.change(ph("producer_name"), { target: { value: "העסק שלי" } });
  fireEvent.change(ph("phone"), { target: { value: "0501234567" } });
  fireEvent.change(screen.getByTestId("city"), { target: { value: "תל אביב" } });
}

// DETAILS → CATEGORY → STORY → submit. Assumes the axis is already valid.
async function advanceAndSubmit() {
  fireEvent.click(nextBtn()); // → CATEGORY
  fireEvent.click(await screen.findByTestId("pick-category"));
  fireEvent.click(nextBtn()); // → STORY
  await screen.findByPlaceholderText(`${K}.fields.tagline_placeholder`);
  fireEvent.change(screen.getByTestId("register-referral-source"), {
    target: { value: "instagram" },
  });
  screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
  fireEvent.click(screen.getByText(`${K}.actions.submit`));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  return api.post.mock.calls[0][1];
}

describe("MEH-2640 — one question, the right two booleans in the POST body", () => {
  // Still reading the POST body rather than the form, for MEH-1838's original
  // reason: Pydantic drops unknown fields silently, so a form that captures
  // nothing still returns 200. A rendered radio proves nothing on its own.
  it.each([
    ["onsite", { has_physical_location: true, offers_delivery: false }],
    ["delivery", { has_physical_location: false, offers_delivery: true }],
    ["both", { has_physical_location: true, offers_delivery: true }],
  ])("«%s» posts the matching pair", async (option, expected) => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId(`register-fulfilment-${option}`));
    const body = await advanceAndSubmit();
    expect(body).toMatchObject(expected);
  });

  it("posts no delivery_nationwide and no delivery_cities — the dashboard owns those", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId("register-fulfilment-delivery"));
    const body = await advanceAndSubmit();
    // Explicitly absent, not merely falsy: sending `false`/`[]` from here
    // would re-create the registration-time ownership this ticket removed.
    expect(body).not.toHaveProperty("delivery_nationwide");
    expect(body).not.toHaveProperty("delivery_cities");
  });

  it("the three options are mutually exclusive — the last pick wins", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(screen.getByTestId("register-fulfilment-delivery"));
    fireEvent.click(screen.getByTestId("register-fulfilment-onsite"));
    const body = await advanceAndSubmit();
    expect(body).toMatchObject({ has_physical_location: true, offers_delivery: false });
  });
});

describe("MEH-2640 — the question is required, and the gate can actually fire", () => {
  it("unanswered → the advance is BLOCKED with «בחרו אפשרות אחת»", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(nextBtn());
    // This is the cell the first implementation could never have failed: the
    // form's defaults (has_physical_location:true + offers_delivery:false)
    // already spell "onsite", so a value DERIVED from them is never empty and
    // the radio arrives pre-lit. The answer is stored separately for exactly
    // this reason.
    expect(screen.getByTestId("register-frame-details")).toBeInTheDocument();
    expect(screen.queryByTestId("register-frame-category")).not.toBeInTheDocument();
    expect(screen.getByTestId("register-fulfilment-error")).toHaveTextContent(
      `${K}.fields.fulfilment.required`,
    );
  });

  it("no radio is pre-selected before she answers", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    for (const option of ["onsite", "delivery", "both"]) {
      expect(screen.getByTestId(`register-fulfilment-${option}`)).not.toBeChecked();
    }
  });

  it("answering clears the error and lets her through", async () => {
    await renderWizard();
    await fillAccountToDetails();
    fillDetailsFields();
    fireEvent.click(nextBtn());
    expect(screen.getByTestId("register-fulfilment-error")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("register-fulfilment-both"));
    expect(screen.queryByTestId("register-fulfilment-error")).toBeNull();
    fireEvent.click(nextBtn());
    expect(await screen.findByTestId("register-frame-category")).toBeInTheDocument();
  });

  it("step 2 no longer renders the four controls it replaced", async () => {
    await renderWizard();
    await fillAccountToDetails();
    for (const gone of [
      "register-delivery-axis",
      "register-has-physical-location",
      "register-offers-delivery",
      "register-delivery-nationwide",
      "register-delivery-cities",
      "register-multi-location-toggle",
      "register-organizer-option",
      "register-details-address",
    ]) {
      expect(screen.queryByTestId(gone), gone).toBeNull();
    }
    // …and the pointer to where delivery areas now live IS there.
    expect(screen.getByTestId("register-delivery-note")).toHaveTextContent(
      `${K}.fields.fulfilment.areas_note`,
    );
  });
});
