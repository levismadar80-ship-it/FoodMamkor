/**
 * MEH-3915 — two silent losses on the admin business edit page.
 *
 * 1. «שמרו שינויים» saved only ProducerForm's own fields and left the page, so
 *    a delivery fee typed into «משלוחים ואיסוף» (its own «שמירה») was thrown
 *    away unseen. Cells: 0 unsaved sections → saves · 1 → held, named · many →
 *    held, all named · section saved → the hold lifts.
 * 2. A gallery batch whose 2nd photo got 429 dropped the 1st one too, and the
 *    only sign was a passing toast. Cells: 1 ok + 1 limited → the ok one stays,
 *    a lasting message names the limit · save disabled mid-upload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";
import AdminDeliveryPaymentPanel, { useUnsavedSections } from "@/components/admin/AdminDeliveryPaymentPanel";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useParams: () => ({}) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { role: "admin" }, loading: false }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const FORM = he.admin.producers.form;
const P = he.dashboard.producer;
const PRODUCER = {
  name: "סנדרה",
  city: "חיפה",
  phone: "0522518862",
  has_physical_location: true,
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_areas: [{ city: "חיפה", delivery_day: null, min_order: null, delivery_fee: null }],
  locations: [],
  order_window: null,
  payment_info: null,
  images: [],
};

// The page's wiring (edit/page.js uses the same hook), without its loading
// and the other panels around it.
function Page() {
  const { reportDirty, unsavedSections } = useUnsavedSections();
  return (
    <>
      <ProducerForm initial={PRODUCER} producerId="p-1" unsavedSections={unsavedSections} />
      <AdminDeliveryPaymentPanel producerId="p-1" producer={PRODUCER} reportDirty={reportDirty} />
    </>
  );
}

const mount = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
const submit = () => fireEvent.submit(screen.getByRole("button", { name: FORM.submit_update }).closest("form"));
const formPuts = () => api.put.mock.calls.filter((c) => c[0] === "/admin/producers/p-1" && "name" in c[1]);
const delivery = () => within(screen.getByTestId("admin-section-delivery"));
const typeFee = (v) => {
  const [fee] = delivery().getAllByRole("spinbutton");
  fireEvent.change(fee, { target: { value: v } });
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
});

describe("unsaved sections hold «שמרו שינויים» (MEH-3915)", () => {
  it("0 unsaved sections: the form saves and leaves", async () => {
    mount(<Page />);
    await screen.findByText(FORM.sections.basic);
    submit();
    await waitFor(() => expect(formPuts()).toHaveLength(1));
    expect(screen.queryByTestId("unsaved-sections-error")).not.toBeInTheDocument();
  });

  it("1 unsaved section (a typed delivery fee): no save, the section is named", async () => {
    mount(<Page />);
    await screen.findByText(FORM.sections.basic);
    typeFee("25");
    submit();
    const msg = await screen.findByTestId("unsaved-sections-error");
    expect(msg).toHaveTextContent(P.delivery.heading);
    expect(msg).not.toHaveTextContent(P.payment_info.heading);
    expect(formPuts()).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("saving the section lifts the hold, and the fee went to the admin route", async () => {
    mount(<Page />);
    await screen.findByText(FORM.sections.basic);
    typeFee("25");
    submit();
    await screen.findByTestId("unsaved-sections-error");
    fireEvent.click(delivery().getByRole("button", { name: P.delivery.save_cta }));
    await waitFor(() => expect(screen.queryByTestId("unsaved-sections-error")).not.toBeInTheDocument());
    const sectionPut = api.put.mock.calls.find((c) => c[0] === "/admin/producers/p-1" && "delivery_fee" in c[1]);
    expect(sectionPut[1].delivery_fee).toBe(25);
    submit();
    await waitFor(() => expect(formPuts()).toHaveLength(1));
  });

  it("many unsaved sections (delivery fee + a payment method): both are named", async () => {
    mount(<Page />);
    await screen.findByText(FORM.sections.basic);
    typeFee("25");
    fireEvent.click(within(screen.getByTestId("admin-section-payment-info")).getByText(P.payment_info.methods.bit));
    submit();
    const msg = await screen.findByTestId("unsaved-sections-error");
    expect(msg).toHaveTextContent(P.delivery.heading);
    expect(msg).toHaveTextContent(P.payment_info.heading);
    expect(msg).not.toHaveTextContent(P.order_window.heading);
    expect(formPuts()).toHaveLength(0);
  });

  it("leaving the page asks first only while a section is unsaved", async () => {
    mount(<Page />);
    await screen.findByText(FORM.sections.basic);
    const leave = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);
    typeFee("25");
    await waitFor(() => expect(leave()).toBe(true));
  });
});

describe("gallery upload failures surface and keep what uploaded (MEH-3915)", () => {
  const pick = (n) => {
    const input = screen.getByLabelText(FORM.sections.images);
    const files = Array.from({ length: n }, (_, i) => new File(["x"], `p${i}.jpg`, { type: "image/jpeg" }));
    fireEvent.change(input, { target: { files } });
  };

  it("photo 1 uploads, photo 2 gets 429: photo 1 is saved, the limit message stays", async () => {
    api.post
      .mockResolvedValueOnce({ data: { url: "https://res.cloudinary.com/x/one.jpg" } })
      .mockRejectedValueOnce({ response: { status: 429, data: { error: "Rate limit exceeded: 20 per 1 hour" } } });
    mount(<ProducerForm initial={PRODUCER} producerId="p-1" />);
    await screen.findByText(FORM.sections.basic);
    pick(3);
    const msg = await screen.findByTestId("gallery-upload-error");
    // Photos 2 and 3: the limit answers every file after the first refusal.
    expect(msg).toHaveTextContent(`2 מתוך 3`);
    expect(msg).toHaveTextContent(he.error.mapper.rate_limited);
    expect(api.post).toHaveBeenCalledTimes(2);
    submit();
    await waitFor(() => expect(formPuts()).toHaveLength(1));
    expect(formPuts()[0][1].images).toEqual(["https://res.cloudinary.com/x/one.jpg"]);
  });

  it("all photos upload: no message, all saved", async () => {
    api.post
      .mockResolvedValueOnce({ data: { url: "https://res.cloudinary.com/x/a.jpg" } })
      .mockResolvedValueOnce({ data: { url: "https://res.cloudinary.com/x/b.jpg" } });
    mount(<ProducerForm initial={PRODUCER} producerId="p-1" />);
    await screen.findByText(FORM.sections.basic);
    pick(2);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    submit();
    await waitFor(() => expect(formPuts()).toHaveLength(1));
    expect(formPuts()[0][1].images).toEqual(["https://res.cloudinary.com/x/a.jpg", "https://res.cloudinary.com/x/b.jpg"]);
    expect(screen.queryByTestId("gallery-upload-error")).not.toBeInTheDocument();
  });

  it("save is disabled while photos are uploading", async () => {
    let release;
    api.post.mockReturnValueOnce(new Promise((r) => { release = r; }));
    mount(<ProducerForm initial={PRODUCER} producerId="p-1" />);
    await screen.findByText(FORM.sections.basic);
    pick(1);
    await waitFor(() => expect(screen.getByRole("button", { name: FORM.submit_update })).toBeDisabled());
    await act(async () => release({ data: { url: "https://res.cloudinary.com/x/c.jpg" } }));
    await waitFor(() => expect(screen.getByRole("button", { name: FORM.submit_update })).toBeEnabled());
  });
});
