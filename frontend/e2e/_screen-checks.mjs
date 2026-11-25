// MEH-3816 — the checks a screenshot gets before it reaches Sapir.
//
// One owner for the in-page layout checks: they moved here verbatim from
// e2e/mobile-audit/mobile-audit.spec.ts (MEH-233), which now imports them.
// The screenshot-review skill (.agents/skills/screenshot-review/SKILL.md)
// runs screenChecks() on the same page it just captured.
//
// Not a spec: nothing here is matched by playwright.config.ts testMatch.
import AxeBuilder from "@axe-core/playwright";

/**
 * The 7 layout checks of MEH-233, evaluated in-page.
 * @param {import("@playwright/test").Page} page
 * @param {string} viewportName
 * @returns {Promise<{docW:number,W:number,H:number,viewport:string,out:{check:number,checkName:string,severity:string,detail:string}[]}>}
 */
export async function runLayoutChecks(page, viewportName) {
  return page.evaluate((vp) => {
    const out = [];
    const W = window.innerWidth;
    const H = window.innerHeight;

    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        s.opacity !== "0"
      );
    };
    // Visually-hidden helpers (sr-only skip links, screen-reader text) collapse
    // to ~1px or use clip/clip-path; they are a11y affordances, not real tap
    // targets — exclude from the < 44px count to avoid noise.
    const isScreenReaderOnly = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const clipped = s.clip === "rect(0px, 0px, 0px, 0px)" || /inset\(50%\)|circle\(0/.test(s.clipPath);
      const tiny = r.width <= 2 && r.height <= 2;
      const cls = typeof el.className === "string" ? el.className : "";
      return clipped || tiny || /\bsr-only\b/.test(cls);
    };
    // Leaflet map panes are intentionally larger than their clipping container
    // (tiles extend past the viewport by design) — not a layout defect.
    const isLeaflet = (el) =>
      !!el.closest(".leaflet-container,.leaflet-pane,.leaflet-map-pane") ||
      (typeof el.className === "string" &&
        /\bleaflet-/.test(el.className));
    const desc = (el) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const cls =
        typeof el.className === "string" && el.className
          ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
      const txt = (el.textContent || "").trim().slice(0, 30);
      return `${tag}${id}${cls}${txt ? ` "${txt}"` : ""}`;
    };

    // CHECK 1 — horizontal overflow (body.scrollWidth > viewport). CRITICAL.
    const docW = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );
    if (docW > W + 1) {
      // Find the widest offending elements that push past the viewport.
      const offenders = [];
      document.querySelectorAll("*").forEach((el) => {
        if (offenders.length >= 3) return;
        const r = el.getBoundingClientRect();
        if (r.right > W + 2 && r.width > 8 && isVisible(el)) {
          offenders.push(`${desc(el)} (right=${Math.round(r.right)})`);
        }
      });
      out.push({
        check: 1,
        checkName: "Horizontal overflow",
        severity: "CRITICAL",
        detail: `scrollWidth ${docW}px > viewport ${W}px (overflow ${docW - W}px). Offenders: ${offenders.join(" | ") || "n/a"}`,
      });
    }

    // MEH-3816: a loading message ("טוען…") is a state, not truncation. It is
    // reported once, as a sign the screen was measured before it settled.
    const LOADING_RE = /(טוען|טעינת|בטעינה|Loading)[^\n]{0,24}(\.\.\.|…)\s*$/;

    // CHECK 2 — text ending "..." that is NOT a CSS ellipsis. HIGH.
    // CSS text-overflow:ellipsis is intentional and acceptable; a literal
    // trailing "..."/"…" in content without ellipsis styling is suspect.
    const ellipsisHits = [];
    document.querySelectorAll("p,span,a,h1,h2,h3,h4,h5,h6,li,button,div,small").forEach((el) => {
      if (ellipsisHits.length >= 5) return;
      if (el.children.length > 0) return; // leaf text only
      const t = (el.textContent || "").trim();
      if (!/(\.\.\.|…)$/.test(t)) return;
      if (isScreenReaderOnly(el) || LOADING_RE.test(t)) return; // MEH-3816
      const s = getComputedStyle(el);
      const cssEllipsis = s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none";
      if (!cssEllipsis && isVisible(el)) {
        ellipsisHits.push(`${desc(el)}`);
      }
    });
    if (ellipsisHits.length) {
      out.push({
        check: 2,
        checkName: "Unintentional truncation",
        severity: "HIGH",
        detail: `${ellipsisHits.length} element(s) end with literal "..." without CSS ellipsis: ${ellipsisHits.join(" | ")}`,
      });
    }

    // CHECK 3 — tap target below the floor. HIGH.
    // MEH-3816: the floor is docs/DESIGN.md «Interactive sizing minimums»:
    // 44×44 below md (768px), 32×32 from md up. Its documented exceptions are
    // skipped: a link inside running text (WCAG 2.5.8 inline) and the Leaflet
    // attribution. A hit area widened by an absolutely placed ::before/::after
    // (the house pattern) counts at its widened size.
    const FLOOR = W < 768 ? 44 : 32;
    const px = (v) => (/^-?[\d.]+px$/.test(v) ? parseFloat(v) : null);
    const hitSize = (el, r) => {
      let w = r.width, h = r.height;
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.position !== "absolute") continue;
        const t = px(ps.top), b = px(ps.bottom), l = px(ps.left), rt = px(ps.right);
        if (t !== null && b !== null) h = Math.max(h, r.height - t - b);
        if (l !== null && rt !== null) w = Math.max(w, r.width - l - rt);
        const pw = px(ps.width), ph = px(ps.height);
        if (pw !== null) w = Math.max(w, pw);
        if (ph !== null) h = Math.max(h, ph);
      }
      return { w, h };
    };
    const isInlineTextLink = (el) => {
      if (el.tagName !== "A") return false;
      const p = el.parentElement;
      if (!p || !["P", "LI", "SPAN", "LABEL", "TD", "DD"].includes(p.tagName)) return false;
      const own = (el.textContent || "").trim().length;
      return (p.textContent || "").trim().length > own + 15;
    };
    const small = [];
    let smallCount = 0;
    const interactive = document.querySelectorAll(
      'a,button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[onclick]'
    );
    interactive.forEach((el) => {
      if (!isVisible(el)) return;
      if (isScreenReaderOnly(el)) return;
      if (isInlineTextLink(el)) return;
      if (el.closest(".leaflet-control-attribution")) return;
      const r = el.getBoundingClientRect();
      const { w, h } = hitSize(el, r);
      if (w < FLOOR - 0.5 || h < FLOOR - 0.5) {
        smallCount++;
        if (small.length < 6) small.push(`${desc(el)} (${Math.round(w)}×${Math.round(h)})`);
      }
    });
    if (smallCount > 0) {
      out.push({
        check: 3,
        checkName: `Tap target < ${FLOOR}px`,
        severity: "HIGH",
        detail: `${smallCount} interactive element(s) below ${FLOOR}×${FLOOR}px. Samples: ${small.join(" | ")}`,
      });
    }

    // CHECK 4 — element clipped by overflow:hidden (content cut off). CRITICAL.
    const clipped = [];
    document.querySelectorAll("*").forEach((el) => {
      if (clipped.length >= 4) return;
      const s = getComputedStyle(el);
      const clipsX = s.overflowX === "hidden" || s.overflow === "hidden";
      if (!clipsX) return;
      if (isLeaflet(el)) return; // intentional map-pane bleed, not a defect
      // MEH-3816: a single-line CSS ellipsis (`truncate`) is a deliberate cut,
      // and a box whose content has no text is decoration (a blurred shape).
      if (s.textOverflow === "ellipsis") return;
      if (!(el.innerText || "").trim()) return;
      // content meaningfully wider than the clipping box → horizontally cut.
      if (el.scrollWidth > el.clientWidth + 8 && el.clientWidth > 40 && isVisible(el)) {
        clipped.push(`${desc(el)} (content ${el.scrollWidth}px > box ${el.clientWidth}px)`);
      }
    });
    if (clipped.length) {
      out.push({
        check: 4,
        checkName: "Clipped by overflow:hidden",
        severity: "CRITICAL",
        detail: `${clipped.length} element(s) clip horizontal content: ${clipped.join(" | ")}`,
      });
    }

    // CHECK 5 — open modal/dialog doesn't fit viewport. CRITICAL.
    const dialogs = document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]');
    dialogs.forEach((el) => {
      if (!isVisible(el)) return;
      const r = el.getBoundingClientRect();
      const overflowsRight = r.right > W + 2 || r.left < -2;
      const overflowsBottom = r.height > H + 2 && r.top < 0 && r.bottom > H;
      if (overflowsRight || r.width > W + 2 || overflowsBottom) {
        out.push({
          check: 5,
          checkName: "Modal exceeds viewport",
          severity: "CRITICAL",
          detail: `${desc(el)} rect ${Math.round(r.width)}×${Math.round(r.height)} at (${Math.round(r.left)},${Math.round(r.top)}) vs viewport ${W}×${H}`,
        });
      }
    });

    // CHECK 6 — fixed/sticky header or footer overlaps body content. HIGH.
    const bars = Array.from(
      document.querySelectorAll('header,footer,[role="banner"],[role="contentinfo"]')
    ).filter((el) => {
      const s = getComputedStyle(el);
      return (s.position === "fixed" || s.position === "sticky") && isVisible(el);
    });
    const main = document.querySelector("main");
    if (main && bars.length) {
      const mr = main.getBoundingClientRect();
      bars.forEach((bar) => {
        const br = bar.getBoundingClientRect();
        // Does the bar's band vertically intersect main's content band, AND
        // is main content actually painted under it (top above bar bottom)?
        const overlap = Math.min(br.bottom, mr.bottom) - Math.max(br.top, mr.top);
        const coversTop = br.top <= mr.top + 1 && br.bottom > mr.top + 4;
        const coversBottom = br.bottom >= mr.bottom - 1 && br.top < mr.bottom - 4;
        if (overlap > 6 && (coversTop || coversBottom)) {
          out.push({
            check: 6,
            checkName: "Header/footer overlaps body",
            severity: "HIGH",
            detail: `${desc(bar)} (band ${Math.round(br.top)}–${Math.round(br.bottom)}) overlaps <main> band ${Math.round(mr.top)}–${Math.round(mr.bottom)} by ${Math.round(overlap)}px`,
          });
        }
      });
    }

    // CHECK 7 — bottom nav / tab bar cut off (extends beyond viewport). CRITICAL.
    const navs = document.querySelectorAll('nav[aria-label]');
    navs.forEach((el) => {
      if (!isVisible(el)) return;
      const s = getComputedStyle(el);
      if (s.position !== "fixed" && s.position !== "sticky") return;
      const r = el.getBoundingClientRect();
      const cutRight = r.right > W + 2;
      const cutLeft = r.left < -2;
      const cutBottom = r.bottom > H + 2;
      // Also check the nav's own horizontal content overflow (items clipped).
      const itemsOverflow = el.scrollWidth > el.clientWidth + 4;
      if (cutRight || cutLeft || cutBottom || itemsOverflow) {
        out.push({
          check: 7,
          checkName: "Nav/tab bar cut off",
          severity: "CRITICAL",
          detail: `${desc(el)} rect (${Math.round(r.left)},${Math.round(r.top)})–(${Math.round(r.right)},${Math.round(r.bottom)}) vs viewport ${W}×${H}${itemsOverflow ? " | items overflow horizontally" : ""}`,
        });
      }
    });

    // MEH-3816: measured while a loading message was still on screen.
    const loadingText = Array.from(document.querySelectorAll("body *"))
      .filter((el) => el.children.length === 0 && isVisible(el) && !isScreenReaderOnly(el))
      .map((el) => (el.textContent || "").trim())
      .find((t) => LOADING_RE.test(t));
    if (loadingText) {
      out.push({
        check: 0,
        checkName: "Still loading",
        severity: "WARN",
        detail: `"${loadingText.slice(0, 40)}" is on screen: wait for the loaded state and measure again`,
      });
    }

    return { docW, W, H, viewport: vp, out };
  }, viewportName);
}

/**
 * Images that were asked for and did not load, and images with no alt.
 * @param {import("@playwright/test").Page} page
 */
export async function imageChecks(page) {
  return page.evaluate(() => {
    const broken = [];
    const noAlt = [];
    document.querySelectorAll("img").forEach((img) => {
      const src = (img.currentSrc || img.getAttribute("src") || "").slice(0, 80);
      if (img.complete && img.naturalWidth === 0 && src) broken.push(src);
      if (!img.hasAttribute("alt")) noAlt.push(src || "(no src)");
    });
    return { broken, noAlt };
  });
}

/**
 * axe on the current state of the page, WCAG A + AA, critical and serious only.
 * Differs from the 12-axe-a11y gate on purpose:
 * - color-contrast is included (the gate ignores it for known deferred pairs):
 *   a screenshot review wants to see it;
 * - no `wcag22aa`: its one rule, `target-size` (24px), would repeat the
 *   stricter 44px tap check above.
 * Same as the gate: Leaflet marker icons are excluded (unnamed markers,
 * tracked there).
 * @param {import("@playwright/test").Page} page
 */
export async function axeChecks(page) {
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".leaflet-marker-icon")
    .analyze();
  return res.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      count: v.nodes.length,
      sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ")),
    }));
}

/**
 * Everything a screenshot review measures, in one call.
 * `problems` is the list to read; an empty list means the measurable half
 * passed, not that the screen is right (the checklist is the other half).
 * @param {import("@playwright/test").Page} page
 * @param {string} [label]
 */
export async function screenChecks(page, label = "") {
  const layout = await runLayoutChecks(page, label);
  const images = await imageChecks(page);
  const axe = await axeChecks(page);
  const problems = [
    ...layout.out.map((f) => `[${f.severity}] ${f.checkName}: ${f.detail}`),
    ...images.broken.map((s) => `[HIGH] Broken image: ${s}`),
    ...images.noAlt.map((s) => `[HIGH] Image without alt: ${s}`),
    ...axe.map((v) => `[${v.impact}] axe ${v.id} ×${v.count}: ${v.sample.join(" | ")}`),
  ];
  return { viewport: { width: layout.W, height: layout.H }, problems, layout, images, axe };
}
