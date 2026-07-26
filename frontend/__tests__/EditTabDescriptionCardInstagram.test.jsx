/**
 * MEH-1261 F5 — the DescriptionCard instagram field persists on save.
 *
 * Before the fix, the instagram input (inside the AI-assist form) was seeded
 * from `profile.instagram` and editable, but `save()` sent only
 * {description, short_description} — the edit fed the generate payload and was
 * silently dropped on save (the one rendered field whose edit did not persist).
 * The backend owner whitelist already accepts `instagram`
 * (producer_me.py _PRODUCER_WRITABLE_FIELDS).
 *
 * Locked behavior under test:
 *   - editing ONLY instagram makes the card dirty (save button enables) and
 *     save PUTs {description, short_description, instagram}
 *   - onSave reports the new instagram so the parent profile stays in sync
 *   - clearing the field saves instagram as null
 *
 * REUSES: __tests__/EditTabDescriptionCard.test.jsx harness (real
 * NextIntlClientProvider + he.json, api/toast mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { DescriptionCard } from "@/app/[locale]/producer/dashboard/edit/cards";

// MEH-1306: cards.jsx now imports @/i18n/navigation (view-on-page link);
// mock it so createNavigation's next/navigation import never loads in jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const D = he.dashboard.producer.description_card;

function renderCard(profile = {}) {
  const onSave = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <DescriptionCard profile={profile} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

const openAssist = () =>
  fireEvent.click(screen.getByRole("button", { name: D.assist_cta }));
// MEH-1608: the placeholder is now the i18n handle-shaped example — the old
// hardcoded "https://instagram.com/…" instructed the exact value that broke
// the public link (the client still SENDS whatever was typed; the server
// normalizes URL/@ forms to a bare handle on save).
const instagramInput = () => screen.getByPlaceholderText("maafiat_hasade");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DescriptionCard — instagram persists on save (MEH-1261 F5)", () => {
  it("an instagram-only edit enables save and lands in the PUT payload + onSave", async () => {
    api.put.mockResolvedValueOnce({});
    const { onSave } = renderCard({ description: "תיאור קיים" });

    // Untouched card → save disabled (not dirty).
    expect(screen.getByRole("button", { name: D.save_cta })).toBeDisabled();

    openAssist();
    fireEvent.change(instagramInput(), {
      target: { value: "https://instagram.com/mehamakor" },
    });

    const saveBtn = screen.getByRole("button", { name: D.save_cta });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);
    await screen.findByRole("button", { name: D.saved });

    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      description: "תיאור קיים",
      short_description: null,
      instagram: "https://instagram.com/mehamakor",
    });
    expect(onSave).toHaveBeenCalledWith({
      description: "תיאור קיים",
      short_description: null,
      instagram: "https://instagram.com/mehamakor",
    });
  });

  it("clearing a seeded instagram saves null", async () => {
    api.put.mockResolvedValueOnce({});
    renderCard({
      description: "תיאור קיים",
      instagram: "https://instagram.com/old",
    });

    openAssist();
    fireEvent.change(instagramInput(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
    await screen.findByRole("button", { name: D.saved });

    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      description: "תיאור קיים",
      short_description: null,
      instagram: null,
    });
  });
});
