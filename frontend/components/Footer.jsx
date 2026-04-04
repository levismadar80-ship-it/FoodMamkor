import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <Link href="/">
            <Image src="/logo-footer.png" alt="מהמקור" width={127} height={48} />
          </Link>
          <nav className="flex gap-6 text-sm text-text-secondary">
            <Link href="/about" className="hover:text-primary transition">
              אודות
            </Link>
            <Link href="/terms" className="hover:text-primary transition">
              תנאי שימוש
            </Link>
            <Link href="/register/producer" className="hover:text-primary transition">
              הוסף את העסק שלך
            </Link>
          </nav>
          <p className="text-xs text-text-secondary">
            © {new Date().getFullYear()} מהמקור. כל הזכויות שמורות.
          </p>
        </div>
      </div>
    </footer>
  );
}
