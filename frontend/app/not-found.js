"use client";

import Image from "next/image";
import Link from "next/link";
import { Leaf } from "@phosphor-icons/react";

export default function NotFound() {
  return (
    <main className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <Link href="/" className="inline-block mb-8" tabIndex={-1} aria-hidden="true">
          <Image src="/logo.png" alt="מהמקור" width={120} height={40} className="mx-auto" />
        </Link>
        <Leaf
          size={72}
          weight="duotone"
          color="#2e6853"
          className="mx-auto mb-5"
          aria-hidden="true"
        />
        <p className="text-primary font-medium text-sm tracking-widest mb-2">404</p>
        <h1 className="font-headline text-4xl font-bold text-site-text mb-3">
          לא מצאנו את הדף הזה
        </h1>
        <p className="text-site-muted text-lg mb-8 leading-relaxed">
          יכול להיות שהקישור פג תוקף, או שהדף עבר לכתובת אחרת.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-light transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            חזרי לדף הבית
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
