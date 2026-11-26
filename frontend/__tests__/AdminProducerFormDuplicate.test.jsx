/**
 * MEH-3883 — the admin «new business» form, on a 409 DUPLICATE_BUSINESS,
 * lists the businesses we already have (link + owner + why) instead of a
 * toast, and creates the new one only after the explicit «create anyway»
 * click, which resends with allow_duplicate: true.
 * States: 0 matches (no list, first send has allow_duplicate false) · 1 owned ·
 * 1 unowned · many (each listed) · another error (toast, no list).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import ProducerForm from "@/components/admin/ProducerForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { role: "admin" }, loading: false }),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const FORM = he.admin.producers.form;
const DUP = FORM.duplicate;

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const fillName = () =>
  fireEvent.change(screen.getByLabelText(FORM.fields.name, { exact: false }), { target: { value: "עסק חדש" } });

const submit = () =>
  fireEvent.submit(screen.getByRole("button", { name: FORM.submit_create }).closest("form"));

const conflict = (matches) =>
  Object.assign(new Error("409"), {
    response: { status: 409, data: { detail: { code: "DUPLICATE_BUSINESS", message: "x", matches } } },
  });

const OWNED = { id: "b-1", name: "Farmerim", status: "approved", owner_email: "order@farmerim.com", reasons: ["phone", "instagram"] };
const UNOWNED = { id: "b-2", name: "משק בלי בעלים", status: "draft", owner_email: null, reasons: ["email"] };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

describe("ProducerForm — duplicate business on create (MEH-3883)", () => {
  it("no match: one send, allow_duplicate false, no list", async () => {
    api.post.mockResolvedValue({ data: { id: "new-1" } });
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.basic);
    submit();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1].allow_duplicate).toBe(false);
    expect(screen.queryByTestId("admin-duplicate-matches")).toBeNull();
  });

  it("many matches: lists each with its link, owner and reasons; no toast", async () => {
    api.post.mockRejectedValueOnce(conflict([OWNED, UNOWNED]));
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.basic);
    submit();
    const box = await screen.findByTestId("admin-duplicate-matches");
    expect(box.textContent).toContain(DUP.title);
    expect(screen.getByRole("link", { name: "Farmerim" }).getAttribute("href")).toContain("/admin/producers/b-1/edit");
    expect(screen.getByRole("link", { name: UNOWNED.name }).getAttribute("href")).toContain("/admin/producers/b-2/edit");
    expect(box.textContent).toContain("order@farmerim.com");
    expect(box.textContent).toContain(DUP.no_owner);
    expect(box.textContent).toContain(he.admin.producers.table.draft_twin.reasons.instagram);
    expect(showToast.error).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("one unowned match, then «create anyway» resends with allow_duplicate true", async () => {
    api.post.mockRejectedValueOnce(conflict([UNOWNED])).mockResolvedValueOnce({ data: { id: "new-1" } });
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.basic);
    fillName(); // «create anyway» goes through the form's own validation
    submit();
    fireEvent.click(await screen.findByTestId("admin-duplicate-create-anyway"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[0][1].allow_duplicate).toBe(false);
    expect(api.post.mock.calls[1][1].allow_duplicate).toBe(true);
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("editing a compared field after the 409 hides the list and its «create anyway»", async () => {
    api.post.mockRejectedValueOnce(conflict([UNOWNED]));
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.basic);
    submit();
    await screen.findByTestId("admin-duplicate-matches");
    fireEvent.change(screen.getByLabelText(FORM.fields.instagram, { exact: false }), { target: { value: "other_handle" } });
    expect(screen.queryByTestId("admin-duplicate-matches")).toBeNull();
  });

  it("more matches than shown: says how many more", async () => {
    const err = conflict([OWNED]);
    err.response.data.detail.total = 4;
    api.post.mockRejectedValueOnce(err);
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.basic);
    submit();
    const box = await screen.findByTestId("admin-duplicate-matches");
    expect(box.textContent).toContain(DUP.more.replace("{count}", "3"));
  });

  it("another error still toasts and shows no list", async () => {
    api.post.mockRejectedValueOnce(Object.assign(new Error("500"), { response: { status: 500, data: {} } }));
    wrap(<ProducerForm />);
    await screen.findByText(FORM.sections.basic);
    submit();
    await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    expect(screen.queryByTestId("admin-duplicate-matches")).toBeNull();
  });

  it("edit never carries allow_duplicate and never shows the list", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(<ProducerForm producerId="p-1" initial={{ name: "קיים" }} />);
    await screen.findByText(FORM.sections.basic);
    fireEvent.submit(screen.getByRole("button", { name: FORM.submit_update }).closest("form"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect("allow_duplicate" in api.put.mock.calls[0][1]).toBe(false);
    expect(screen.queryByTestId("admin-duplicate-matches")).toBeNull();
  });
});
