/**
 * MEH-1919 self-QA — /register success-affordance noise.
 *
 * Drives the REAL /register page (he is the unprefixed default locale) in Chromium against a `next start` server
 * at 390px (the ticket's stated viewport) and probes COMPUTED styles, not the
 * class attribute alone: the success tint is `border-primary` on ui/Input, and
 * a class that resolves to nothing would read as present in the DOM while
 * painting the default border (.claude/rules/frontend.md — computed-style
 * probe). Every /api/** call is fulfilled locally; the CC sandbox has no
 * backend (CLAUDE.md "Known Bug Patterns").
 *
 * Case 0 is a self-test with a known answer: it asserts the probe reports the
 * UNTINTED border for a pristine field, so a probe that always answers
 * "untinted" cannot silently sign off on cases 1-6. It earned its keep on the
 * first run by catching TWO probe defects that had produced three false FAILs
 * and one uninformative PASS:
 *
 *   a. `className.includes("border-primary")` also matches the UNTINTED
 *      field's `focus:border-primary` variant, so it answered "tinted" for
 *      every state. Class checks below tokenize on whitespace instead.
 *   b. ui/Input carries `transition-colors` (Input.jsx:80), so sampling
 *      getComputedStyle immediately after an interaction returns an
 *      intermediate colour — the error field measured rgb(46,104,83), a
 *      green/red blend, not the red it settles on. Every probe now settles
 *      first.
 *
 * One consequence worth stating rather than hiding: while a field is FOCUSED,
 * `focus:border-primary` paints the border primary regardless of validity, so
 * computed colour cannot discriminate success during typing. For the two
 * focused cases (2 and 4) the static `border-primary` token is the measure;
 * the settled colour is the measure everywhere the field is blurred.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1919-register-success.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

// A re-run writes here, NOT over the committed before/ and after/ evidence
// next to it — a harness that overwrites its own reference is one restore away
// from ratifying whatever the code does today (.claude/rules/testing.md).
const OUT = "../qa-artifacts/MEH-1919/latest";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const VALID_HINT = "תקין";
// Comfortably past `duration-fast`; the settle is what makes a colour reading
// mean the state and not the animation.
const SETTLE_MS = 500;

/** Static class token, NOT substring — `focus:border-primary` must not match. */
const hasToken = (classes, token) => classes.split(/\s+/).includes(token);

async function probe(page) {
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate(() => {
    const read = (id) => {
      const el = document.querySelector(`#${id}`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const wrapper = el.closest("div");
      return {
        classes: el.className,
        borderColor: cs.borderTopColor,
        focused: document.activeElement === el,
        // The successText span (Check + copy) is the sibling ui/Input renders
        // under the field — its absence is what "no hint" has to mean.
        siblingText: wrapper ? wrapper.textContent.trim() : "",
        svgCount: wrapper ? wrapper.querySelectorAll("svg").length : 0,
      };
    };
    return { name: read("register-name"), email: read("register-email") };
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  let failures = 0;
  const check = (label, ok, detail) => {
    if (!ok) failures += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  };

  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  const name = page.locator("#register-name");
  const email = page.locator("#register-email");
  // The form is client-only: SSR renders the auth spinner (RegisterClient.jsx
  // gates on authLoading), so `networkidle` can resolve before the fields
  // exist. Without this wait a cold server yields `null` from the probe, which
  // reads like a missing element rather than a race.
  await email.waitFor({ state: "visible", timeout: 30_000 });

  // --- case 0: self-test. Pristine fields must read as UNTINTED. ---
  const pristine = await probe(page);
  const UNTINTED = pristine.email.borderColor;
  check(
    "0a. self-test: probe reads a real border color on pristine fields",
    !!UNTINTED && UNTINTED !== "rgba(0, 0, 0, 0)" && !hasToken(pristine.email.classes, "border-primary"),
    `borderColor=${UNTINTED}`
  );
  // The tokenizer must separate the success class from the focus VARIANT of the
  // same class — the exact confusion that produced three false FAILs on run 1.
  check(
    "0b. self-test: tokenizer rejects `focus:border-primary`, accepts `border-primary`",
    !hasToken("border-border focus:border-primary", "border-primary") &&
      hasToken("rounded-md border-primary text-text", "border-primary") &&
      !hasToken("border-error", "border-primary"),
    "3/3 known answers"
  );
  await page.screenshot({ path: `${OUT}/0-pristine-390.png` });

  // --- case 1: name valid + blurred → NO success affordance of any kind ---
  await name.fill("שמדר");
  await name.blur();
  const s1 = await probe(page);
  check("1. name: no border-primary token after valid entry + blur", !hasToken(s1.name.classes, "border-primary"));
  check("1. name: border color unchanged from pristine", s1.name.borderColor === pristine.name.borderColor,
    `${pristine.name.borderColor} -> ${s1.name.borderColor}`);
  check("1. name: no '✓ תקין' hint", !s1.name.siblingText.includes(VALID_HINT), `text="${s1.name.siblingText}"`);
  check("1. name: no Check icon (svg) in the field wrapper", s1.name.svgCount === 0, `svg=${s1.name.svgCount}`);
  await page.screenshot({ path: `${OUT}/1-name-valid-blurred-390.png` });

  // --- case 2: email valid but NEVER blurred → nothing while typing ---
  await email.fill("shamdar@example.com");
  const s2 = await probe(page);
  // Focused → the colour is `focus:border-primary` and says nothing about
  // validity; the success token is the discriminator here (see header note).
  check("2. email: no success token while typing (never blurred)",
    !hasToken(s2.email.classes, "border-primary"),
    `focused=${s2.email.focused} borderColor=${s2.email.borderColor}`);
  check("2. email: no '✓ תקין' hint while typing", !s2.email.siblingText.includes(VALID_HINT),
    `text="${s2.email.siblingText}"`);
  await page.screenshot({ path: `${OUT}/2-email-typing-390.png` });

  // --- case 3: blur with a valid value → STILL nothing (the MEH-1919 follow-up)
  // The interim implementation tinted here. Now the border must be byte-identical
  // to the pristine reading, which is the strongest form this can take: not
  // "some other colour", but literally unchanged.
  await email.blur();
  const s3 = await probe(page);
  check("3. email: NO tint on blur with a valid value",
    s3.email.borderColor === UNTINTED && !hasToken(s3.email.classes, "border-primary") && !s3.email.focused,
    `borderColor=${s3.email.borderColor} (pristine ${UNTINTED})`);
  check("3. email: no '✓ תקין' hint", !s3.email.siblingText.includes(VALID_HINT),
    `text="${s3.email.siblingText}"`);
  await page.screenshot({ path: `${OUT}/3-email-blurred-valid-390.png` });

  // --- case 4: re-typing, then blurring a second time — the interim behaviour
  // re-armed on every blur, so this is where a careless revert would show up.
  await email.type("x");
  const s4 = await probe(page);
  check("4. email: no success token while re-typing",
    !hasToken(s4.email.classes, "border-primary"),
    `focused=${s4.email.focused}`);
  await email.blur();
  const s4b = await probe(page);
  check("4b. email: still no tint after a SECOND blur",
    s4b.email.borderColor === UNTINTED && !hasToken(s4b.email.classes, "border-primary"),
    `borderColor=${s4b.email.borderColor}`);
  check("4b. email: no Check icon in the field wrapper", s4b.email.svgCount === 0,
    `svg=${s4b.email.svgCount}`);
  await page.screenshot({ path: `${OUT}/4-email-retyping-390.png` });

  // --- case 5: error path unchanged — invalid email raised on blur ---
  await email.fill("not-an-email");
  await email.blur();
  const s5 = await probe(page);
  check("5. email: error border on blur with an invalid value",
    hasToken(s5.email.classes, "border-error") && !hasToken(s5.email.classes, "border-primary") &&
      s5.email.borderColor !== UNTINTED,
    `borderColor=${s5.email.borderColor}`);
  check("5. email: error text rendered", s5.email.siblingText.length > 0, `text="${s5.email.siblingText}"`);
  await page.screenshot({ path: `${OUT}/5-email-error-390.png` });

  // --- case 6: error path unchanged — empty name raised on blur ---
  await name.fill("");
  await name.blur();
  const s6 = await probe(page);
  check("6. name: error border + text on blur while empty",
    hasToken(s6.name.classes, "border-error") && s6.name.siblingText.length > 0, `text="${s6.name.siblingText}"`);
  await page.screenshot({ path: `${OUT}/6-name-error-390.png` });

  // --- case 7: RTL — no physical directional classes on the two fields ---
  const physical = await page.evaluate(() =>
    [...document.querySelectorAll("#register-name, #register-email")]
      .flatMap((el) => el.className.split(/\s+/))
      .filter((c) => /^-?(ml|mr|pl|pr|left|right)-/.test(c))
  );
  check("7. RTL: no physical directional classes on name/email", physical.length === 0, physical.join(" "));

  await browser.close();
  console.log(`\n${failures === 0 ? "ALL CASES PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
