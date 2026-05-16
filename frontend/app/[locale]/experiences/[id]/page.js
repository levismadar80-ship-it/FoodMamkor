import { Suspense } from "react";
import ExperienceDetailClient from "./ExperienceDetailClient";

export const metadata = {
  title: "חוויה",
  description: "פרטי חוויה קהילתית במהמקור",
};

// ExperienceDetailClient uses useSearchParams() for the ?pending=1
// "just submitted" banner — wrap in Suspense per Next.js 14 rules.
export default function ExperienceDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-16 text-center text-site-muted">
          טוענת את החוויה...
        </div>
      }
    >
      <ExperienceDetailClient />
    </Suspense>
  );
}
