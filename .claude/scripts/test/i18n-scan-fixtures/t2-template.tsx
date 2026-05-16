// T2 — template-literal Hebrew with interpolation.
// Expected: 1 finding via HEBREW_STR_RE group 3 (backtick capture).
export function T2(userName: string) {
  const greeting = `שלום ${userName}`;
  return greeting;
}
