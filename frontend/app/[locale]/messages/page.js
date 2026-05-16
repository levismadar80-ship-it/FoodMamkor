import Link from "next/link";

export const metadata = {
  title: "הודעות | מהמקור",
  description: "התקשורת במהמקור מתבצעת ישירות בווטסאפ עם בית העסק.",
};

export default function MessagesPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-4" aria-hidden="true">💬</div>
      <h1 className="font-headline text-2xl font-bold text-site-text mb-3">
        איך עובדת התקשורת במהמקור?
      </h1>
      <p className="text-site-muted leading-relaxed mb-6">
        אין צ׳אט פנימי באפליקציה — אנחנו מאמינים בקשר ישיר ואמיתי בין הקונה לבית העסק.
        בכל כרטיסיית עסק תמצאו כפתור ווטסאפ שיחבר אתכם ישירות לבעל העסק או לשכן המוכר.
      </p>
      <div className="bg-background border border-border rounded-[16px] p-5 text-right mb-8">
        <h2 className="font-semibold text-site-text mb-2">למה ככה?</h2>
        <ul className="text-sm text-site-muted space-y-2">
          <li>✓ אין מתווכים — אתם מדברים עם האדם שגידל / הכין / אופה</li>
          <li>✓ מסכמים על מחיר, משלוח וזמינות באופן אישי</li>
          <li>✓ בונים יחסי אמון אמיתיים עם בית העסק</li>
        </ul>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/map"
          className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          🗺️ גלי בתי עסק במפה
        </Link>
        <Link
          href="/favorites"
          className="border border-primary text-primary px-6 py-3 rounded-full hover:bg-light transition font-medium"
        >
          ❤️ המועדפים שלי
        </Link>
      </div>
    </div>
  );
}
