/**
 * MEH-3824: the Hebrew label of a FILTER_AXES entry, resolved the way
 * lib/chip-copy.js does. Most axes read `filter_axes.<key>.label`; an axis
 * named after a site section carries `labelKey` and reads that key instead.
 * Throws when the label is missing, so a spec never builds a locator with
 * `name: undefined` (which matches every button, MEH-2748).
 */
type Node = Record<string, unknown> | undefined;
const at = (root: unknown, path: string) =>
  path.split(".").reduce((n: unknown, p) => (n as Node)?.[p], root) as string | undefined;

export function heAxisCopy(
  he: unknown,
  key: string,
  axis: { labelKey?: string },
): { label: string; subtext: string | null } {
  const copy = (he as { filter_axes: Record<string, { label?: string; subtext?: string | null }> }).filter_axes[key];
  const label = axis.labelKey ? at(he, axis.labelKey) : copy?.label;
  if (!label) throw new Error(`he.json label for axis ${key} is missing — the spec cannot name the chip`);
  return { label, subtext: copy?.subtext ?? null };
}
