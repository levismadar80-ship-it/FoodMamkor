/**
 * SectionHeading — the one heading for a section of a page (MEH-3020).
 *
 * Module:   SectionHeading
 * Purpose:  A section's h2 takes its size from a named ROLE, never from
 *           classes written at the call site. Two roles (DESIGN.md «Section
 *           headings»):
 *             size="page"    (default) a row on a front / landing page — home,
 *                            /about, /about/process, /join. headline-lg,
 *                            Frank Ruhl 900, 32px.
 *             size="content" a section inside a content page — business page,
 *                            event, recipe, legal pages. Frank Ruhl 700, 24px.
 *           Card, sheet, dialog and form-step titles are not section headings
 *           and stay out of this component.
 * Does NOT: take a size, weight or family class — `className` is for layout
 *           (margin, alignment, width, leading) and an optional text colour,
 *           which replaces the default ink.
 * Why:      until 13/11 each section chose its own size: on home 24 / 32 / 48
 *           and a 20px sans caption, «גלו לפי קטגוריה» at the h1 display size;
 *           across the site 18 / 20 / 24 and four different clamp() ranges.
 *           MEH-1073 (#1562) snapped each hand-written clamp() to its nearest
 *           token one file at a time, so nothing shared owned the size.
 *           Guards: HomeSectionHeadingGuard.test.js (home, no raw h2) and
 *           SectionHeadingRatchet.test.js (site, the count only shrinks).
 * Related:  Heading.jsx (generic scale), tailwind.tokens.json (headline-lg).
 *
 * @example
 * <SectionHeading id="x-heading">עכשיו בעונה</SectionHeading>
 * <SectionHeading size="content" className="mb-4">שעות פתיחה</SectionHeading>
 */
const SECTION_HEADING_ROLES = {
  page: "font-headline-lg text-headline-lg font-black",
  content: "font-headline-md text-2xl font-bold",
};
export const SECTION_HEADING_CLASSES = `${SECTION_HEADING_ROLES.page} text-text`;

// A text-* class that is a colour, not a size step.
const COLOR = /(^|\s)text-(?!(?:2xs|xs|sm|base|lg|xl|[2-9]xl|headline-|body-|label-|center|start|end|left|right|balance|pretty|wrap|nowrap|ellipsis|clip|\[))[a-z]/;

export default function SectionHeading({ as: Tag = "h2", size = "page", className = "", children, ...rest }) {
  const role = SECTION_HEADING_ROLES[size] || SECTION_HEADING_ROLES.page;
  const ink = COLOR.test(className) ? "" : " text-text";
  return (
    <Tag
      data-section-heading={size}
      className={`${role}${ink}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
