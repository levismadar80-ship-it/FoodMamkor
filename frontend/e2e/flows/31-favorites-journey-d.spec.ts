import { test, expect, type Page } from "@playwright/test";
import { pickProducer, detailPath, type FeedProducer } from "./_producer-fixture";

/**
 * Spec:     31-favorites-journey-d
 * Purpose:  MEH-215 journey D — saving a business to favourites, seeing it on
 *           /favorites, removing it, and the GUEST hand-off. Converts the
 *           card's manual D1–D3 checklist into assertions (ruling ספיר
 *           08/08/2026: manual QA becomes CC's, as Playwright specs).
 *           **Chunk D of 4.**
 * Does NOT: cover journey A (flows/29, merged), C (flows/30, merged), or B
 *           (Google OAuth — BLOCKED on a convention decision, see below).
 *           Does NOT assert the after-sign-in replay actually saves — that
 *           half is `covered-by-stub` and is NOT counted as covered (§stub
 *           boundary below).
 * Touches:  GET/POST/DELETE /api/users/me/favorites*, GET /api/auth/me — all
 *           intercepted, none reached. The producer FEED is real
 *           (`pickProducer` → GET /api/producers), so the cards under test are
 *           real rows. No storageState fixture and no DEMO_* secret, so this
 *           runs on the default CI target — same posture as chunks A and C.
 * Related:  components/FavoriteButton.jsx (detail surface),
 *           components/ProducerCard.jsx:65-160 (CardHeart, card surface),
 *           lib/favorites-cache.js (the SHARED cache both subscribe to),
 *           lib/pending-action.js + lib/post-login-action.js (two guest-intent
 *           stores — see the note on parallel mechanisms below),
 *           app/[locale]/favorites/FavoritesClient.jsx.
 * History:  MEH-215 (creation, chunk D).
 *
 * ── D3 WAS CONVERTED. Read this before "fixing" it to match the card ────────
 *
 * The card's D3 says: logged out → tap ❤️ → redirect to
 * `/login?return_to=/producers` → after signing in, return and the favourite
 * is saved. **That flow was removed deliberately by MEH-1334** and asserting
 * it would red this spec against correct code. Recorded on the card
 * (comment, 12/08) before this file was written, so the next session does not
 * re-derive it.
 *
 * What the code does today, and it differs BY SURFACE — which is why D3 is two
 * tests and not one generalised "guest click":
 *
 *   CardHeart      (ProducerCard.jsx:100-112)  → a TOAST carrying a
 *                                                `/login?redirect=<path>` CTA.
 *                                                Intent → `post_login_action`.
 *   FavoriteButton (FavoriteButton.jsx:104-108) → an in-place
 *                                                `LoginPromptModal`.
 *                                                Intent → `pending_action`.
 *
 * Neither NAVIGATES on the tap, and neither calls the API. The card's
 * "redirect" premise is half-right for the card surface only: the `?redirect=`
 * URL exists, but as a link inside a toast the user may ignore.
 *
 * ── Two parallel mechanisms own "finish the guest's save" (reported, not fixed)
 *
 * `post_login_action` (drained by `replayPostLoginAction`, auth-context.js:32)
 * and `pending_action` (drained by FavoriteButton's own effect,
 * FavoriteButton.jsx:93-101) are separate stores with separate keys and
 * separate drains. They do not clobber each other, and a tap on ONE surface
 * replays exactly once — which is what D3 asserts here.
 *
 * The residual risk this spec does NOT cover: a guest who taps BOTH surfaces
 * for the same producer arms both stores, and "exactly once" then rests on an
 * ordering guard — the replay calls `setFavoritedLocal(id, true)` and
 * FavoriteButton's effect skips its toggle only if `isFavoritedCache(id)`
 * already reads true. Lose that race and one intent becomes two POSTs.
 * Asserting it needs the mocked-sign-in convention chunk B is blocked on, so
 * it is stated here and reported on the card rather than half-tested.
 *
 * ── Stub boundary (ORDERS §1.5) ─────────────────────────────────────────────
 *
 * Every authenticated test below is signed in by STUB: a token written to
 * localStorage plus a mocked `/auth/me`. That is `covered-by-stub` — it
 * proves the favourites surfaces behave correctly GIVEN a session, and proves
 * nothing about obtaining one (chunk C owns that). The after-sign-in replay
 * is not exercised at all: D3 stops at the boundary — intent persisted, prompt
 * shown, zero API calls — and the replay itself stays uncovered until B's
 * convention is ratified by Sapir.
 *
 * ── Every D checkbox gets a verdict. Nothing is silently dropped ────────────
 *
 *  D1  ❤️ on a business saves it            covered (stubbed backend)
 *  D1  icon reflects the saved state        covered — AND asserted after the
 *                                           response settles, not on the
 *                                           optimistic paint (see D1)
 *  D1  it appears on /favorites             covered — the SECOND subscriber,
 *                                           required because the cache is
 *                                           shared (MEH-1325)
 *  D1  a failed save does not stick         covered — the discriminating case;
 *                                           without it a dead backend passes D1
 *  D2  removing it from /favorites          covered (stubbed backend)
 *  D2  the list empties                     covered
 *  D3  guest tap → prompt, nothing saved    covered, BOTH surfaces
 *  D3  intent survives for after sign-in    covered (the STORE is asserted)
 *  D3  after signing in it is saved         **covered-by-stub → NOT COUNTED.**
 *                                           Boundary stated above.
 *
 * ── On mocking, because this directory's CLAUDE.md says "no mocks" ──────────
 * Same reasoning as flows/28, /29 and /30, not a new exception: what is under
 * test is the FRONTEND's response to a fixed backend contract. One difference
 * worth naming — the favourites mock here is STATEFUL (a POST mutates the set
 * a later GET returns). A stateless mock would have made /favorites echo a
 * fixture rather than the save under test, i.e. green whether or not the POST
 * ever carried the right id. That is the "green with two causes" shape this
 * repo keeps paying for.
 */

/** Fixtures, not credentials — spelled `example-*` for secrets-scan-guard.sh. */
const STUB_TOKEN = "example-journey-d-token";
const STUB_USER_ID = "00000000-0000-0000-0000-0000000000d1";

/** Locked copy. Literals on purpose — reading these out of `messages/he.json`
 *  and comparing against a render OF that file is green whether the copy is
 *  right or wrong. Same call flows/29 and /30 made. */
const GUEST_TOAST = "שמרתי — התחברו לראות את כל המועדפים שלך";
const GUEST_TOAST_CTA = "התחברו";

/**
 * The detail heart, located in a way that survives BOTH things that vary.
 *
 * 1. The accessible name FLIPS on save — `label = favorited ? remove_aria :
 *    add_aria` (FavoriteButton.jsx:165). A locator pinned to "הוסיפו למועדפים"
 *    stops matching the moment the click succeeds, so the post-click assertion
 *    would fail against a CORRECT app. Matching either name keeps one stable
 *    handle across the toggle.
 * 2. There are three mounts and which one is VISIBLE depends on the viewport:
 *    ProducerHeader's `variant="quiet"` lives in `hidden lg:flex`
 *    (ProducerHeader.jsx:315) so it does not render on the `mobile` project at
 *    all, while ImageGallery mounts one for each breakpoint. Filtering to the
 *    visible element is what lets this spec run on both projects instead of
 *    being desktop-only — the alternative (a project skip) would drop the
 *    PRIMARY surface.
 *
 * `aria-label` overrides the visible text, so the variant's own label
 * ("שמירה" / "שמרו") is irrelevant here.
 */
const FAV_ARIA = /הוסיפו למועדפים|הסר ממועדפים/;

function favHeart(page: Page) {
  return page.getByRole("button", { name: FAV_ARIA }).filter({ visible: true }).first();
}

type FavCall = { method: string; id: string | null };

type FavStore = {
  /** Server-side truth the mock maintains, so a GET reflects the POST. */
  ids: Set<string>;
  /** Only favourites-list / favourite-mutation calls. Alerts are excluded. */
  calls: FavCall[];
  /** Flip to make the next POST fail — the D1 revert case. */
  failPost: boolean;
  /** The row the /favorites PAGE renders (needs the nested producer). */
  producer: FeedProducer | null;
};

function newStore(producer: FeedProducer | null = null): FavStore {
  return { ids: new Set(), calls: [], failPost: false, producer };
}

/**
 * A signed-in session, by stub. `auth-context.js:61` reads the token from
 * localStorage on boot, so it must be written BEFORE the first navigation —
 * `addInitScript` runs on every document, including client-side navigations.
 */
async function stubSignedIn(page: Page) {
  await page.addInitScript((token) => {
    window.localStorage.setItem("token", token);
  }, STUB_TOKEN);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: STUB_USER_ID,
        email: "journey-d@example.com",
        name: "יעל",
        role: "user",
        city: null,
      }),
    }),
  );
}

/**
 * Stateful favourites backend. One route, explicit branching — registering a
 * second, narrower route for `/alerts` would depend on Playwright's
 * last-registered-wins ordering, which is not worth resting an assertion on.
 *
 * The GET body carries BOTH shapes the app needs from this one endpoint:
 * `producer_id` for lib/favorites-cache.js (FavoritesResponseSchema) and the
 * nested `producer` for the /favorites page row (FavoriteWithProducerSchema).
 */
async function mockFavorites(page: Page, store: FavStore) {
  await page.route(/\/api\/users\/me\/favorites(?:\/|\?|$)/, async (route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;

    // /favorites/{id}/alerts — a different resource. Answer it so the inline
    // panel does not error, but do NOT count it: the zero-calls assertions in
    // D3 are about SAVING, and counting alerts would make them lie.
    if (/\/favorites\/[^/]+\/alerts$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false }),
      });
    }

    const m = path.match(/\/favorites\/([^/]+)$/);
    const id = m ? decodeURIComponent(m[1]) : null;
    store.calls.push({ method, id });

    if (method === "GET" && !id) {
      const rows = [...store.ids].map((pid) => ({
        producer_id: pid,
        created_at: "2026-08-12T00:00:00Z",
        producer:
          store.producer && String(store.producer.id) === String(pid)
            ? store.producer
            : { id: pid, name: "עסק" },
      }));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows),
      });
    }

    if (method === "POST" && id) {
      if (store.failPost) {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "stubbed failure" }),
        });
      }
      store.ids.add(id);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }

    if (method === "DELETE" && id) {
      store.ids.delete(id);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }

    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

/** Any producer will do for favourites; `pickProducer` sorts by id, so the
 *  choice is deterministic across runs. */
const ANY_PRODUCER = {
  label: "any producer (favourites are not gated on a producer attribute)",
  matches: () => true,
};

test.describe("MEH-215 journey D — favourites", () => {
  test("D1: saving from the detail page persists past the optimistic paint, and reaches /favorites", async ({
    page,
    request,
  }) => {
    const producer = await pickProducer(request, ANY_PRODUCER);
    const store = newStore(producer);

    await stubSignedIn(page);
    await mockFavorites(page, store);
    await page.goto(detailPath(producer));

    const heart = favHeart(page);
    await expect(heart).toBeVisible();

    // Wait for the ROUND-TRIP, not the paint. FavoriteButton.jsx:113-117 flips
    // local state and the shared cache BEFORE the request and reverts on
    // failure, so an assertion taken immediately after the click passes even
    // when the save fails. This is the half that survives the revert window.
    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/api\/users\/me\/favorites\/[^/]+$/.test(new URL(r.url()).pathname),
      ),
      heart.click(),
    ]);
    expect(saveResponse.status()).toBe(200);

    const posts = store.calls.filter((c) => c.method === "POST");
    expect(posts, "one tap must issue exactly one POST").toHaveLength(1);
    expect(
      String(posts[0].id),
      "the POST must carry THIS producer's id, not an arbitrary one",
    ).toBe(String(producer.id));

    // Settled state, after the response resolved.
    await expect(heart).toHaveAttribute("aria-pressed", "true");

    // SECOND SUBSCRIBER. The cache is shared (MEH-1325), so the clicked heart
    // alone proves nothing — /favorites reads the same source, and because the
    // mock is stateful this reflects the POST above rather than a fixture.
    await page.goto("/favorites");
    await expect(page.getByTestId("producer-card")).toHaveCount(1);
    await expect(page.getByTestId("producer-card").first()).toContainText(
      producer.name ?? "",
    );
  });

  test("D1-revert: a REJECTED save does not stick — the heart reverts and /favorites stays empty", async ({
    page,
    request,
  }) => {
    // The discriminating case. Without it, D1 passes against a backend that
    // accepts nothing: the optimistic paint alone would carry the assertion.
    const producer = await pickProducer(request, ANY_PRODUCER);
    const store = newStore(producer);
    store.failPost = true;

    await stubSignedIn(page);
    await mockFavorites(page, store);
    await page.goto(detailPath(producer));

    const heart = favHeart(page);
    await expect(heart).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/api\/users\/me\/favorites\/[^/]+$/.test(new URL(r.url()).pathname),
      ),
      heart.click(),
    ]);

    await expect(
      heart,
      "a 500 must revert the optimistic fill (FavoriteButton.jsx reverts both state and cache)",
    ).toHaveAttribute("aria-pressed", "false");

    await page.goto("/favorites");
    await expect(page.getByTestId("producer-card")).toHaveCount(0);
  });

  test("D2: removing from /favorites issues a DELETE and empties the list", async ({
    page,
    request,
  }) => {
    const producer = await pickProducer(request, ANY_PRODUCER);
    const store = newStore(producer);
    store.ids.add(String(producer.id)); // already saved

    await stubSignedIn(page);
    await mockFavorites(page, store);
    await page.goto("/favorites");

    const card = page.getByTestId("producer-card").first();
    await expect(card).toBeVisible();

    const [deleteResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "DELETE" &&
          /\/api\/users\/me\/favorites\/[^/]+$/.test(new URL(r.url()).pathname),
      ),
      card.getByTestId("card-heart").click(),
    ]);
    expect(deleteResponse.status()).toBe(200);

    const deletes = store.calls.filter((c) => c.method === "DELETE");
    expect(deletes, "one tap must issue exactly one DELETE").toHaveLength(1);
    expect(String(deletes[0].id)).toBe(String(producer.id));
    expect(store.ids.has(String(producer.id))).toBe(false);

    // The list must actually empty. Without this the verdict table's "D2 the
    // list empties — covered" was a claim nothing checked: a regression that
    // left the removed card on screen (cache not invalidated, list not
    // re-rendered) passed green on the DELETE assertions alone.
    await expect(page.getByTestId("producer-card")).toHaveCount(0);
  });

  test("D3a (guest, CARD): tap arms the intent and prompts to sign in — and saves NOTHING", async ({
    page,
  }) => {
    // No stubSignedIn: this is a guest. The favourites routes are still
    // mocked so that a call, if one were made, is COUNTED rather than
    // silently 401'd by the real backend — the assertion is "zero calls",
    // and it needs an instrument that would have recorded a call.
    const store = newStore();
    await mockFavorites(page, store);
    await page.goto("/producers");

    const heart = page.getByTestId("card-heart").first();
    await expect(heart).toBeVisible();
    await heart.click();

    // The prompt: a toast with a login CTA (ProducerCard.jsx:106-112).
    await expect(page.getByText(GUEST_TOAST)).toBeVisible();
    const cta = page.getByRole("link", { name: GUEST_TOAST_CTA });
    await expect(cta).toHaveAttribute("href", /\/login\?redirect=/);

    // The intent survives for after sign-in (post_login_action.js:14-21).
    const intent = await page.evaluate(() =>
      window.sessionStorage.getItem("post_login_action"),
    );
    expect(intent, "the guest's intent must be armed for the replay").toMatch(
      /^favorite:.+/,
    );

    // Nothing was saved. This is the assertion the whole test exists for.
    expect(
      store.calls,
      "a guest tap must not reach the favourites API at all",
    ).toEqual([]);

    // BOUNDARY (covered-by-stub, NOT counted): that signing in now replays
    // this intent exactly once is NOT asserted here — it needs the mocked
    // sign-in convention chunk B is blocked on.
  });

  test("D3b (guest, DETAIL): tap opens the login modal and saves NOTHING", async ({
    page,
    request,
  }) => {
    const producer = await pickProducer(request, ANY_PRODUCER);
    const store = newStore(producer);
    await mockFavorites(page, store);
    await page.goto(detailPath(producer));

    const heart = favHeart(page);
    await expect(heart).toBeVisible();

    // Captured BEFORE the click. Comparing page.url() to itself afterwards
    // would be true no matter what the app did — the defect class this repo
    // names as "an assertion entailed by its own surroundings".
    const pathBefore = new URL(page.url()).pathname;
    await heart.click();

    // The prompt: an in-place modal, NOT a navigation (FavoriteButton.jsx:104-108).
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      new URL(page.url()).pathname,
      "the tap must not navigate — the modal opens in place",
    ).toBe(pathBefore);

    // A DIFFERENT store from the card surface — see the parallel-mechanisms
    // note in the header. Asserting the shape catches a future unification
    // that silently drops one of the two drains.
    const raw = await page.evaluate(() =>
      window.sessionStorage.getItem("pending_action"),
    );
    expect(raw, "the guest's intent must be armed for the replay").toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.type).toBe("favorite");
    expect(String(parsed.producerId)).toBe(String(producer.id));

    expect(
      store.calls,
      "a guest tap must not reach the favourites API at all",
    ).toEqual([]);
  });
});
