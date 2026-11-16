/**
 * MEH-3338 — «מאחורי העסק» on the admin producer form: the bio travels with
 * the form's save (create and edit), the photo uploads to the ADMIN route for
 * the business being edited, and «הסרת תמונה» saves null.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { role: "admin" }, loading: false }),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const FORM = he.admin.producers.form;
const PHOTO = "https://res.cloudinary.com/x/image/upload/mehamakor/owner/owner_p-7.jpg";

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
const submit = (label) => fireEvent.submit(screen.getByRole("button", { name: label }).closest("form"));
const bioField = () => screen.getByLabelText(FORM.fields.owner_bio);

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

describe("Admin ProducerForm — owner story (MEH-3338)", () => {
  it("edit: the photo uploads to the admin route for THIS business", async () => {
    api.post.mockResolvedValue({ data: { url: PHOTO } });
    wrap(<ProducerForm producerId="p-7" initial={{ name: "סנדרה", city: "פרדס חנה-כרכור" }} />);
    await screen.findByTestId("owner-story-section");

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "me.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("admin-owner-photo-input"), { target: { files: [file] } });

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][0]).toBe("/upload/owner-photo/p-7");
    expect(await screen.findByTestId("admin-owner-photo-preview")).toHaveAttribute("data-src", PHOTO);
  });

  it("edit: bio + «הסרת תמונה» go out on the form's save", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(
      <ProducerForm
        producerId="p-7"
        initial={{ name: "סנדרה", city: "פרדס חנה-כרכור", owner_bio: "", owner_photo_url: PHOTO }}
      />,
    );
    await screen.findByTestId("owner-story-section");
    fireEvent.change(bioField(), { target: { value: "אני סנדרה" } });
    expect(screen.getByTestId("admin-owner-bio-count")).toHaveTextContent("9/300");
    fireEvent.click(screen.getByRole("button", { name: FORM.fields.owner_photo_remove }));
    expect(screen.queryByTestId("admin-owner-photo-preview")).toBeNull();

    submit(FORM.submit_update);
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = api.put.mock.calls.find((c) => c[0] === "/admin/producers/p-7")[1];
    expect(body.owner_bio).toBe("אני סנדרה");
    expect(body.owner_photo_url).toBeNull();
  });

  it("create: the bio is sent, and there is no photo upload yet (no id)", async () => {
    api.post.mockResolvedValue({ data: { id: "new-1" } });
    wrap(<ProducerForm />);
    await screen.findByTestId("owner-story-section");
    expect(screen.queryByTestId("admin-owner-photo-input")).toBeNull();

    fireEvent.change(bioField(), { target: { value: "אני סנדרה" } });
    submit(FORM.submit_create);
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const create = api.post.mock.calls.find((c) => c[0] === "/admin/producers");
    expect(create[1].owner_bio).toBe("אני סנדרה");
  });
});

describe("Admin ProducerForm — owner story is not clobbered (MEH-3338 review)", () => {
  it("an untouched edit save omits owner_bio and owner_photo_url", async () => {
    api.put.mockResolvedValue({ data: {} });
    wrap(
      <ProducerForm
        producerId="p-7"
        initial={{ name: "סנדרה", city: "פרדס חנה-כרכור", owner_bio: "אני סנדרה", owner_photo_url: PHOTO }}
      />,
    );
    await screen.findByTestId("owner-story-section");
    submit(FORM.submit_update);
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = api.put.mock.calls.find((c) => c[0] === "/admin/producers/p-7")[1];
    expect(body).not.toHaveProperty("owner_bio");
    expect(body).not.toHaveProperty("owner_photo_url");
    expect(body.name).toBe("סנדרה"); // control
  });
});
