import { redirect } from "next/navigation";

// /p/[slug] → canonical vanity URL, redirects to /[slug]
// Keeps backwards-compat if we ever change the root slug routing.
export default function ProducerVanityRedirect({ params }) {
  redirect(`/${params.slug}`);
}
