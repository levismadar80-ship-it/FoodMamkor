/**
 * Workshop-404 bug (found reviewing PR #4553, MEH-2977): a host who had just
 * created a workshop was sent to /experiences/<id>?pending=1 and got «לא מצאנו
 * את הדף הזה». The page's server fetch is anonymous and the backend hides a
 * pending item from anonymous callers, so the page called notFound() before
 * the client — which asks with her token — could run. Same for the dashboard
 * and admin "view" links to group buys and workshops.
 *
 * Now ?preview=1 (and the after-create ?pending=1) makes a missing-to-anonymous
 * item render the client with noindex metadata instead of a 404. Without the
 * flag nothing changes: the CONTROL rows keep the real 404.
 *
 * DISCRIMINATION: against the old pages every "renders" row threw
 * NEXT_NOT_FOUND, so each fails on them; the control rows stop "never 404".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal()),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/server-fetch", () => ({ serverFetch: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key) => key) }));
vi.mock("@/app/[locale]/experiences/[id]/ExperienceDetailClient", () => ({ default: () => null }));
vi.mock("@/app/[locale]/group-buys/[id]/GroupBuyDetailClient", () => ({ default: () => null }));

import { serverFetch } from "@/lib/server-fetch";
import { isOwnerPreview } from "@/lib/owner-preview";
import ExperiencePage, { generateMetadata as experienceMetadata } from "@/app/[locale]/experiences/[id]/page";
import GroupBuyPage, { generateMetadata as groupBuyMetadata } from "@/app/[locale]/group-buys/[id]/page";

const ID = "00000000-0000-0000-0000-000000000000";
const missing = () => ({ status: 404, statusText: "x", ok: false, json: async () => null });
const propsFor = (search) => ({
  params: Promise.resolve({ id: ID, locale: "he" }),
  searchParams: Promise.resolve(search),
});

beforeEach(() => serverFetch.mockReset().mockResolvedValue(missing()));

describe("isOwnerPreview", () => {
  it.each([
    [{ preview: "1" }, true],
    [{ pending: "1" }, true],
    [new URLSearchParams("preview=1"), true],
    [{}, false],
    [{ preview: "0" }, false],
    [new URLSearchParams(""), false],
    [undefined, false],
  ])("%o → %s", (params, expected) => {
    expect(isOwnerPreview(params)).toBe(expected);
  });
});

describe.each([
  ["experiences", ExperiencePage, experienceMetadata],
  ["group-buys", GroupBuyPage, groupBuyMetadata],
])("/%s/<id> hidden from anonymous", (_name, Page, metadata) => {
  it.each([{ preview: "1" }, { pending: "1" }])("with %o the page renders, noindex", async (search) => {
    const meta = await metadata(propsFor(search));
    expect(meta.robots).toEqual({ index: false, follow: false });
    await expect(Page(propsFor(search))).resolves.toBeTruthy();
  });
  it("control: without the flag it is still a real 404", async () => {
    await expect(metadata(propsFor({}))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(Page(propsFor({}))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
