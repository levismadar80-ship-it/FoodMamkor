// Dashboard status colours — one owner for the four "tools" spokes (MEH-1640).
//
// producer/dashboard/{events,experiences,group-buys,recipes}/page.js each
// carried its own ad-hoc status palette (bg-green-50 / yellow-100 / red-50 /
// red-100 / blue-50 / gray-100 / orange-50 …). They now consume these five
// sets, keyed by MEANING rather than by backend status string — each page maps
// its own enum onto them: approved / funded / fulfilled → success;
// pending / changes_requested / needs_revision / inactive → warning;
// rejected → error; open → info; cancelled / unknown → neutral.
//
// Each entry carries bg + text + border COLOUR. The border colour is inert
// until a consumer also adds `border` (group-buys pills, recipes notice boxes);
// the events / experiences pills are borderless and render exactly as before.
// Every utility here is a pre-existing token — `green-50` is the brand #eaf3de
// (tailwind.tokens.json), the rest are the Tailwind scale values the spokes
// already used. ADR-019 forbids raw hex, so none appears here.
//
// Colours only: no labels, no layout, no behaviour. Labels stay with each
// page's own i18n namespace.
export const STATUS_CLASSES = {
  success: "bg-green-50 text-primary border-primary/30",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  error: "bg-red-50 text-red-700 border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
};
