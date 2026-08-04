/**
 * MEH-1261 F4 — the settings Save button must never be dead with no reason.
 *
 * `canSave` gates on `phoneValid` regardless of touch (MEH-1190), but the
 * invalid-phone message rendered only when `phoneTouched` (blur). Two paths
 * produced a disabled Save with no visible reason:
 *   - a phone SAVED before MEH-1190's validation existed (seeded invalid)
 *   - a PASTED invalid phone (no blur happens before reaching for Save)
 *
 * Locked behavior under test:
 *   - seeded-invalid phone → the field error is visible on mount
 *   - pasting an invalid phone → the field error is visible without blur
 *   - typing an invalid phone (no blur/paste) → NO error yet (MEH-1190's
 *     calm-while-typing UX is preserved)
 *
 * Mounts ProfileTab directly under the real NextIntlClientProvider + he.json
 * (REUSES: EditTabProductsSection.test.jsx harness pattern).
 *
 * MEH-1700: this used to end "— the full-page SettingsPage suite is currently
 * skipped", which was the stated reason this file mounts a sub-tree instead.
 * That suite is un-skipped and green as of 2026-08-04, so the clause is gone.
 * This file still earns its place on its own terms: it drives real he.json
 * copy, so it asserts the rendered Hebrew, where SettingsPage.test.jsx uses a
 * key-identity translator mock and asserts structure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import { ProfileTab } from "@/app/[locale]/settings/page";

const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: userRef.current,
    loading: false,
    updateProfile: vi.fn().mockResolvedValue({}),
    refreshUser: vi.fn(),
  }),
}));

// CitySearch (the city field) fetches its suggestions on mount — resolve empty.
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

const S = he.settings;

function renderTab(user) {
  userRef.current = { id: 1, name: "דנה", email: "d@example.com", ...user };
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProfileTab />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Settings phone — disabled Save always shows why (MEH-1261 F4)", () => {
  it("a saved-invalid phone surfaces the field error on mount", () => {
    renderTab({ phone: "12345" });

    expect(screen.getByText(S.profile.field_phone_error)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: S.common.save_cta }),
    ).toBeDisabled();
  });

  it("pasting an invalid phone surfaces the error without blur", () => {
    renderTab({ phone: "" });
    const input = screen.getByPlaceholderText("050-1234567");

    // Paste = completed entry: paste event + the change it produces.
    fireEvent.paste(input, { clipboardData: { getData: () => "12345" } });
    fireEvent.change(input, { target: { value: "12345" } });

    expect(screen.getByText(S.profile.field_phone_error)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: S.common.save_cta }),
    ).toBeDisabled();
  });

  it("typing an invalid phone shows no error until blur (MEH-1190 UX kept)", () => {
    renderTab({ phone: "" });
    const input = screen.getByPlaceholderText("050-1234567");

    fireEvent.change(input, { target: { value: "05" } });

    expect(screen.queryByText(S.profile.field_phone_error)).not.toBeInTheDocument();

    fireEvent.blur(input);
    expect(screen.getByText(S.profile.field_phone_error)).toBeInTheDocument();
  });
});
