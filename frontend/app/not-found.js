import Link from "next/link";

export const metadata = {
  title: "הדף לא נמצא | מהמקור",
  description: "הדף שחיפשת לא קיים",
};

/**
 * 404 page (ALL_PAGES_DESIGN.md עמוד 7).
 * Next.js automatically renders this for any route that doesn't match.
 */
export default function NotFound() {
  return (
    <main className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-7xl mb-4" aria-hidden="true">
          🌿
        </div>
        <h1 className="font-headline text-5xl font-bold text-site-text mb-3">404</h1>
        <p className="text-site-muted text-lg mb-8">
          הדף לא נמצא — אבל יש לנו הרבה בתי עסק טובים 🌱
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-light transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            חזרה לדף הבית
          </Link>
          <Link
            href="/map"
            className="border border-primary text-primary px-6 py-3 rounded-full hover:bg-light transition font-medium"
          >
            גלי עסקים במפה
          </Link>
        </div>
      </div>
    </main>
  );
}
