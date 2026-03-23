"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function UpgradePage() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="bg-white rounded-[12px] p-8 text-center">
        <div className="text-5xl mb-4">⭐</div>
        <h1 className="text-3xl font-bold mb-2">שדרגו לפרמיום</h1>
        <p className="text-text-secondary mb-8">קבלו יותר חשיפה ויותר אפשרויות לעסק שלכם</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Free Plan */}
          <div className="border rounded-[12px] p-6">
            <h3 className="font-semibold text-lg mb-1">חינם</h3>
            <p className="text-3xl font-bold text-primary mb-4">₪0</p>
            <ul className="text-right text-sm space-y-2 text-text-secondary">
              <li>✓ הופעה במפה</li>
              <li>✓ עד 3 תמונות</li>
              <li>✓ פרטי קשר</li>
              <li>✓ אזורי משלוח</li>
              <li className="text-gray-300">✗ מוצרים ללא הגבלה</li>
              <li className="text-gray-300">✗ תמונות ללא הגבלה</li>
              <li className="text-gray-300">✗ סטטיסטיקות</li>
            </ul>
          </div>

          {/* Premium Plan */}
          <div className="border-2 border-secondary rounded-[12px] p-6 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary text-white text-xs px-3 py-1 rounded-full">
              מומלץ
            </span>
            <h3 className="font-semibold text-lg mb-1">פרמיום</h3>
            <p className="text-3xl font-bold text-secondary mb-4">בקרוב</p>
            <ul className="text-right text-sm space-y-2 text-text-secondary">
              <li>✓ הופעה במפה</li>
              <li>✓ תמונות ללא הגבלה</li>
              <li>✓ פרטי קשר</li>
              <li>✓ אזורי משלוח</li>
              <li>✓ רשימת מוצרים מלאה</li>
              <li>✓ סטטיסטיקות צפיות</li>
              <li>✓ תגית פרמיום</li>
            </ul>
          </div>
        </div>

        <p className="text-text-secondary text-sm mb-4">
          שדרוג לפרמיום יהיה זמין בקרוב. רוצים להיות הראשונים לדעת?
        </p>
        <button
          onClick={() => router.push("/")}
          className="bg-primary text-white px-8 py-3 rounded-[12px] hover:bg-primary-light transition"
        >
          חזרה לדף הבית
        </button>
      </div>
    </div>
  );
}
