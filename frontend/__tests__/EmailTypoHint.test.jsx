import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import he from "@/messages/he.json";
import EmailTypoHint from "@/components/EmailTypoHint";

// MEH-3123 — «אולי התכוונו ל־…?» appears after the field loses focus, only for
// a mistyped domain; the address is a button that puts the fix in the field.

function Field({ onAccept }) {
  const [email, setEmail] = useState("");
  return (
    <NextIntlClientProvider locale="he" messages={he}>
      <input id="em" data-testid="em" value={email} onChange={(e) => setEmail(e.target.value)} />
      <EmailTypoHint
        fieldId="em"
        value={email}
        onAccept={(v) => {
          onAccept?.(v);
          setEmail(v);
        }}
      />
    </NextIntlClientProvider>
  );
}

const type = (v) => fireEvent.change(screen.getByTestId("em"), { target: { value: v } });
const wait = (ms) => act(() => vi.advanceTimersByTime(ms));
// Blur, then wait out the tap window (SHOW_DELAY_MS = 300).
const leave = () => {
  fireEvent.blur(screen.getByTestId("em"));
  wait(300);
};

describe("EmailTypoHint", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a mistyped domain: nothing while typing, the approved line after blur", () => {
    render(<Field />);
    fireEvent.focus(screen.getByTestId("em"));
    type("noa@gmial.com");
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
    leave();
    expect(screen.getByTestId("email-typo-hint").textContent).toBe("אולי התכוונו ל־noa@gmail.com?");
  });

  it("tapping the address fixes the field and the line goes away", () => {
    const onAccept = vi.fn();
    render(<Field onAccept={onAccept} />);
    type("noa@gmail.con");
    leave();
    fireEvent.click(screen.getByTestId("email-typo-fix"));
    expect(onAccept).toHaveBeenCalledWith("noa@gmail.com");
    expect(screen.getByTestId("em").value).toBe("noa@gmail.com");
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
  });

  it("a correct or unknown domain gets no line", () => {
    render(<Field />);
    type("noa@mehamakor.co.il");
    leave();
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
    // Control: the same field after a typo does show it, so the null above
    // is not a dead component.
    type("noa@gmial.com");
    expect(screen.getByTestId("email-typo-hint")).toBeInTheDocument();
  });

  it("going back into the field hides the line while she edits", () => {
    render(<Field />);
    type("noa@gmial.com");
    leave();
    expect(screen.getByTestId("email-typo-hint")).toBeInTheDocument();
    fireEvent.focus(screen.getByTestId("em"));
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
  });
});

describe("EmailTypoHint — review findings 2 and 3", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("the live region exists, empty, before there is anything to say", () => {
    render(<Field />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveClass("sr-only");
    type("noa@gmial.com");
    leave();
    // Same node, now filled — what a screen reader announces.
    expect(screen.getByRole("status")).toBe(region);
    expect(region).not.toHaveClass("sr-only");
  });

  it("nothing moves during a tap: the line waits 300 ms after blur", () => {
    render(<Field />);
    type("noa@gmial.com");
    fireEvent.blur(screen.getByTestId("em"));
    wait(250);
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
    wait(50);
    expect(screen.getByTestId("email-typo-hint")).toBeInTheDocument();
  });

  it("coming back into the field inside the window cancels the line", () => {
    render(<Field />);
    type("noa@gmial.com");
    fireEvent.blur(screen.getByTestId("em"));
    wait(100);
    fireEvent.focus(screen.getByTestId("em"));
    wait(500);
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
  });
});

// The six public forms named on MEH-3123 each wire the hint to their own email
// field. Reads the source: a form that drops the hint, or points it at another
// field id, goes red here.
import { readFileSync } from "node:fs";
import path from "node:path";

describe("EmailTypoHint is wired in the six public forms", () => {
  it.each([
    ["components/RegistrationCta.jsx", '"signup-email"', "email"],
    ["app/[locale]/contact/ContactClient.jsx", '"contact-email"', "email"],
    ["app/[locale]/recommend/RecommendClient.jsx", '"recommend-suggester-email"', "suggester_email"],
    ["app/[locale]/register/RegisterClient.jsx", '"register-email"', "email"],
    ["app/[locale]/register/producer/RegisterProducerClient.jsx", '"producer-account-email"', "email"],
    ["components/DeliveryWaitlistForm.jsx", "{inputId}", ""],
  ])("%s → fieldId=%s", (file, id, setter) => {
    const src = readFileSync(path.join(__dirname, "..", file), "utf8");
    expect(src).toContain(`<EmailTypoHint fieldId=${id}`);
    // A real `id=` attribute (whitespace before it), not data-testid="…".
    const esc = id.replace(/[{}]/g, "\\$&");
    expect(src).toMatch(new RegExp(`\\sid=${esc}`));
    // onAccept writes the email field itself, not some other setter.
    expect(src).toMatch(new RegExp(`fieldId=${esc}[^>]*onAccept=\\{(setEmail|\\(email\\) => set\\("${setter}"\\))`, "s"));
  });
});
