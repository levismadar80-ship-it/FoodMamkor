/**
 * MEH-3751 — «יש לכם מודעה על האירוע?» on the event form, and the «?» on its
 * eleven fields. The draft states are a matrix: box closed / open × a draft
 * with no field / one field / many fields; plus a draft over a saved point.
 *
 * REUSES: __tests__/RecipeFormAiFill.test.jsx (MEH-3740, same box and «?»)
 * and __tests__/CitySearchErrorAssociation.test.jsx (EventForm harness).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import EventForm from "@/components/EventForm";
import { applyEventDraft } from "@/lib/event-draft";
import { timeValue } from "./helpers/time-of-day";

// Config shape, not behaviour: the field map is the backend's and nothing in
// the frontend runs it, so its keys are read as data (testing.md MEH-3531).
const MAP = JSON.parse(
  readFileSync(resolve(__dirname, "../../backend/app/data/form_maps/event.json"), "utf8"),
);
const KEYS = MAP.fields.map((f) => f.key);
const EF = he.events.form;
const PF = he.page_fill;
const POST = "שוק איכרים ביום שישי 27.11 בשעה 09:00 בכיכר המושבה, זכרון יעקב.";

const apiMock = vi.hoisted(() => {
  const state = { locations: [], fill: null, fillError: null };
  return {
    state,
    get: vi.fn((url) => Promise.resolve({ data: url === "/producers/me/locations" ? state.locations : [] })),
    post: vi.fn((url) => {
      if (url.startsWith("/producers/me/ai-fill/")) {
        return state.fillError ? Promise.reject(state.fillError) : Promise.resolve({ data: state.fill });
      }
      return Promise.resolve({ data: { id: "e-new" } });
    }),
    put: vi.fn(() => Promise.resolve({ data: { id: "e1" } })),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/UnverifiedEmailNotice", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const EMPTY = Object.fromEntries(KEYS.filter((k) => k !== "image_url").map((k) => [k, null]));
const FULL = {
  title: "שוק איכרים בזכרון",
  description: "דוכנים של חקלאים מהאזור.",
  category: "שוק",
  event_date: "2026-11-27",
  event_time: "09:00",
  end_time: "13:00",
  location: "כיכר המושבה",
  city: "זכרון יעקב",
  price: 0,
  max_participants: 40,
};

function renderForm(props = {}) {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EventForm onSuccess={() => {}} {...props} />
    </NextIntlClientProvider>,
  );
}

const field = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

async function fillFrom(draft) {
  apiMock.state.fill = { form: "event", draft };
  fireEvent.click(screen.getByTestId("form-fill-event-toggle"));
  fireEvent.change(screen.getByTestId("form-fill-event-text"), { target: { value: POST } });
  fireEvent.click(screen.getByTestId("form-fill-event-read"));
  await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/producers/me/ai-fill/event", { text: POST }));
}

beforeEach(() => {
  apiMock.state.locations = [];
  apiMock.state.fill = null;
  apiMock.state.fillError = null;
  apiMock.post.mockClear();
});

describe("the «?» on every event field (MEH-3751)", () => {
  it("has help text in he and en for exactly the map's keys", () => {
    expect(Object.keys(EF.help).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(en.events.form.help).sort()).toEqual([...KEYS].sort());
  });

  it("opens each field's own text with no server call", () => {
    renderForm();
    apiMock.post.mockClear();
    for (const key of KEYS) {
      const button = screen.getByTestId(`event-help-${key}`);
      expect(button).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(button.getAttribute("aria-controls"))).toHaveTextContent(EF.help[key]);
    }
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("keeps every field's visible label tied to its control", () => {
    renderForm();
    const T = he.sweep_tail.event_new;
    const labels = {
      title: T.field_title_label,
      description: T.field_description_label,
      category: T.field_category_label,
      event_date: T.field_date_label,
      event_time: T.field_time_label,
      end_time: T.field_end_time_label,
      location: T.field_location_label,
      city: T.field_city_label,
      price: T.field_price_label_full,
      max_participants: T.field_max_participants_label_full,
    };
    expect(Object.keys(labels).sort()).toEqual(KEYS.filter((k) => k !== "image_url").sort());
    for (const [id, text] of Object.entries(labels)) {
      // CitySearch also carries its own sr-only label, hence getAll.
      const controls = screen.getAllByLabelText(new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), { selector: "input,textarea,select" });
      expect(controls, id).toContain(field(id));
    }
  });
});

describe("«יש לכם מודעה על האירוע?» (MEH-3751)", () => {
  it("is closed in create mode and absent in edit mode", () => {
    renderForm();
    expect(screen.getByText(EF.fill.title)).toBeInTheDocument();
    expect(screen.getByTestId("form-fill-event-text")).not.toBeVisible();
  });

  it("is not offered when editing an event", () => {
    renderForm({ mode: "edit", initial: { id: "e1", title: "קיים", event_date: "2026-12-01", city: "חיפה" } });
    expect(screen.queryByTestId("form-fill-event")).not.toBeInTheDocument();
  });

  it("fills many fields from one post", async () => {
    renderForm();
    await fillFrom(FULL);
    await waitFor(() => expect(field("title").value).toBe(FULL.title));
    expect(screen.getByTestId("form-fill-event-text")).not.toBeVisible(); // the box closes again
    expect(field("description").value).toBe(FULL.description);
    expect(field("category").value).toBe("שוק");
    expect(field("event_date").value).toBe("2026-11-27");
    expect([timeValue(field("event_time").closest("[data-time-value]")), timeValue(field("end_time").closest("[data-time-value]"))]).toEqual(["09:00", "13:00"]);
    expect(field("location").value).toBe("כיכר המושבה");
    expect(field("city").value).toBe("זכרון יעקב");
    expect([field("price").value, field("max_participants").value]).toEqual(["0", "40"]);
  });

  it("fills one field and leaves what the owner typed", async () => {
    renderForm();
    fireEvent.change(field("title"), { target: { value: "השם שלי" } });
    await fillFrom({ ...EMPTY, event_time: "10:30" });
    await waitFor(() => expect(timeValue(field("event_time").closest("[data-time-value]"))).toBe("10:30"));
    expect(field("title").value).toBe("השם שלי");
  });

  it("clears the errors of the fields it filled, and only those", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: he.sweep_tail.event_new.submit }));
    await waitFor(() => expect(field("title")).toHaveAttribute("aria-invalid", "true"));
    expect(document.getElementById("city-error")).toBeInTheDocument();
    await fillFrom({ ...EMPTY, title: "שוק איכרים" });
    await waitFor(() => expect(field("title").value).toBe("שוק איכרים"));
    expect(field("title")).not.toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("city-error")).toBeInTheDocument();
    expect(document.getElementById("category-error")).toBeInTheDocument();
  });

  it("says so when the post filled nothing, and keeps the text", async () => {
    renderForm();
    await fillFrom(EMPTY);
    expect(await screen.findByText(PF.empty)).toBeInTheDocument();
    expect(screen.getByTestId("form-fill-event-text")).toHaveValue(POST);
  });

  it("shows the failure and leaves the form as it was", async () => {
    apiMock.state.fillError = { response: { status: 503, data: { detail: "לא הצלחנו לקרוא את הטקסט כרגע. אפשר למלא את הפרטים ידנית." } } };
    renderForm();
    await fillFrom(FULL);
    expect(await screen.findByText("לא הצלחנו לקרוא את הטקסט כרגע. אפשר למלא את הפרטים ידנית.")).toBeInTheDocument();
    expect(field("title").value).toBe("");
  });

  it("moves a picked saved point to «כתובת אחרת» when the post brings an address", async () => {
    apiMock.state.locations = [{ id: "L1", label: "הדוכן", address: "רחוב הגפן 1", city: "חיפה", lat: 32.8, lng: 35 }];
    renderForm();
    fireEvent.click(await screen.findByTestId("event-saved-location-L1"));
    await fillFrom({ ...EMPTY, location: "כיכר המושבה" });
    await waitFor(() => expect(field("location").value).toBe("כיכר המושבה"));
    expect(screen.getByTestId("event-saved-location-other")).toBeChecked();
  });
});

describe("applyEventDraft (MEH-3751)", () => {
  const form = { title: "", category: "", price: 0, location: "רחוב הגפן 1", city: "חיפה", lat: 32.8, lng: 35 };

  it("drops a category off the list and clears the pin of a replaced address", () => {
    const next = applyEventDraft(form, { category: "סדנה", location: "כיכר המושבה" });
    expect(next.category).toBe("");
    expect(next.location).toBe("כיכר המושבה");
    expect([next.lat, next.lng]).toEqual([null, null]);
  });

  it("keeps the pin when the draft does not touch the address", () => {
    const next = applyEventDraft(form, { title: "שוק", price: 25 });
    expect([next.title, next.price]).toEqual(["שוק", "25"]);
    expect([next.lat, next.lng]).toEqual([32.8, 35]);
  });
});
