// MEH-3256 (grill retro D9): «ניתוק בעלים» under the owner panel's «מחובר» line.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OwnerDetachControl from "@/components/admin/OwnerDetachControl";

const apiMock = vi.hoisted(() => ({ post: vi.fn(() => Promise.resolve({ data: { ok: true } })) }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, values = {}) => {
    let s = `${scope}.${key}`;
    for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
    return `${s}|${Object.values(values).join("|")}`;
  },
}));

const OWNER = { id: "u-1", name: "דנה כהן", email: "dana@example.com" };

function setup(props = {}) {
  const onDetached = vi.fn();
  render(
    <OwnerDetachControl
      producerId="p-1"
      business="מאפיית הגבעה"
      owner={OWNER}
      onDetached={onDetached}
      {...props}
    />,
  );
  return { onDetached };
}

describe("OwnerDetachControl", () => {
  beforeEach(() => apiMock.post.mockClear());

  it("closed: only the button; open: the explanation names the owner", () => {
    setup();
    expect(screen.queryByTestId("owner-detach-form")).toBeNull();
    fireEvent.click(screen.getByTestId("owner-detach-open"));
    const form = screen.getByTestId("owner-detach-form");
    expect(form.textContent).toContain("דנה כהן");
    expect(form.textContent).toContain("dana@example.com");
    // The address sits inside a Hebrew sentence: isolated, so «ל-» stays put.
    expect(form.textContent).toContain("\u2068dana@example.com\u2069");
  });

  it("the confirm button stays off until the business name is typed", () => {
    setup();
    fireEvent.click(screen.getByTestId("owner-detach-open"));
    const confirm = screen.getByTestId("owner-detach-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("owner-detach-name"), { target: { value: "מאפייה" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("owner-detach-name"), {
      target: { value: " מאפיית הגבעה " },
    });
    expect(confirm).not.toBeDisabled();
  });

  it("sends the typed name and the owner it saw, then reloads", async () => {
    const { onDetached } = setup();
    fireEvent.click(screen.getByTestId("owner-detach-open"));
    fireEvent.change(screen.getByTestId("owner-detach-name"), { target: { value: "מאפיית הגבעה" } });
    fireEvent.click(screen.getByTestId("owner-detach-confirm"));
    await waitFor(() => expect(onDetached).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/p-1/detach-owner", {
      confirm_name: "מאפיית הגבעה",
      expected_owner_user_id: "u-1",
    });
  });

  it("shows the server's message and does not reload on a refusal", async () => {
    apiMock.post.mockRejectedValueOnce({ response: { status: 409, data: { detail: "הבעלים השתנו" } } });
    const { onDetached } = setup();
    fireEvent.click(screen.getByTestId("owner-detach-open"));
    fireEvent.change(screen.getByTestId("owner-detach-name"), { target: { value: "מאפיית הגבעה" } });
    fireEvent.click(screen.getByTestId("owner-detach-confirm"));
    expect(await screen.findByTestId("owner-detach-error")).toHaveTextContent("הבעלים השתנו");
    expect(onDetached).not.toHaveBeenCalled();
  });

  it("cancel closes the form and clears what was typed", () => {
    setup();
    fireEvent.click(screen.getByTestId("owner-detach-open"));
    fireEvent.change(screen.getByTestId("owner-detach-name"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("owner-detach-cancel"));
    expect(screen.queryByTestId("owner-detach-form")).toBeNull();
    fireEvent.click(screen.getByTestId("owner-detach-open"));
    expect(screen.getByTestId("owner-detach-name")).toHaveValue("");
  });

  it("renders nothing without an owner id", () => {
    const { container } = render(
      <OwnerDetachControl producerId="p" business="b" owner={{ name: "a", email: "a@b.c" }} onDetached={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
