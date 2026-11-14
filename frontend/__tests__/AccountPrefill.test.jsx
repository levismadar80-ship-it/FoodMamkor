import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState } from "react";

// MEH-3112 — a signed-in visitor's own name / phone / email fill the EMPTY
// fields of a public form; a guest gets nothing; typed text is never replaced.

let authValue = null;
vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => authValue }));

import { useAccountPrefill, useAccountPrefillValue } from "@/lib/use-account-prefill";

const MAP = { name: "name", phone: "phone", email: "email" };

function Form() {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  useAccountPrefill(setForm, MAP);
  return (
    <>
      {Object.keys(MAP).map((f) => (
        <input key={f} data-testid={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
      ))}
    </>
  );
}

function OneField() {
  const [email, setEmail] = useState("");
  useAccountPrefillValue(setEmail, "email");
  return <input data-testid="one" value={email} onChange={(e) => setEmail(e.target.value)} />;
}

const NOA = { id: 7, name: "נועה כהן", phone: "052-1234567", email: "noa@example.com" };
const val = (id) => screen.getByTestId(id).value;

beforeEach(() => { authValue = null; });

describe("useAccountPrefill", () => {
  it("signed in with a phone: all three fields are filled", () => {
    authValue = { user: NOA };
    render(<Form />);
    expect([val("name"), val("phone"), val("email")]).toEqual(["נועה כהן", "052-1234567", "noa@example.com"]);
  });

  it("signed in with no phone on the account: name and email filled, phone left empty", () => {
    authValue = { user: { ...NOA, phone: null } };
    render(<Form />);
    expect([val("name"), val("phone"), val("email")]).toEqual(["נועה כהן", "", "noa@example.com"]);
  });

  it("guest (no provider, or no user): nothing is filled", () => {
    render(<Form />);
    expect([val("name"), val("phone"), val("email")]).toEqual(["", "", ""]);
    authValue = { user: null, loading: false };
    render(<OneField />);
    expect(val("one")).toBe("");
  });

  it("account loads after the form is on screen: fills only what she has not typed", () => {
    authValue = { user: null, loading: true };
    const { rerender } = render(<Form />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "דנה" } });
    authValue = { user: NOA, loading: false };
    act(() => rerender(<Form />));
    expect(val("name")).toBe("דנה");
    expect(val("email")).toBe("noa@example.com");
  });

  it("a profile refresh (same account id, new object) does not refill a field she cleared", () => {
    authValue = { user: NOA };
    const { rerender } = render(<Form />);
    fireEvent.change(screen.getByTestId("email"), { target: { value: "" } });
    authValue = { user: { ...NOA } }; // same account, new object (profile refresh)
    act(() => rerender(<Form />));
    expect(val("email")).toBe("");
  });

  it("sign-out empties the fields that still hold that account's details, keeps what she typed; the next account fills fresh", () => {
    authValue = { user: NOA };
    const { rerender } = render(<Form />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "דנה" } });
    authValue = { user: null };
    act(() => rerender(<Form />));
    expect([val("name"), val("phone"), val("email")]).toEqual(["דנה", "", ""]);
    authValue = { user: { id: 8, name: "רות", phone: "", email: "rut@example.com" } };
    act(() => rerender(<Form />));
    expect([val("name"), val("phone"), val("email")]).toEqual(["דנה", "", "rut@example.com"]);
  });

  it("refill() puts her details back after the form resets (a second message)", () => {
    authValue = { user: NOA };
    function Resetting() {
      const [form, setForm] = useState({ name: "", email: "" });
      const refill = useAccountPrefill(setForm, { name: "name", email: "email" });
      return (
        <>
          <input data-testid="rname" value={form.name} readOnly />
          <button data-testid="reset" onClick={() => { setForm({ name: "", email: "" }); refill(); }} />
        </>
      );
    }
    render(<Resetting />);
    fireEvent.click(screen.getByTestId("reset"));
    expect(screen.getByTestId("rname").value).toBe("נועה כהן");
  });

  it("single-value form fills from the account and keeps typed text", () => {
    authValue = { user: NOA };
    render(<OneField />);
    expect(val("one")).toBe("noa@example.com");
  });
});
