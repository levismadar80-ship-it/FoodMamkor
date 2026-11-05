/**
 * MEH-2699 — the admin can see and correct the owner-declared reservist claim.
 *
 * - ProducerForm (edit): the checkbox seeds from the stored value and an
 *   untick submits reservist_owned:false on the admin PUT.
 * - ProducerForm (create): no checkbox, and the POST carries no
 *   reservist_owned (ProducerAdminCreate has no such field — it would be
 *   silently dropped, so the control would lie).
 * - ProducerTags: a declared business gets the Medal tag; grass_fed's Cow is
 *   the positive control so a zero count can't come from icons not rendering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";
import { ProducerTags } from "@/app/[locale]/admin/producers/AdminProducersTable";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const F = he.admin.producers.form.fields;

function renderForm(props = {}) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducerForm {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
});

describe("Admin ProducerForm — reservist_owned (MEH-2699)", () => {
  it("edit: checkbox seeds from the stored claim, and unticking submits false", async () => {
    renderForm({ producerId: "p-1", initial: { name: "עסק לבדיקה", reservist_owned: true } });
    const box = await screen.findByRole("checkbox", { name: F.reservist_owned });
    expect(box).toBeChecked();

    fireEvent.click(box);
    fireEvent.submit(
      screen.getByRole("button", { name: he.admin.producers.form.submit_update }).closest("form"),
    );
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1].reservist_owned).toBe(false);
  });

  it("edit: an unrelated save does not send reservist_owned (owner may have flipped it meanwhile)", async () => {
    renderForm({ producerId: "p-1", initial: { name: "עסק לבדיקה", reservist_owned: true } });
    await screen.findByRole("checkbox", { name: F.reservist_owned });
    fireEvent.submit(
      screen.getByRole("button", { name: he.admin.producers.form.submit_update }).closest("form"),
    );
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1]).not.toHaveProperty("reservist_owned");
  });

  it("create: no reservist checkbox (the create schema has no such field)", async () => {
    renderForm({});
    await screen.findByRole("checkbox", { name: F.grass_fed });
    expect(screen.queryByRole("checkbox", { name: F.reservist_owned })).toBeNull();
  });
});

describe("Admin ProducerTags — reservist tag (MEH-2699)", () => {
  const icons = (producer) => {
    const { container } = render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProducerTags producer={producer} />
      </NextIntlClientProvider>,
    );
    return container;
  };

  it("a declared business gets the tag beside the grass_fed control", () => {
    const c = icons({ grass_fed: true, reservist_owned: true });
    expect(c.querySelectorAll("svg")).toHaveLength(2);
    expect(c.querySelector('[data-testid="admin-tag-reservist"]')).not.toBeNull();
  });

  it("an undeclared business gets no tag", () => {
    const c = icons({ grass_fed: true, reservist_owned: false });
    expect(c.querySelectorAll("svg")).toHaveLength(1);
  });
});
