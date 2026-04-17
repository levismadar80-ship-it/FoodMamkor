import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <p className="text-6xl mb-6">🌿</p>
      <h1 className="text-3xl font-bold mb-3">הדף לא נמצא</h1>
      <p className="text-text-secondary mb-8">
        נראה שהגעת לדף שכבר לא קיים או שהכתובת שגויה.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/"
          className="bg-primary text-white px-6 py-3 rounded-[12px] font-medium hover:bg-primary-dark transition"
        >
          חזרה לדף הבית
        </Link>
        <Link
          href="/map"
          className="border border-border text-text-primary px-6 py-3 rounded-[12px] font-medium hover:bg-gray-50 transition"
        >
          חפשי בתי עסק
        </Link>
      </div>
    </div>
  );
}
