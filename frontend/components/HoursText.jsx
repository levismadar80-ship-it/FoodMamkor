// MEH-2604: free-text hours as the owner typed them («א׳–ה׳ 9:00–17:00»),
// rendered inside the RTL page with every time RANGE isolated left-to-right.
//
// Why the isolate: an en dash is a bidi-neutral character, so in an RTL
// paragraph «16:00–19:00» splits into two number runs that the browser lays
// out right-to-left — the reader sees «19:00–16:00». A hyphen-minus between
// digits happens to survive (it is a European separator), but owners type
// both, and the location form's own example uses the en dash.
//
// Pure presentation: the stored string is untouched, nothing is parsed or
// reformatted, and text outside a range stays in the page direction.

const TIME_RANGE_RE = /(\d{1,2}(?::\d{2})?\s*[–—-]\s*\d{1,2}(?::\d{2})?)/g;

export default function HoursText({ text }) {
  if (!text) return null;
  const parts = String(text).split(TIME_RANGE_RE);
  return parts.map((part, i) =>
    // split() with one capture group puts every match at an odd index.
    i % 2 === 1 ? (
      <span key={i} dir="ltr" className="inline-block">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
