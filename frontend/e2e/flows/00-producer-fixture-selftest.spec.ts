import { test, expect } from "@playwright/test";
import { assertDetailRendered, watchPageErrors } from "./_producer-fixture";

/**
 * Self-test for `assertDetailRendered` — the classifier flows 03/04/06 rely on
 * to tell "the detail route did not render" from "the page is fine".
 *
 * `.claude/rules/testing.md`: *"Where the assertion is a classifier, ship the
 * self-test. Run it first: if the classifier can't tell a correct state from a
 * broken one, nothing it reports afterwards is worth reading. Exercise the REAL
 * implementation, never a copy."* Numbered `00` so it sorts first.
 *
 * Both directions are exercised on synthetic documents, so this is
 * deterministic and needs no seed and no test data: a healthy page must produce
 * silence, and Next's error document must produce a report that carries every
 * field a reader needs to act — the producer, the URL, the HTTP status, the
 * uncaught error, and the page's own text.
 *
 * It is NOT network-free, and saying so would be a false claim in a comment.
 * Case (b) drives `assertDetailRendered` into its failure branch, which fires
 * the sibling-route probe as a real request to `baseURL` (the job's local
 * `next start`, per e2e.yml — not staging). The probe's outcome cannot change
 * this test's verdict: its result is interpolated into a report the test only
 * greps for known substrings, and a connection failure is caught and rendered
 * as "probe failed". The determinism claim survives; the isolation claim had to
 * be narrowed to what is actually true.
 */
const ERROR_DOC =
  `<!doctype html><html id="__next_error__"><head><meta charset="utf-8"></head>` +
  `<body>404 — This page could not be found.` +
  `<script>setTimeout(()=>{throw new Error("BoomFromComponent")},10)</script></body></html>`;
const OK_DOC = `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>A real producer</h1></body></html>`;

// Never reached over the network — every request below is fulfilled by a route.
const UNUSED_ORIGIN = "http://localhost:9";

test.describe("_producer-fixture self-test", () => {
  test("assertDetailRendered is silent on a healthy page and reports on the error document", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    // (a) healthy document → returns without throwing.
    await page.route("**/ok-slug", (r) => r.fulfill({ contentType: "text/html", body: OK_DOC }));
    await page.goto(`${UNUSED_ORIGIN}/ok-slug`);
    await assertDetailRendered(
      page,
      { id: "p1", slug: "ok-slug", name: "Healthy" },
      "/ok-slug",
      pageErrors,
      200,
    );

    // (b) Next's error document → throws, and the report names every field.
    await page.route("**/bad-slug", (r) =>
      r.fulfill({ status: 404, contentType: "text/html", body: ERROR_DOC }),
    );
    await page.goto(`${UNUSED_ORIGIN}/bad-slug`);
    // Wait for the injected uncaught error to actually land, rather than
    // sleeping a guessed interval — the assertion below depends on it being
    // captured, so the wait must be on the thing itself.
    await expect.poll(() => pageErrors.some((e) => e.includes("BoomFromComponent"))).toBe(true);

    let message = "";
    try {
      await assertDetailRendered(
        page,
        { id: "p2", slug: "bad-slug", name: "Broken" },
        "/bad-slug",
        pageErrors,
        404,
      );
    } catch (e) {
      message = String((e as Error).message);
    }

    expect(message, "the classifier must throw on #__next_error__").not.toBe("");
    for (const field of [
      "p2", // producer id
      "Broken", // producer name
      "/bad-slug", // requested path
      "404", // http status
      "BoomFromComponent", // the uncaught error, i.e. "a component threw"
      "This page could not be found", // the page's own text
      "sibling route", // the id-vs-slug probe (MEH-1712)
    ]) {
      expect(message, `the report must carry "${field}"`).toContain(field);
    }
  });

  // (c) A fault that is NOT "the boundary is present" must propagate unchanged.
  //
  // The classifier reaches its report by catching a failed expect(), and every
  // Playwright fault on that call arrives the same way — a navigation timeout,
  // a crashed page, a closed context. Catching those too would publish a
  // confident wrong cause ("the detail route did not render") and destroy the
  // real message, which is strictly worse than no diagnosis. Closing the page
  // is the cheapest deterministic way to produce a non-matcher fault.
  test("a non-assertion fault propagates instead of being reported as a routing failure", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);
    await page.route("**/ok-slug", (r) => r.fulfill({ contentType: "text/html", body: OK_DOC }));
    await page.goto(`${UNUSED_ORIGIN}/ok-slug`);
    await page.close();

    let message = "";
    try {
      await assertDetailRendered(
        page,
        { id: "p3", slug: "ok-slug", name: "Closed" },
        "/ok-slug",
        pageErrors,
        200,
      );
    } catch (e) {
      message = String((e as Error).message);
    }

    expect(message, "closing the page must still surface a fault").not.toBe("");
    expect(
      message,
      "a closed page is not a routing failure — the classifier must not claim it is",
    ).not.toContain("The detail route did not render");
    expect(message.toLowerCase()).toContain("closed");
  });
});
