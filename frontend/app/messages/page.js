import Link from "next/link";

export const metadata = {
  title: "הודעות | מהמקור",
  description: "התקשורת במהמקור מתבצעת ישירות בווטסאפ עם בית העסק.",
};

export default function MessagesPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-4" aria-hidden>💬</div>
      <h1 className="text-2xl font-bold mb-3">איך עובדת התקשורת במהמקור?</h1>
      <p className="text-text-secondary leading-relaxed mb-6">
        אין צ׳אט פנימי באפליקציה — אנחנו מאמינים בקשר ישיר ואמיתי בין הקונה לבית העסק.
        בכל כרטיסיית עסק תמצאו כפתור ווטסאפ שיחבר אתכם ישירות לבעל העסק.
      </p>
      <div className="bg-white border border-border rounded-[12px] p-5 text-right mb-8">
        <h2 className="font-semibold mb-2">למה ככה?</h2>
        <ul className="text-sm text-text-secondary space-y-2">
          <li>✓ אין מתווכים — אתם מדברים עם האדם שגידל / הכין / אופה</li>
          <li>✓ מסכמים על מחיר, משלוח וזמינות באופן אישי</li>
          <li>✓ בונים יחסי אמון אמיתיים עם בית העסק</li>
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/map"
          className="bg-primary text-white px-6 py-3 rounded-[12px] font-medium hover:bg-primary-dark transition"
        >
          🗺️ גלי בתי עסק במפה
        </Link>
        <Link
          href="/favorites"
          className="border border-border text-text-primary px-6 py-3 rounded-[12px] font-medium hover:bg-gray-50 transition"
        >
          ❤️ המועדפים שלי
        </Link>
      </div>
    </div>
  );
}
