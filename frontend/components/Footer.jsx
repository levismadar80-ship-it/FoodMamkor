"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import api from "@/lib/api";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState("");

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setMessage("");
    try {
      await api.post("/newsletter", { email });
      setStatus("success");
      setMessage("נרשמת! 🌱");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.detail || "שגיאה — נסי שוב");
    }
  };

  return (
    <footer className="bg-primary-dark text-light mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          {/* Brand */}
          <div>
            <Link href="/">
              <Image
                src="/logo-footer.png"
                alt="מהמקור"
                width={140}
                height={52}
                className="mb-4 brightness-0 invert"
              />
            </Link>
            <p className="text-light/80 text-sm leading-relaxed max-w-xs">
              אוכל אמיתי, ישר מהמקור אליך. פלטפורמה שמחברת בין יצרנים מקומיים לבתי ישראליים.
            </p>
          </div>

          {/* Nav */}
          <div>
            <h3 className="font-serif text-lg font-bold mb-4 text-white">ניווט</h3>
            <nav className="flex flex-col gap-2 text-sm text-light/80">
              <Link href="/" className="hover:text-white transition">דף הבית</Link>
              <Link href="/map" className="hover:text-white transition">מפה</Link>
              <Link href="/about" className="hover:text-white transition">אודות</Link>
              <Link href="/terms" className="hover:text-white transition">תנאי שימוש</Link>
              <Link href="/register/producer" className="hover:text-white transition">הוסף את העסק שלך</Link>
            </nav>

            {/* Instagram */}
            <a
              href="https://www.instagram.com/mehamekor"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-5 text-light/90 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.332 3.608 1.308.975.975 1.246 2.242 1.308 3.608.058 1.266.070 1.646.070 4.850s-.012 3.584-.070 4.850c-.062 1.366-.333 2.633-1.308 3.608-.975.975-2.242 1.246-3.608 1.308-1.266.058-1.646.070-4.850.070s-3.584-.012-4.850-.070c-1.366-.062-2.633-.333-3.608-1.308-.975-.975-1.246-2.242-1.308-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.070-4.850c.062-1.366.333-2.633 1.308-3.608C4.516 2.567 5.783 2.296 7.150 2.234 8.416 2.175 8.796 2.163 12 2.163zm0 1.837c-3.150 0-3.523.012-4.765.069-.957.044-1.476.204-1.822.339-.458.178-.785.390-1.128.734-.344.344-.556.670-.734 1.128-.135.346-.295.865-.339 1.822-.057 1.242-.069 1.615-.069 4.765s.012 3.523.069 4.765c.044.957.204 1.476.339 1.822.178.458.390.785.734 1.128.344.344.670.556 1.128.734.346.135.865.295 1.822.339 1.242.057 1.615.069 4.765.069s3.523-.012 4.765-.069c.957-.044 1.476-.204 1.822-.339.458-.178.785-.390 1.128-.734.344-.344.556-.670.734-1.128.135-.346.295-.865.339-1.822.057-1.242.069-1.615.069-4.765s-.012-3.523-.069-4.765c-.044-.957-.204-1.476-.339-1.822-.178-.458-.390-.785-.734-1.128-.344-.344-.670-.556-1.128-.734-.346-.135-.865-.295-1.822-.339-1.242-.057-1.615-.069-4.765-.069zm0 3.132A4.868 4.868 0 1 1 7.132 12 4.873 4.873 0 0 1 12 7.132zm0 8.03A3.162 3.162 0 1 0 8.838 12 3.166 3.166 0 0 0 12 15.162zm6.197-8.239a1.138 1.138 0 1 1-1.138-1.138 1.138 1.138 0 0 1 1.138 1.138z"/>
              </svg>
              <span className="font-sans">@mehamekor</span>
            </a>
          </div>

          {/* Newsletter */}
          <div>
            <h3 className="font-serif text-lg font-bold mb-2 text-white">הישארי מעודכנת</h3>
            <p className="text-light/80 text-sm mb-4">
              עדכונים על יצרנים חדשים, מתכונים ומה שמעניין — פעם בחודש לתיבה שלך.
            </p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="האימייל שלך"
                className="flex-1 bg-white/10 border border-white/25 text-white placeholder:text-white/50 rounded-[12px] px-4 py-2 outline-none focus:border-white"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="bg-light text-primary-dark px-5 py-2 rounded-[12px] hover:bg-white transition font-medium disabled:opacity-60"
              >
                {status === "loading" ? "..." : "הצטרפי"}
              </button>
            </form>
            {message && (
              <p
                className={`text-sm mt-3 ${status === "success" ? "text-light" : "text-red-300"}`}
              >
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-light/60">
          <p>© {new Date().getFullYear()} מהמקור. כל הזכויות שמורות.</p>
          <p>נעשה באהבה בישראל 🌿</p>
        </div>
      </div>
    </footer>
  );
}
