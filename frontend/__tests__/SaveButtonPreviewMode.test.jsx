/**
 * MEH-2969 — the event / experience heart (SaveButton) is a visitor control,
 * the same class as the business heart and share button that the owner's
 * preview already hides (Sapir 11/11, MEH-2916). It reached the preview
 * through ProducerSections → ProducerActivities → EventEntryRow, which is why
 * the gate sits inside SaveButton: usePreviewMode() is false outside the
 * provider, so every other surface is unchanged.
 *
 * Preview + control, and the control counts exactly (MEH-2964: a `> 0`
 * control made the case empty).
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PreviewModeProvider } from "@/lib/preview-mode";

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});

import SaveButton from "@/components/SaveButton";

const hearts = (container) => container.querySelectorAll('[data-testid^="save-"][aria-pressed]');

describe("SaveButton in the owner's preview (MEH-2969)", () => {
  it.each(["event", "experience", "recipe"])("a %s heart is hidden inside the preview", (itemType) => {
    const { container } = render(
      <PreviewModeProvider>
        <SaveButton itemType={itemType} itemId="i-1" variant="row" />
      </PreviewModeProvider>,
    );
    expect(hearts(container)).toHaveLength(0);
  });

  it.each(["event", "experience", "recipe"])("control: a %s heart shows exactly once outside the preview", (itemType) => {
    const { container } = render(<SaveButton itemType={itemType} itemId="i-1" variant="row" />);
    expect(hearts(container)).toHaveLength(1);
  });
});
