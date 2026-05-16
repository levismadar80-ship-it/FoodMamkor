// T1 — string-literal Hebrew inside JSX text node.
// Expected: 1 finding via HEBREW_JSX_RE (>...< capture).
export default function T1() {
  return <div>שלום</div>;
}
