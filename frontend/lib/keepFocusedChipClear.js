// MEH-2537 (home) → shared with /producers by MEH-2569: a filter rail whose
// «סינון» trigger is sticky at its inline-start edge. A chip that takes focus
// while under that trigger is scrolled out from under it (WCAG 2.4.11).
// The lead sits at the inline-start edge: the RIGHT in he (overlap =
// chip.right − lead.left, scroll +x) and the LEFT in /en, which is dir=ltr
// (overlap = lead.right − chip.left, scroll −x). Skipped at lg+, where the
// trigger is not sticky and nothing overlaps. React focus events bubble
// through portals, so the day panel and the FilterSheet (React children of
// the row, DOM-outside it) land here too — only focus IN the row's DOM counts.
// Use as the rail's onFocus; the sticky lead must be its first child.
export function keepFocusedChipClear(e) {
  if (!e.currentTarget.contains(e.target)) return;
  const lead = e.currentTarget.firstElementChild;
  if (!lead || lead.contains(e.target) || getComputedStyle(lead).position !== "sticky") return;
  const chip = e.target.getBoundingClientRect();
  const l = lead.getBoundingClientRect();
  const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
  const overlap = rtl ? chip.right - l.left : l.right - chip.left;
  if (overlap > 0) e.currentTarget.scrollBy({ left: rtl ? overlap + 8 : -(overlap + 8) });
}
