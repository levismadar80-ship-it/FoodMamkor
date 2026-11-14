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

  it("runs once per account: a field she cleared stays cleared on the next render", () => {
    authValue = { user: NOA };
    const { rerender } = render(<Form />);
    fireEvent.change(screen.getByTestId("email"), { target: { value: "" } });
    authValue = { user: { ...NOA } }; // same account, new object (profile refresh)
    act(() => rerender(<Form />));
    expect(val("email")).toBe("");
  });

  it("single-value form fills from the account and keeps typed text", () => {
    authValue = { user: NOA };
    render(<OneField />);
    expect(val("one")).toBe("noa@example.com");
  });
});
