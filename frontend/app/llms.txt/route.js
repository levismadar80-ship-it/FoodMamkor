// @ts-check
/**
 * MEH-3953: /llms.txt, built from the live catalog so every approved business
 * is listed. Rebuilt at most once an hour. If the API is unreachable the
 * pages section is still served, without the businesses.
 */
import { fetchAllProducers } from "@/lib/all-producers";
import { buildLlmsTxt } from "@/lib/llms-txt";

export const revalidate = 3600;

export async function GET() {
  let producers = null;
  try {
    producers = await fetchAllProducers();
  } catch {
    producers = null;
  }
  return new Response(buildLlmsTxt(producers), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
