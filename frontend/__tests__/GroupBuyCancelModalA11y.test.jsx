/**
 * MEH-2199 chunk 5 — the cancel-commitment modal declares aria-modal="true" and
 * role="dialog" and, until this ticket, delivered none of what that promises:
 * no Escape, no focus trap, no focus-return. A keyboard user could open it and
 * then Tab straight out into the page behind it, which is worse than a
 * non-modal dialog because the ARIA tells the screen reader the rest of the
 * page is inert when it is not.
 *
 * The house precedent is Lightbox.jsx:77-112 — Escape, and a Tab that cycles
 * within the dialog. Focus-return to the trigger is added here on top.
 *
 * WHAT THESE ASSERTIONS ARE CAREFUL ABOUT
 * The destructive path must not change. MEH-1250 replaced a native
 * window.confirm() with this dialog precisely so the DELETE is deliberate, so
 * every case below that closes the dialog also asserts DELETE was NOT called.
 * An a11y layer that made Escape delete the commitment would pass a
 * "does Escape close it?" test and be a catastrophe.
 *
 * Scaffolding mirrors __tests__/GroupBuyCancelModal.test.jsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import api from "@/lib/api";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "דנה", role: "user", phone: "0500000000" }, loading: false }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "he", useTranslations: () => (key) => key }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099" }));

const COMMITTED_GB = {
  id: "gb-1",
  title: "קבוצת רכש לדוגמה",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 2,
  max_participants: 10,
  commits_count: 1,
  price_per_unit_regular: 100,
  price_per_unit_group: 80,
  user_committed: true,
  user_commit: { quantity: 1 },
};

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: COMMITTED_GB })),
    post: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

/** The page CTA that opens the dialog — the element focus must come home to. */
const openTrigger = () => screen.findByRole("button", { name: "cancel_cta" });
const dialog = () => screen.findByRole("dialog");

const openDialog = async () => {
  render(<GroupBuyDetailClient id="gb-1" />);
  const trigger = await openTrigger();
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, el: await dialog() };
};

beforeEach(() => {
  api.delete.mockClear();
});
afterEach(cleanup);

describe("GroupBuy cancel modal — keyboard + focus (MEH-2199)", () => {
  it("moves focus INTO the dialog when it opens", async () => {
    const { el } = await openDialog();
    await waitFor(() => expect(el.contains(document.activeElement)).toBe(true));
    // Specifically the first actionable control, per APG — not merely "somewhere
    // inside", which a container with tabindex=-1 would also satisfy.
    expect(document.activeElement).toBe(within(el).getAllByRole("button")[0]);
  });

  it("Escape closes it — and does NOT delete the commitment", async () => {
    await openDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The whole reason MEH-1250 exists: the destructive action stays deliberate.
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger that opened it", async () => {
    const { trigger } = await openDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("returns focus to the trigger after the dismiss button too, not just Escape", async () => {
    const { trigger, el } = await openDialog();
    const dismiss = within(el).getByRole("button", { name: "cancel_dismiss" });
    // Focus the dismiss button EXPLICITLY first. jsdom's fireEvent.click does
    // not move focus, so without this the trigger is still focused and the
    // assertion below passes against the unfixed component — green for the
    // wrong reason, which is exactly the shape that survives review. Measured:
    // it did pass that way before this line was added.
    dismiss.focus();
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("Tab cycles inside the dialog instead of escaping into the page behind it", async () => {
    const { el } = await openDialog();
    const buttons = within(el).getAllByRole("button");
    const first = buttons[0];
    const last = buttons.at(-1);

    // Forwards off the end wraps to the first.
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Backwards off the front wraps to the last.
    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("the ARIA dialog IS the trapped card, not the backdrop behind it", async () => {
    const { el } = await openDialog();

    // Behavioural, not structural. The backdrop closes the dialog when clicked;
    // the card stops propagation and stays open. So if role="dialog" were still
    // on the backdrop, clicking the element the a11y tree calls "the dialog"
    // would DISMISS it — which is the concrete consequence of the ARIA boundary
    // and the focus-trap boundary being different elements.
    fireEvent.click(el);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("captures the focus-return target when the dialog OPENS, not when it closes", async () => {
    const { trigger, el } = await openDialog();
    // Move focus away while the dialog is open, as a real user tabbing would.
    within(el).getByRole("button", { name: "cancel_dismiss" }).focus();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Still the CTA, because the target was recorded at open time rather than
    // inferred from whatever happened to be focused later.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("confirming still DELETEs — the a11y layer did not touch the destructive path", async () => {
    const { el } = await openDialog();
    fireEvent.click(within(el).getByRole("button", { name: "cancel_cta" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/group-buys/gb-1/commit"));
  });

  it("leaves an unhandled key alone while open", async () => {
    await openDialog();
    // fireEvent returns false when preventDefault was called. A trap that
    // swallowed every key would pass every other case in this file.
    expect(fireEvent.keyDown(window, { key: "a" })).toBe(true);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("does not hijack Escape while the dialog is CLOSED", async () => {
    render(<GroupBuyDetailClient id="gb-1" />);
    await openTrigger();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The listener must be scoped to the open state. Without this, a global
    // keydown handler left attached is invisible until it collides with
    // something else on the page.
    expect(fireEvent.keyDown(window, { key: "Escape" })).toBe(true);
    expect(api.delete).not.toHaveBeenCalled();
  });
});
