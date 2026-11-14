import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("EmailTypoHint", () => {
  it("a mistyped domain: nothing while typing, the approved line after blur", () => {
    render(<Field />);
    fireEvent.focus(screen.getByTestId("em"));
    type("noa@gmial.com");
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
    fireEvent.blur(screen.getByTestId("em"));
    expect(screen.getByTestId("email-typo-hint").textContent).toBe("אולי התכוונו ל־noa@gmail.com?");
  });

  it("tapping the address fixes the field and the line goes away", () => {
    const onAccept = vi.fn();
    render(<Field onAccept={onAccept} />);
    type("noa@gmail.con");
    fireEvent.blur(screen.getByTestId("em"));
    fireEvent.click(screen.getByTestId("email-typo-fix"));
    expect(onAccept).toHaveBeenCalledWith("noa@gmail.com");
    expect(screen.getByTestId("em").value).toBe("noa@gmail.com");
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
  });

  it("a correct or unknown domain gets no line", () => {
    render(<Field />);
    type("noa@mehamakor.co.il");
    fireEvent.blur(screen.getByTestId("em"));
    expect(screen.queryByTestId("email-typo-hint")).toBeNull();
  });

  it("going back into the field hides the line while she edits", () => {
    render(<Field />);
    type("noa@gmial.com");
    fireEvent.blur(screen.getByTestId("em"));
    expect(screen.getByTestId("email-typo-hint")).toBeInTheDocument();
    fireEvent.focus(screen.getByTestId("em"));
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
    ["components/RegistrationCta.jsx", '"signup-email"'],
    ["app/[locale]/contact/ContactClient.jsx", '"contact-email"'],
    ["app/[locale]/recommend/RecommendClient.jsx", '"recommend-suggester-email"'],
    ["app/[locale]/register/RegisterClient.jsx", '"register-email"'],
    ["app/[locale]/register/producer/RegisterProducerClient.jsx", '"producer-account-email"'],
    ["components/DeliveryWaitlistForm.jsx", "{inputId}"],
  ])("%s → fieldId=%s", (file, id) => {
    const src = readFileSync(path.join(__dirname, "..", file), "utf8");
    expect(src).toContain(`<EmailTypoHint fieldId=${id}`);
    expect(src).toContain(`id=${id}`);
  });
});
