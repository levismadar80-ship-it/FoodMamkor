/**
 * MEH-1428 chunk 2 (MEH-2330) — /p/[slug] is a redirect stub, and the owner's
 * "request a review" link is minted as `/p/{slug}?rt=<token>`
 * (producer_me.py get_review_invite_link). A redirect that drops the query
 * string delivers the customer to the business page WITHOUT the token, so the
 * review form never unlocks — for every business that has a slug.
 *
 * DISCRIMINATION: against origin/staging (`redirect(`/${params.slug}`)`) the
 * `rt` case fails; the bare-URL case passes in both worlds and is the control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a) => redirect(...a) }));

import ProducerVanityRedirect from "@/app/[locale]/p/[slug]/page";

const call = (slug, searchParams) =>
  ProducerVanityRedirect({
    params: Promise.resolve({ locale: "he", slug }),
    searchParams: Promise.resolve(searchParams),
  });

beforeEach(() => redirect.mockReset());

describe("/p/[slug] redirect keeps the query string", () => {
  it("control: a bare vanity URL redirects to /<slug>", async () => {
    await call("meshek", {});
    expect(redirect).toHaveBeenCalledWith("/meshek");
  });

  it("the review-invite token survives the redirect", async () => {
    await call("meshek", { rt: "eyJ.a.b" });
    expect(redirect).toHaveBeenCalledWith("/meshek?rt=eyJ.a.b");
  });

  it("every param survives, including repeated keys", async () => {
    await call("meshek", { rt: "t", utm_source: "wa", tag: ["a", "b"] });
    const target = redirect.mock.calls[0][0];
    const qs = new URLSearchParams(target.split("?")[1]);
    expect(target.startsWith("/meshek?")).toBe(true);
    expect(qs.get("rt")).toBe("t");
    expect(qs.get("utm_source")).toBe("wa");
    expect(qs.getAll("tag")).toEqual(["a", "b"]);
  });
});
