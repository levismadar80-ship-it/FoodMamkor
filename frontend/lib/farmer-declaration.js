// MEH-759 Chunk C (ADR-022 gate 2): agricultural categories that trigger the
// conditional grower declaration ("תוצרת שגידלתי בחלקתי בלבד"). Hebrew NAMES
// (IDs are seed-ordering-dependent) — must match backend/seed_data.py:15-16.
// One home for both places that ask for the declaration: producer
// registration and the owner-claim page (MEH-2324).
export const FARMER_DECLARATION_CATEGORIES = ["ירקות", "פירות"];

export function requiresFarmerDeclaration(categoryNames) {
  return (categoryNames || []).some((name) =>
    FARMER_DECLARATION_CATEGORIES.includes(name),
  );
}
