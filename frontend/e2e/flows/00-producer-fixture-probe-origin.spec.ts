// Imported from the suite-wide Cloudinary stub rather than `@playwright/test`,
// per `e2e/CLAUDE.md`: every spec under `flows/` goes through this fixture. It is
// inert here — this spec serves a synthetic document from a dead origin and loads
// no image at all — but the convention is what keeps a future edit that DOES load
// one from silently billing real bandwidth.
import { test as base, expect } from "./_cloudinary-stub";
import { createServer, type Server } from "node:http";
import { assertDetailRendered, watchPageErrors } from "./_producer-fixture";

/**
 * Regression guard for MEH-2252 — the diagnostic probes inside
 * `assertDetailRendered` must never escape to the application server when the
 * page under test was not served by it.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 * `_producer-fixture.ts` probes `/producer/<id>` and `/api/producers/by-slug/…`
 * with `page.request`, which resolves a RELATIVE path against the config's
 * `baseURL` — never against the origin the page in front of it came from. The
 * classifier self-test (`00-producer-fixture-selftest.spec.ts`) drives the
 * failure branch with a synthetic producer `{ id: "p2", slug: "bad-slug" }` on
 * a stubbed origin, so `GET /producer/p2` left the harness, reached the real
 * `next start`, and SSR rejected the non-integer id — printing
 * `producer lookup failed: 422 Unprocessable Entity (id=p2)` into
 * `next-start.log` on every E2E run.
 *
 * ── WHY NOT INTERCEPT IT ────────────────────────────────────────────────────
 * Measured on Playwright 1.62.1, with a control proving the same glob DOES
 * intercept a page navigation: neither `page.route()` nor
 * `browserContext.route()` intercepts an `APIRequestContext` request — all
 * three combinations reached the network and threw `ECONNREFUSED`. There is no
 * interception point to hide the request behind, so the fix has to change where
 * the request is ADDRESSED.
 *
 * ── WHAT THIS ASSERTS, AND WHY IT IS BEHAVIOUR AND NOT THE EDIT ─────────────
 * `baseURL` is pointed at a recording HTTP server this spec owns, while the
 * page is served from a DIFFERENT, dead origin. The assertion is simply that
 * the recorder saw nothing. It says nothing about how the fixture builds its
 * URLs, so an inert fix cannot satisfy it: any implementation that still
 * addresses `baseURL` gets recorded, and any implementation that addresses the
 * page's own origin does not.
 *
 * Fail→pass demonstrated on the unfixed tree: the recorder received
 * ["/producer/p2", "/api/producers/by-slug/bad-slug"].
 */

// Nothing listens here. The page is served from this origin via page.route(),
// so a probe addressed at the PAGE's origin dies locally instead of travelling.
const DEAD_ORIGIN = "http://localhost:9";

const ERROR_DOC =
  `<!doctype html><html id="__next_error__"><head><meta charset="utf-8"></head>` +
  `<body>404 — This page could not be found.</body></html>`;

type Recorder = { paths: string[]; url: string };

// Overriding the built-in `baseURL` option with a fixture (rather than a static
// `test.use` value) is what lets the recorder bind an EPHEMERAL port. A fixed
// port would collide the moment the `desktop` and `mobile` projects run this
// file in parallel — `fullyParallel: true` — and surface as an EADDRINUSE flake
// that has nothing to do with the thing under test.
const test = base.extend<{ recorder: Recorder }>({
  recorder: async ({}, use) => {
    const paths: string[] = [];
    const server: Server = createServer((req, res) => {
      paths.push(req.url ?? "");
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("recorded");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (addr === null || typeof addr === "string") {
      throw new Error(`recorder did not bind a TCP port (address=${String(addr)})`);
    }
    await use({ paths, url: `http://127.0.0.1:${addr.port}` });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
  // Depending on `recorder` guarantees the server is listening before the
  // browser context — and therefore `page.request` — is created with this value.
  baseURL: async ({ recorder }, use) => {
    await use(recorder.url);
  },
});

test("no probe for a synthetic producer escapes to the application server", async ({
  page,
  recorder,
}) => {
  const pageErrors = watchPageErrors(page);

  await page.route("**/bad-slug", (r) =>
    r.fulfill({ status: 404, contentType: "text/html", body: ERROR_DOC }),
  );
  await page.goto(`${DEAD_ORIGIN}/bad-slug`);

  let threw = "";
  try {
    await assertDetailRendered(
      page,
      { id: "p2", slug: "bad-slug", name: "Broken" },
      "/bad-slug",
      pageErrors,
      404,
    );
  } catch (e) {
    threw = String((e as Error).message);
  }

  // Control: if the classifier never reached its failure branch, the probes were
  // never issued and the recorder would read empty for the wrong reason — a null
  // that is also the reassuring answer.
  expect(threw, "the classifier must have reached its report branch").toContain(
    "The detail route did not render",
  );

  expect(
    recorder.paths,
    "a probe for a synthetic producer reached the application server — " +
      "the id route rejects a non-integer id and SSR logs `producer lookup failed: 422`",
  ).toEqual([]);
});
