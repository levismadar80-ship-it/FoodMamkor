import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShareButton from "@/components/ShareButton";

// MEH-1290: producer-page share fallback moved from silent clipboard-copy to
// wa.me (the product's viral loop). navigator.share stays the primary path on
// mobile; wa.me only fires when the native sheet is unavailable.

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const flat = {
      trigger: "שתפו",
      modal_title: "שתפו לינק לעסק",
      modal_title_event: "שתפו את האירוע",
      modal_title_experience: "שיתוף החוויה",
      quiet_label: "שיתוף",
      copy_link: "שתפו לינק",
      wa_message_with_meta: "גיליתי את {title} במהמקור",
      wa_message_business_fallback: "בית עסק",
      wa_meta_separator: " • ",
    };
    return (key, vars) => {
      let s = flat[key] || key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
      return s;
    };
  },
}));

vi.mock("@phosphor-icons/react", () => ({
  ShareNetwork: (props) => <span data-testid="icon-sharenetwork" {...props} />,
  Check: (props) => <span data-testid="icon-check" {...props} />,
}));

describe("ShareButton (MEH-1290)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete navigator.share;
  });

  it("uses navigator.share as the primary path when available", async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    navigator.share = shareSpy;
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<ShareButton url="https://x/y" title="חוות השקמה" />);
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("falls back to wa.me (not clipboard) when navigator.share is unavailable", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<ShareButton url="https://x/y" title="חוות השקמה" />);
    fireEvent.click(screen.getByRole("button"));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const href = openSpy.mock.calls[0][0];
    expect(href).toContain("wa.me/?text=");
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("חוות השקמה"); // business name
    expect(decoded).toContain("https://x/y"); // URL
  });

  it("does nothing without a url", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ShareButton url="" title="חוות השקמה" />);
    fireEvent.click(screen.getByRole("button"));
    expect(openSpy).not.toHaveBeenCalled();
  });

  // MEH-2465 follow-up: an event page's share button is named for the event,
  // not «לעסק». Default stays the business label for every existing caller.
  it.each(["default", "quiet", "overlay"])(
    "names the button for an event when subject=event (%s)",
    (variant) => {
      render(<ShareButton url="https://x/e/1" title="שוק שישי" subject="event" variant={variant} />);
      expect(screen.getByRole("button", { name: "שתפו את האירוע" })).toBeInTheDocument();
    },
  );

  it("keeps the business label when no subject is given", () => {
    render(<ShareButton url="https://x/y" title="חוות השקמה" variant="quiet" />);
    expect(screen.getByRole("button", { name: "שתפו לינק לעסק" })).toBeInTheDocument();
  });

  // MEH-2548/2549: the outline variant beside «הוספה ליומן» on the event and
  // experience pages — visible label + a subject-specific accessible name.
  it("outline: an icon + «שיתוף» button named for an experience", () => {
    render(<ShareButton url="https://x/y" title="קטיף" variant="outline" subject="experience" />);
    const btn = screen.getByTestId("share-outline");
    expect(btn.textContent).toBe("שיתוף");
    expect(btn.getAttribute("aria-label")).toBe("שיתוף החוויה");
    expect(btn.querySelector('[data-testid="icon-sharenetwork"]')).not.toBeNull();
  });
});
