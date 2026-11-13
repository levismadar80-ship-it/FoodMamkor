/**
 * SectionHeading — the one heading for a row/section of a page (MEH-3020).
 *
 * Module:   SectionHeading
 * Purpose:  Every sibling row on the home page carries the same h2 size, so no
 *           row reads as more important than the others because of its file.
 *           One step: `headline-lg` (Frank Ruhl 900, 32px — tailwind.tokens.json),
 *           the size the main rows («בתי עסק מקומיים», «מה קורה») already used.
 * Does NOT: set margins or alignment — pass `className` for layout only.
 * Why:      until 13/11 each home row picked its own size (24 / 32 / 48 and a
 *           20px sans caption). MEH-1073 (#1562) snapped each hand-written
 *           clamp() to its nearest token one file at a time, so the categories
 *           row inherited the h1 display size (48px). Nothing shared owned the
 *           size, so nothing could notice. `HomeSectionHeadingGuard.test.js`
 *           now fails on a hand-sized h2 in the home files.
 * Related:  Heading.jsx (generic scale), DESIGN.md «Headlines».
 *
 * @example
 * <SectionHeading id="x-heading">עכשיו בעונה</SectionHeading>
 */
export const SECTION_HEADING_CLASSES = "font-headline-lg text-headline-lg font-black text-text";

export default function SectionHeading({ as: Tag = "h2", className = "", children, ...rest }) {
  return (
    <Tag
      data-section-heading=""
      className={className ? `${SECTION_HEADING_CLASSES} ${className}` : SECTION_HEADING_CLASSES}
      {...rest}
    >
      {children}
    </Tag>
  );
}
