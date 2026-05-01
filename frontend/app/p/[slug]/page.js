import { redirect } from "next/navigation";

// /p/[slug] → canonical vanity URL, redirects to /[slug]
// Keeps backwards-compat if we ever change the root slug routing.
export default async function ProducerVanityRedirect(props) {
  const params = await props.params;
  redirect(`/${params.slug}`);
}
