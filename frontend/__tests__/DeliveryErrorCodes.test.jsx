/**
 * MEH-1943 chunk 3 — the two delivery_validation.py 422s carry
 * `{code, message, params}`; both consumers (owner DeliveryCard, admin
 * ProducerForm) resolve the code to dashboard.producer.delivery.errors.<code>.
 *
 * The integration cases send `message: "SERVER-SENTENCE"` so a pass cannot be
 * produced by the old path (which rendered `message` as-is): only the resolver
 * can turn the code into the he.json copy. The unknown-code cases are the
 * other direction — the resolver must decline, and `message` must still show.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { detailToMessage } from "@/lib/errors";
import { DELIVERY_ERROR_CODES, makeDeliveryCodeResolver } from "@/lib/delivery-errors";
import { DeliveryCard } from "@/app/[locale]/producer/dashboard/edit/cards";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { error: vi.fn(), success: vi.fn() },
}));

const CODES = ["excluded_requires_nationwide", "nationwide_requires_delivery"];
const D = he.dashboard.producer.delivery;

const reject422 = (code) =>
  Promise.reject({
    response: { status: 422, data: { detail: { code, message: "SERVER-SENTENCE", params: {} } } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
});

describe("makeDeliveryCodeResolver", () => {
  const fakeT = (key) => `T(${key})`;

  for (const code of CODES) {
    it(`${code} → errors.${code}`, () => {
      expect(makeDeliveryCodeResolver(fakeT)(code)).toBe(`T(errors.${code})`);
    });
  }

  it("declines an unknown code (returns null, never calls t)", () => {
    const t = vi.fn(fakeT);
    expect(makeDeliveryCodeResolver(t)("one_primary_required")).toBeNull();
    expect(t).not.toHaveBeenCalled();
  });

  it("through detailToMessage: unknown code falls back to the server message", () => {
    const detail = { code: "some_other_code", message: "SERVER-SENTENCE", params: {} };
    expect(detailToMessage(detail, makeDeliveryCodeResolver(fakeT))).toBe("SERVER-SENTENCE");
  });

  it("through detailToMessage: a known code wins over the server message", () => {
    const detail = { code: CODES[1], message: "SERVER-SENTENCE", params: {} };
    expect(detailToMessage(detail, makeDeliveryCodeResolver(fakeT))).toBe(`T(errors.${CODES[1]})`);
  });

  it("the code set is exactly the two backend codes", () => {
    expect([...DELIVERY_ERROR_CODES].sort()).toEqual([...CODES].sort());
  });
});

describe("copy", () => {
  // The he value IS the backend `message`, word for word: a consumer without a
  // resolver and one with it must show the same Hebrew sentence.
  const backend = fs.readFileSync(
    path.resolve(__dirname, "../../backend/app/services/delivery_validation.py"),
    "utf8",
  );

  for (const code of CODES) {
    it(`${code}: he value is quoted verbatim in delivery_validation.py, en present`, () => {
      const heValue = D.errors[code];
      expect(typeof heValue).toBe("string");
      expect(backend).toContain(`"code": "${code}"`);
      expect(backend).toContain(heValue);
      expect(typeof en.dashboard.producer.delivery.errors[code]).toBe("string");
      expect(en.dashboard.producer.delivery.errors[code]).not.toBe(heValue);
    });
  }
});

describe("owner DeliveryCard resolves the codes", () => {
  function renderDirtyCardAndSave() {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <DeliveryCard
          profile={{
            has_physical_location: true,
            offers_delivery: true,
            delivery_nationwide: true,
            delivery_areas: [],
          }}
          onSave={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    // One real change (untick the physical store; delivery+nationwide stays valid)
    // so the save button enables.
    fireEvent.click(screen.getByRole("checkbox", { name: D.has_physical_location }));
    fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
  }

  for (const code of CODES) {
    it(`${code} → the he.json sentence, not the server message`, async () => {
      api.put.mockImplementationOnce(() => reject422(code));
      renderDirtyCardAndSave();
      expect(await screen.findByText(D.errors[code])).toBeInTheDocument();
      expect(screen.queryByText("SERVER-SENTENCE")).not.toBeInTheDocument();
    });
  }

  it("an unknown code still shows the server message", async () => {
    api.put.mockImplementationOnce(() => reject422("some_other_code"));
    renderDirtyCardAndSave();
    expect(await screen.findByText("SERVER-SENTENCE")).toBeInTheDocument();
  });
});

describe("admin ProducerForm resolves the codes", () => {
  async function submitAndFail(code) {
    api.put.mockImplementationOnce(() => reject422(code));
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProducerForm producerId="p-1" />
      </NextIntlClientProvider>,
    );
    const submit = await screen.findByRole("button", { name: he.admin.producers.form.submit_update });
    fireEvent.submit(submit.closest("form"));
    await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    return showToast.error.mock.calls[0][0];
  }

  for (const code of CODES) {
    it(`${code} → dashboard.producer.delivery.errors.${code}`, async () => {
      expect(await submitAndFail(code)).toBe(D.errors[code]);
    });
  }

  it("an unknown code still shows the server message", async () => {
    expect(await submitAndFail("some_other_code")).toBe("SERVER-SENTENCE");
  });
});
