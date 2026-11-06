/**
 * MEH-2748: tests that mock next-intl with a key-echo `useTranslations` still
 * need the real Hebrew chip copy. They mock `@/lib/use-chip-copy` with this,
 * which runs the REAL resolver (lib/chip-copy.js) over the same
 * messages/he.json the app ships — not a second copy of the strings.
 *
 *   vi.mock("@/lib/use-chip-copy", async () =>
 *     (await import("./helpers/he-chip-copy")).chipCopyMock);
 */
import he from "../../messages/he.json";
import { resolveChipCopy } from "@/lib/chip-copy";

/** Root-namespace translator over he.json (dotted path lookup). */
export const heT = (path) => path.split(".").reduce((node, part) => node?.[part], he);

export const heChipCopy = (chip) => resolveChipCopy(heT, chip);

/** Hebrew label of an axis key, e.g. heAxisLabel("vegan") → "מתאים לטבעונים". */
export const heAxisLabel = (key) => he.filter_axes[key].label;

export const chipCopyMock = { useChipCopy: () => heChipCopy };
