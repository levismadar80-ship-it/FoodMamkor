/**
 * Lighthouse CI performance budget — MEH-2749.
 *
 * Runs after each deploy (staging and production) against the live site, on a
 * phone profile (Lighthouse default: Moto G Power, slow 4G). Three runs per
 * page; every assertion reads the MEDIAN run, so one noisy run cannot redden
 * the job.
 *
 * Two kinds of line, on purpose:
 *   error — things a code change moves and a slow CI machine does not:
 *           bytes shipped, layout shift, a11y / SEO / best-practices scores.
 *           A red here is a regression in the diff.
 *   warn  — timing (performance score, LCP, TBT). Shared GitHub runners vary
 *           by tens of percent run to run; failing a deploy on them would be
 *           a flaky gate. They print in the log and the uploaded report.
 *
 * The numbers are a RATCHET from today, not the goal. Measured 06/11/2026 on
 * production, 3 runs × 5 pages (sandbox, median):
 *   page        perf  LCP ms  TBT ms  CLS    total KB  JS KB  a11y  seo
 *   /            57    5519    917   0.000    1157     685    99   100
 *   /producers   59    5521    755   0.057     901     571   100   100
 *   /map         56    6364    850   0.039     995     667   100   100
 *   /events      70    4186    611   0.064     836     515   100    92
 *   /about       63    5265    692   0.000     941     501   100   100
 * Two findings the first run surfaced (06/11), each red here until fixed:
 *   - / CLS 0.42 on staging every run, on production 1 run in 3: the
 *     route loading fallback is 40vh tall, so on a phone the footer is in the
 *     first screen and jumps out when the page streams in.
 *   - /events: Lighthouse reports "no meta description". The tag IS in the
 *     HTML, but in <body>: generateMetadata awaits getHubCount(), so Next
 *     streams the metadata after the shell (measured with curl, browser and
 *     Googlebot UA alike). Google renders JS and reads it; Lighthouse reads
 *     <head> only. That is why the SEO line is 0.85, not 0.9 — staging
 *     /events scores 0.86 once robots.txt is skipped.
 * LCP 5–6 s is MEH-2233 (in progress) — when it lands, tighten the warn
 * lines here. Byte budgets sit ~10% above the heaviest page so normal growth
 * fits and a new heavy dependency does not.
 *
 * Base URL: LHCI_BASE_URL (default production). The workflow runs this on
 * production only. It never reads VERCEL_AUTOMATION_BYPASS_SECRET: Lighthouse
 * applies extra headers to EVERY request the page makes (Chrome
 * Network.setExtraHTTPHeaders), so the staging bypass secret would reach
 * Cloudinary, Google, PostHog and Sentry. A staging run is a local one-off
 * (see docs/TESTING.md), never this config with the secret.
 */
const base = (process.env.LHCI_BASE_URL || "https://mehamakor.co.il").replace(/\/$/, "");

const PAGES = ["/", "/producers", "/map", "/events", "/about"];

// Staging answers robots.txt "Disallow: /" on purpose (it must never be
// indexed), which costs every staging page ~8 SEO points that production does
// not lose. Skip exactly those two audits off production, so the SEO line
// measures the same thing on both.
const isProduction = /^https:\/\/mehamakor\.co\.il$/.test(base);

module.exports = {
  ci: {
    collect: {
      url: PAGES.map((p) => base + p),
      numberOfRuns: 3,
      ...(process.env.LHCI_CHROME_PATH ? { chromePath: process.env.LHCI_CHROME_PATH } : {}),
      settings: {
        chromeFlags: "--headless=new --no-sandbox",
        ...(isProduction ? {} : { skipAudits: ["robots-txt", "is-crawlable"] }),
      },
    },
    assert: {
      assertions: {
        // error — regressions the diff causes
        "total-byte-weight": ["error", { maxNumericValue: 1300 * 1024, aggregationMethod: "median" }],
        "resource-summary:script:size": ["error", { maxNumericValue: 760 * 1024, aggregationMethod: "median" }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, aggregationMethod: "median" }],
        "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median" }],
        "categories:seo": ["error", { minScore: 0.85, aggregationMethod: "median" }],
        "categories:best-practices": ["error", { minScore: 0.9, aggregationMethod: "median" }],
        // warn — timing, too noisy on shared runners to fail a deploy
        "categories:performance": ["warn", { minScore: 0.5, aggregationMethod: "median" }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 7000, aggregationMethod: "median" }],
        "total-blocking-time": ["warn", { maxNumericValue: 1200, aggregationMethod: "median" }],
      },
    },
    upload: { target: "filesystem", outputDir: "./lhci-report" },
  },
};
