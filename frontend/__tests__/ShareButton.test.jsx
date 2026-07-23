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
});
