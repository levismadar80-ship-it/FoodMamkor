/**
 * MEH-2740: tests that mock next-intl with a key-echo `useTranslations` still
 * need the real Hebrew badge copy. They mock `@/lib/use-badge-copy` with this,
 * which reads the same messages/he.json the app ships — not a second copy.
 *
 *   vi.mock("@/lib/use-badge-copy", async () =>
 *     (await import("./helpers/he-badge-copy")).badgeCopyMock);
 */
import he from "../../messages/he.json";

export const heBadgeCopy = (badge) =>
  badge ? { ...badge, label: he.badges[badge.key].label, tooltip: he.badges[badge.key].tooltip } : badge;

export const badgeCopyMock = { useBadgeCopy: () => heBadgeCopy };
