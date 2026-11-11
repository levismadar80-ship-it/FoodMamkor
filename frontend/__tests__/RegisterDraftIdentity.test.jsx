/**
 * MEH-2915 — the registration draft stops carrying the person.
 *
 * The draft exists so a seller who wanders off can pick the wizard back up,
 * scoped to the person who wrote it. It does not need her email, her own name,
 * her phone or an address to do that: the business name, city, categories and
 * story are what make resuming worth offering, so those are what it keeps.
 *
 * Both directions matter and the read direction is the load-bearing one:
 * drafts written before this change are already on disk with those fields in
 * them, so a change that only stops WRITING them leaves every one of them
 * exactly as it was.
 *
 * Shown failing against the pre-change code (MEH-1619):
 *   · "drops the four identity fields"          — they were all written
 *   · "strips identity out of a draft already"  — they were all restored
 *   · "an untouched form is not content"        — `kind` made it always true
 *   · "logout drops the draft"                  — logout never touched the key
 * The "keeps" case is green in both directions on purpose: it is what fails
 * if the omission list grows past what was agreed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DRAFT_KEY,
  DRAFT_OMITTED_FIELDS,
  NON_CONTENT_FIELDS,
  hasDraftContent,
  packDraft,
  parseDraft,
} from "../lib/register-draft";

const T0 = 1_760_000_000_000;

/**
 * The shape the component actually writes — every key of its EMPTY_FORM, with
 * the defaults it ships. The drift test below reads the real file and asserts
 * this copy has exactly the same key set, so it cannot quietly fall behind.
 */
const EMPTY_FORM = {
  email: "", name: "", password: "",
  producer_name: "", description: "", phone: "",
  city: "", address: "",
  city_known: false,
  lat: null, lng: null,
  address_city: "",
  short_description: "",
  category_ids: [],
  producer_license_number: "",
  referral_source: "",
  referral_source_other: "",
  kind: "producer",
  fulfilment: "",
};

const FILLED = {
  ...EMPTY_FORM,
  email: "dana@example.com",
  name: "דנה לוי",
  password: "changeme-placeholder",
  phone: "0501234567",
  address: "הרצל 1, זכרון יעקב",
  lat: 32.57, lng: 34.95,
  address_city: "זכרון יעקב",
  producer_name: "הבית של דנה",
  city: "זכרון יעקב",
  city_known: true,
  short_description: "לחם מחמצת",
  description: "אופה מחמצת כבר עשור",
  category_ids: [3],
  fulfilment: "onsite",
};

describe("MEH-2915 · the draft stops carrying the person", () => {
  it("drops the four identity fields on write", () => {
    const stored = parseDraft(packDraft(FILLED, 2, T0), T0).form;
    for (const field of ["email", "name", "phone", "address", "lat", "lng", "address_city"]) {
      expect(stored[field], `${field} must not reach localStorage`).toBeUndefined();
    }
    expect(stored.password, "password, as before MEH-2915").toBeUndefined();
  });

  it("the stored STRING never contains an identifying value", () => {
    // `stored[field] === undefined` above proves the keys are gone. This proves
    // the values are, which is what a reader of the device sees — and it is
    // what catches a future bug that serialized them under a different key.
    const raw = packDraft(FILLED, 2, T0);
    for (const value of [
      "dana@example.com",
      "דנה לוי",
      "0501234567",
      "הרצל 1, זכרון יעקב",
      "changeme-placeholder",
    ]) {
      expect(raw, `${value} must not appear in the stored string`).not.toContain(value);
    }
    expect(raw, "control: the business half IS there").toContain("הבית של דנה");
  });

  it("keeps what makes a resume worth offering", () => {
    const stored = parseDraft(packDraft(FILLED, 2, T0), T0).form;
    expect(stored.producer_name).toBe("הבית של דנה");
    expect(stored.city).toBe("זכרון יעקב");
    expect(stored.city_known).toBe(true);
    expect(stored.category_ids).toEqual([3]);
    expect(stored.short_description).toBe("לחם מחמצת");
    expect(stored.description).toBe("אופה מחמצת כבר עשור");
    expect(stored.fulfilment).toBe("onsite");
  });

  it("strips identity out of a draft already on disk, not just new writes", () => {
    // Exactly what the shipped code wrote: the envelope, with identity in it.
    const legacy = JSON.stringify({
      v: 2,
      savedAt: T0,
      step: 2,
      form: { ...FILLED, password: undefined },
    });
    const restored = parseDraft(legacy, T0).form;
    for (const field of ["email", "name", "phone", "address", "lat", "lng", "address_city"]) {
      expect(restored[field], `${field} must not be handed back`).toBeUndefined();
    }
    expect(restored.producer_name, "and the business half survives").toBe("הבית של דנה");
  });

  it("strips identity out of a PRE-envelope draft too", () => {
    const bare = JSON.stringify({ ...FILLED, password: undefined });
    const restored = parseDraft(bare, T0);
    expect(restored.restamp).toBe(true);
    expect(restored.form.email).toBeUndefined();
    expect(restored.form.phone).toBeUndefined();
    expect(restored.form.producer_name).toBe("הבית של דנה");
  });

  it("an untouched form is not content — `kind` is set by the route, not typed", () => {
    expect(hasDraftContent(EMPTY_FORM)).toBe(false);
    // An organizer's untouched form, same reasoning.
    expect(hasDraftContent({ ...EMPTY_FORM, kind: "organizer" })).toBe(false);
  });

  it("…and a form the seller touched still is", () => {
    expect(hasDraftContent({ ...EMPTY_FORM, producer_name: "משק" })).toBe(true);
    expect(hasDraftContent({ ...EMPTY_FORM, city: "זכרון יעקב" })).toBe(true);
    expect(hasDraftContent({ ...EMPTY_FORM, category_ids: [3] })).toBe(true);
  });

  /**
   * MEH-1909: the cases above run against a copy of EMPTY_FORM. This one is
   * anchored to the real file, and it runs in BOTH directions.
   *
   * The forward direction (every listed field is a real key) catches a rename
   * or removal that would leave a list naming something that no longer exists.
   * The inverse direction (every real key is listed somewhere) is the one that
   * catches the realistic drift: a NEW field added to EMPTY_FORM is mirrored
   * to localStorage by `setAndSave` on the very first keystroke, so a new
   * identity field would be persisted by default and no forward-only check
   * could see it. A one-directional version of this test was measured passing
   * against exactly that case during review.
   */
  const DRAFT_KEPT_FIELDS = [
    // Approved as worth resuming: the business, not the person.
    "producer_name",
    "description",
    "short_description",
    "city",
    "city_known",
    "category_ids",
    "fulfilment",
    // Business attributes collected by the wizard, not personal identifiers.
    "producer_license_number",
    "referral_source",
    "referral_source_other",
    // Set by the route, never typed — see NON_CONTENT_FIELDS.
    "kind",
  ];

  it("every EMPTY_FORM key is either omitted from the draft or explicitly kept", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      path.join(here, "../app/[locale]/register/producer/RegisterProducerClient.jsx"),
      "utf8",
    );
    const start = src.indexOf("const EMPTY_FORM = {");
    expect(start, "EMPTY_FORM must still be declared there").toBeGreaterThan(-1);
    const end = src.indexOf("\n};", start);
    const block = src
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const keys = new Set([...block.matchAll(/(\w+)\s*:/g)].map((m) => m[1]));
    keys.delete("EMPTY_FORM");

    // The control: a key we know is there, and one we know is not. Without it
    // a regex that matched nothing would make every assertion below vacuous.
    expect(keys.has("producer_name")).toBe(true);
    expect(keys.has("definitely_not_a_field")).toBe(false);

    // Forward: nothing is listed that is not a real field.
    for (const field of DRAFT_OMITTED_FIELDS) {
      expect(keys.has(field), `${field} is listed as omitted but is not a form field`).toBe(true);
    }
    for (const field of NON_CONTENT_FIELDS) {
      expect(keys.has(field), `${field} is listed as non-content but is not a form field`).toBe(true);
    }

    // Inverse: nothing real is unaccounted for. A new field forces a decision
    // here — persisted on purpose, or omitted — rather than being persisted by
    // default because `setAndSave` mirrors the whole form.
    const accounted = new Set([...DRAFT_OMITTED_FIELDS, ...DRAFT_KEPT_FIELDS]);
    const unaccounted = [...keys].filter((k) => !accounted.has(k));
    expect(
      unaccounted,
      "a new EMPTY_FORM field is persisted to localStorage on the first keystroke — " +
        "add it to DRAFT_OMITTED_FIELDS, or to DRAFT_KEPT_FIELDS in this test if it " +
        "is a business attribute that belongs in a resumable draft",
    ).toEqual([]);

    // And the local EMPTY_FORM copy this file asserts against is the same set,
    // so the cases above cannot drift away from the component in silence.
    expect([...keys].sort()).toEqual(Object.keys(EMPTY_FORM).sort());
  });
});

// ---------------------------------------------------------------- logout
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));

const apiGet = vi.fn(() => Promise.resolve({ data: { id: 1, name: "דנה" } }));
vi.mock("../lib/api.js", () => ({
  default: {
    get: (...a) => apiGet(...a),
    patch: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));
vi.mock("../lib/favorites-cache.js", () => ({
  ensureFavoritesLoaded: vi.fn(),
  resetFavoritesCache: vi.fn(),
  setFavoritedLocal: vi.fn(),
}));
vi.mock("../lib/post-login-action.js", () => ({
  readPendingAction: vi.fn(() => null),
  clearPendingAction: vi.fn(),
}));
vi.mock("../lib/toast.js", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});

const { AuthProvider, useAuth } = await import("../lib/auth-context.js");

function LogoutProbe() {
  const { logout, deleteAccount, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <>
      <button data-testid="logout" onClick={logout}>
        logout
      </button>
      <button data-testid="delete-account" onClick={deleteAccount}>
        delete
      </button>
    </>
  );
}

describe("MEH-2915 · logout drops the draft", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("removes the stored draft when the seller signs out", async () => {
    localStorage.setItem("token", "t");
    localStorage.setItem(DRAFT_KEY, packDraft({ producer_name: "הבית של דנה" }, 2, T0));
    render(
      <AuthProvider>
        <LogoutProbe />
      </AuthProvider>,
    );
    const btn = await screen.findByTestId("logout");
    expect(localStorage.getItem(DRAFT_KEY), "precondition: a draft is on disk").not.toBeNull();
    await act(async () => {
      btn.click();
    });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem("token"), "the existing logout still runs").toBeNull();
  });

  it("…and when the account is deleted outright", async () => {
    localStorage.setItem("token", "t");
    localStorage.setItem(DRAFT_KEY, packDraft({ producer_name: "הבית של דנה" }, 2, T0));
    render(
      <AuthProvider>
        <LogoutProbe />
      </AuthProvider>,
    );
    const btn = await screen.findByTestId("delete-account");
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    await act(async () => {
      btn.click();
    });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
