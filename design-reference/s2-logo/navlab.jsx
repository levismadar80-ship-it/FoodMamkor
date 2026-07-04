/* navlab.jsx — FloatingNavbar pill width/spacing exploration (MEH-732)
   Design-only. Renders the LOCKED v5 navbar at three width/spacing specs,
   in over-image + scrolled states, desktop + mobile. RTL Hebrew. */

const { useState } = React;

/* ── Logo (inline so wordmark can flip cream on dark) ───────────── */
function petals(light) {
  const colored = ["#2E6853", "#C8632E", "#C99846", "#D9C8B0", "#5A8F73"];
  const creamOp = [0.96, 0.78, 0.62, 0.48, 0.88];
  const rot = [36, 108, 180, 252, 324];
  const seedPath =
    "M 0,-44 C 10,-44 13,-32 11,-20 C 9,-12 5,-8 0,-6 C -5,-8 -9,-12 -11,-20 C -13,-32 -10,-44 0,-44 Z";
  return rot
    .map((r, i) => {
      const fill = light ? "#F5F0E8" : colored[i];
      const op = light ? creamOp[i] : 1;
      return `<g transform="rotate(${r})"><path d="${seedPath}" fill="${fill}" opacity="${op}"/></g>`;
    })
    .join("");
}
function logoSVG(light) {
  const word = light ? "#F5F0E8" : "#1C1A17";
  const sub = light ? "#C9D9B8" : "#5c584f";
  return `<svg viewBox="0 0 460 140" role="img" aria-label="מהמקור">
    <g transform="translate(410 70) scale(0.58)"><g opacity="0.94">${petals(light)}</g></g>
    <text x="350" y="80" text-anchor="end" direction="rtl" font-family="'Frank Ruhl Libre',serif" font-weight="700" font-size="50" fill="${word}">מהמקור</text>
    <text x="350" y="104" text-anchor="end" direction="rtl" font-family="'Cormorant Garamond',serif" font-style="italic" font-weight="500" font-size="15" fill="${sub}" letter-spacing="0.02em">— from the source</text>
  </svg>`;
}

/* ── Icons ──────────────────────────────────────────────────────── */
const ICO_SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const ICO_GLOBE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/></svg>`;
const ICO_BURGER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

function Raw({ html, className, style }) {
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ── The pill ───────────────────────────────────────────────────── */
// page: "home" (default) shows login link · "login" hides it (redundant on /login)
function NavDesktop({ spec, state, page = "home", pillOnly = false, compose = "B" }) {
  const over = state === "over";
  const onLogin = page === "login";
  const pillStyle = {
    maxWidth: spec.maxWidth,
    padding: over ? spec.padDefault : spec.padScrolled,
  };
  if (compose === "A") pillStyle.columnGap = spec.gap;
  const Logo = (
    <a className="logo" href="#" aria-label="מהמקור"><Raw html={logoSVG(over)} /></a>
  );
  const Links = (
    <ul className="nav-links">
      <li><a className="nav-link is-current" href="#">גלו</a></li>
      <li><a className="nav-link" href="#">מפה</a></li>
      <li><a className="nav-link" href="#">אודות</a></li>
    </ul>
  );
  const Actions = (
    <div className="actions">
      {!onLogin && <a className="nav-login" href="#">כניסה לחשבון</a>}
      <button className="ico-btn" type="button" aria-label="שפה"><Raw html={ICO_GLOBE} /></button>
      <button className="nav-add" type="button">הוסיפו עסק</button>
      <button className="nav-search" type="button"><Raw html={ICO_SEARCH} /><span>חיפוש</span></button>
    </div>
  );
  return (
    <div className="shell" style={{ paddingTop: spec.marginTop }}>
      <nav className={"nav " + (over ? "is-over" : "is-scrolled") + (pillOnly ? " is-pillonly" : "") + (compose === "B" ? " compose-b" : "")} style={pillStyle} aria-label="primary">
        {compose === "A"
          ? (<React.Fragment>{Logo}{Links}{Actions}</React.Fragment>)
          : (<React.Fragment><div className="lead-group">{Logo}{Links}</div>{Actions}</React.Fragment>)}
      </nav>
    </div>
  );
}

function NavMobile({ spec, state, pillOnly = false }) {
  const over = state === "over";
  const pillStyle = { padding: over ? "8px 8px 8px 16px" : "6px 8px 6px 16px" };
  return (
    <div className="shell shell-m" style={{ paddingTop: spec.mMarginTop, paddingInline: spec.mSide }}>
      <nav className={"nav nav-m " + (over ? "is-over" : "is-scrolled") + (pillOnly ? " is-pillonly" : "")} style={pillStyle} aria-label="primary">
        <a className="logo logo-m" href="#" aria-label="מהמקור">
          <Raw html={logoSVG(over)} />
        </a>
        <span className="spacer" />
        <button className="nav-search nav-search-m" type="button" aria-label="חיפוש"><Raw html={ICO_SEARCH} /></button>
        <button className="ico-btn burger" type="button" aria-label="תפריט"><Raw html={ICO_BURGER} /></button>
      </nav>
    </div>
  );
}

/* ── Page frame (backdrop behind the pill) ──────────────────────── */
function Frame({ state, device, spec, w, h, page }) {
  const over = state === "over";
  return (
    <div className={"frame " + (over ? "bg-over" : "bg-scroll")} style={{ width: w, height: h }}>
      {over ? (
        <div className="hero-ctx">
          <p className="hero-eyebrow">REAL FOOD · STRAIGHT FROM THE SOURCE</p>
          <h2 className="hero-h1">אוכל אמיתי,<br/>ישר <em>מהמקור</em> אלייך</h2>
        </div>
      ) : (
        <div className="scroll-ctx">
          <h2 className="scroll-h1">מהמטבח של השכן</h2>
          <div className="scroll-row"><span/><span/><span/></div>
        </div>
      )}
      {device === "desktop" ? <NavDesktop spec={spec} state={state} page={page} /> : <NavMobile spec={spec} state={state} />}
    </div>
  );
}

/* ── Spec sheet card ────────────────────────────────────────────── */
/* ── Action-hierarchy explainer (before → after) ── */
function MiniPill({ children }) {
  return <div className="mini-pill"><span className="mini-logo">מהמקור</span><span className="mini-spacer" /><div className="mini-actions">{children}</div></div>;
}
function HierExplain() {
  return (
    <div className="hier">
      <p className="hier-eyebrow">ACTION HIERARCHY · LIVE QA FIX</p>
      <h3>One bold action, not two competing ones.</h3>

      <div className="hier-row">
        <div className="hier-tag is-bad">Before</div>
        <MiniPill>
          <span className="m-login">כניסה לחשבון</span>
          <span className="m-ico"><Raw html={ICO_GLOBE} /></span>
          <span className="m-ghost-old"><Raw html={ICO_SEARCH} /></span>
          <span className="m-cta-old">הוסיפו עסק</span>
        </MiniPill>
        <p className="hier-note">Two buttons fight: a ghost <b>כניסה לחשבון</b> and a filled green <b>הוסיפו עסק</b>, while the real primary action — search — hides as a bare icon.</p>
      </div>

      <div className="hier-row">
        <div className="hier-tag is-good">After</div>
        <MiniPill>
          <span className="m-login-quiet">כניסה לחשבון</span>
          <span className="m-ico"><Raw html={ICO_GLOBE} /></span>
          <span className="m-ghost">הוסיפו עסק</span>
          <span className="m-search"><Raw html={ICO_SEARCH} />חיפוש</span>
        </MiniPill>
        <ol className="hier-list">
          <li><span className="dot dot-1" /><b>חיפוש</b> — the one bold action. Filled pill, leads the cluster. Discovery is the job of a directory.</li>
          <li><span className="dot dot-2" /><b>הוסיפו עסק</b> — secondary. Outlined, no fill. Present, not shouting.</li>
          <li><span className="dot dot-3" /><b>כניסה לחשבון</b> — quiet text link. Hidden on <span className="ltr">/login</span> (redundant there).</li>
        </ol>
      </div>

      <p className="hier-foot">Copy unchanged (“הוסיפו עסק” kept). Search adapts per state — cream-on-dark over the hero, green-on-cream when scrolled. Applied across all three widths below.</p>
    </div>
  );
}

/* ── Scrolled-gap collision + treatments (B·Float) ──────────────── */
const GAP_CHIPS = ["גבינות מהחווה", "לחם מחמצת", "שמן זית", "ירקות אורגני", "דבש", "מאפים"];
const GAP_BAND_H = 116;

function GapDemo({ treatment }) {
  const spec = SPECS[1]; // B · Float 940
  return (
    <div className="frame bg-scroll gap-frame" style={{ width: DW, height: DH }}>
      <div className="gap-content">
        <div className="gap-chips">
          {GAP_CHIPS.map((c) => <span className="gap-chip" key={c}>{c}</span>)}
        </div>
        <div className="gap-body">
          <h2 className="gap-h">מהמטבח של השכן</h2>
          <div className="gap-cards"><span/><span/><span/></div>
        </div>
      </div>
      {treatment === "band" && <div className="gap-band" style={{ height: GAP_BAND_H }} />}
      {treatment === "blur" && <div className="gap-blur" style={{ height: GAP_BAND_H }} />}
      <NavDesktop spec={spec} state="scroll" />
      <div className={"gap-tag " + (treatment === "none" ? "is-bug" : "is-fix")}>
        {treatment === "none" ? "ללא טיפול — תוכן נחשף בחריץ ובשוליים"
          : treatment === "band" ? "Option 1 · Backdrop band (opaque)"
          : "Option 2 · Backdrop-blur (translucent)"}
      </div>
    </div>
  );
}

/* Option 0 (pill-only translucent) vs Option 2 (blur shelf), with a Frank Ruhl
   heading + chips scrolling behind, on B·Float 940. Desktop + mobile. */
function GapScene({ treatment, device }) {
  const spec = SPECS[1];
  const isMobile = device === "mobile";
  const w = isMobile ? MW : DW;
  const h = isMobile ? 540 : DH;
  return (
    <div className="frame bg-scroll gap-frame gap2-frame" style={{ width: w, height: h }}>
      <div className="gap-content">
        <h2 className="gap2-h">מהמטבח של השכן</h2>
        <div className="gap2-chips">
          {GAP_CHIPS.slice(0, isMobile ? 3 : 6).map((c) => <span className="gap-chip" key={c}>{c}</span>)}
        </div>
        <div className="gap2-cards"><span/><span/></div>
      </div>
      {treatment === "blur" && <div className="gap-blur" style={{ height: GAP_BAND_H }} />}
      {isMobile
        ? <NavMobile spec={spec} state="scroll" pillOnly={treatment === "pillonly"} />
        : <NavDesktop spec={spec} state="scroll" pillOnly={treatment === "pillonly"} />}
      <div className="gap-tag is-fix">
        {treatment === "pillonly" ? "Option 0 · Pill-only — translucent, no shelf" : "Option 2 · Backdrop-blur shelf (full-width)"}
      </div>
    </div>
  );
}

function GapDecision() {
  return (
    <div className="hier">
      <p className="hier-eyebrow">SCROLLED-GAP · THE REAL DECISION</p>
      <h3>Shelf, or no shelf?</h3>
      <ol className="hier-list">
        <li><span className="dot dot-2" /><b>Option 2 · blur shelf</b> — a full-width blurred strip. Clean, but it visually re-attaches the nav into a <em>header bar</em>. The floating read is gone.</li>
        <li><span className="dot dot-1" /><b>Option 0 · pill-only</b> — no shelf anywhere. The pill itself goes translucent (<span className="ltr">#F5F0E8 @85% + blur 12px</span>), with an elevated shadow. Content scrolls freely through the open gap and around the pill — the actual Superpower-style float.</li>
      </ol>
      <p className="hier-foot"><b>✓ Locked: Option 0 · pill-only.</b> The translucent pill holds the float cleanly without re-reading as a header bar. Guardrails (blur cap, no-animate filter, @supports fallback, AA contrast) ride along on the freeze sheet.</p>
      <div className="gap-spec">
        <p className="freeze-k">Option 0 · pill-only values</p>
        <p className="freeze-v ltr">background: rgba(245,240,232,.85)</p>
        <p className="freeze-v ltr">backdrop-filter: blur(12px)</p>
        <p className="freeze-v ltr">border: 1px #E8E0D0</p>
        <p className="freeze-v ltr">box-shadow: 0 8px 30px rgba(46,104,83,.12)</p>
      </div>
    </div>
  );
}

function FreezeSheet() {
  const rows = [
    ["max-width", "940px"],
    ["margin-top", "32px"],
    ["side margin @1280 (auto)", "170px each"],
    ["zone column-gap", "40px"],
    ["padding · over-image", "12px 20px"],
    ["padding · scrolled", "10px 16px"],
    ["border-radius", "9999px"],
    ["mobile · top / side", "20px / 20px"],
    ["mobile · search", "icon circle 44px"],
  ];
  return (
    <div className="spec freeze">
      <div className="spec-head">B · Float 940 <span>✓ frozen</span></div>
      <table><tbody>
        {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td className="ltr">{v}</td></tr>)}
      </tbody></table>
      <div className="freeze-block">
        <p className="freeze-k">Action hierarchy</p>
        <p className="freeze-v">search = filled primary · הוסיפו עסק = outlined secondary · כניסה לחשבון = text link (hidden on <span className="ltr">/login</span>) · globe = icon</p>
      </div>
      <div className="freeze-block">
        <p className="freeze-k">Composition — ✓ B · grouped lead</p>
        <p className="freeze-v">logo + nav links grouped at the start · one air gap · action cluster at the end. <span className="ltr">nav: display:flex; justify-content:space-between</span> · <span className="ltr">.lead-group gap 36px</span></p>
        <p className="freeze-v">nav copy: <span className="ltr" dir="rtl">גלו · מפה · אודות</span> — gender-neutral (ADR-014 hybrid: chrome defaults to UI rules · Sapir 2026-06-03)</p>
      </div>
      <div className="freeze-block freeze-pick">
        <p className="freeze-k">Scrolled-gap treatment — ✓ locked: Option 0 · pill-only</p>
        <p className="freeze-v">No shelf. In scrolled state the pill itself goes translucent — content scrolls freely through the open gap. Keeps the float.</p>
        <p className="freeze-v ltr">background: rgba(245,240,232,.85)</p>
        <p className="freeze-v ltr">backdrop-filter: blur(12px)</p>
        <p className="freeze-v ltr">border: 1px #E8E0D0</p>
        <p className="freeze-v ltr">box-shadow: 0 8px 30px rgba(46,104,83,.12)</p>
        <p className="freeze-v freeze-trigger">scrolled style triggers at <span className="ltr">scrollY &gt; 60px</span></p>
      </div>
      <div className="freeze-block freeze-guard">
        <p className="freeze-k">Engineering guardrails</p>
        <p className="freeze-v"><span className="g-dot" /><b>blur ≤ 12px</b> — drop to <span className="ltr">10px</span> if mid-range Android janks</p>
        <p className="freeze-v"><span className="g-dot" />transition <b>background + shadow only</b> — never animate the <span className="ltr">backdrop-filter</span> value</p>
        <p className="freeze-v"><span className="g-dot" />fallback: <span className="ltr">@supports not (backdrop-filter)</span> → solid <span className="ltr">#F5F0E8</span>, no translucency</p>
        <p className="freeze-v"><span className="g-dot" />verify pill <b>text contrast</b> on the <span className="ltr">85%</span> cream surface (WCAG AA)</p>
      </div>
    </div>
  );
}

function SpecSheet({ spec }) {
  const rows = [
    ["max-width", spec.maxWidth + "px"],
    ["margin-top (from viewport top)", spec.marginTop + "px"],
    ["side margin @1280 (auto)", Math.round((1280 - spec.maxWidth) / 2) + "px each"],
    ["zone column-gap", spec.gap + "px"],
    ["pill padding · over-image", spec.padDefault],
    ["pill padding · scrolled", spec.padScrolled],
    ["mobile · margin-top / side", spec.mMarginTop + " / " + spec.mSide + "px"],
  ];
  return (
    <div className="spec">
      <div className="spec-head">{spec.name}<span>{spec.tag}</span></div>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><th>{k}</th><td className="ltr">{v}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="spec-note">{spec.note}</p>
    </div>
  );
}

/* ── Specs ──────────────────────────────────────────────────────── */
const SPECS = [
  {
    id: "A", name: "A · Snug", tag: "conservative",
    maxWidth: 1040, marginTop: 24, gap: 32, padDefault: "10px 24px", padScrolled: "10px 20px",
    mMarginTop: 16, mSide: 16,
    note: "Smallest change from today (1200→1040). Clear side air, familiar rhythm. Safe pick if we want it to read as a tweak, not a redesign.",
  },
  {
    id: "B", name: "B · Float", tag: "recommended",
    maxWidth: 940, marginTop: 32, gap: 40, padDefault: "12px 20px", padScrolled: "10px 16px",
    mMarginTop: 20, mSide: 20,
    note: "The Superpower-principle pick. Narrow + centered, drops 32px from the top so it visibly hovers, with the most generous zone gaps. Reads unmistakably as a floating pill.",
  },
  {
    id: "C", name: "C · Center", tag: "tightest",
    maxWidth: 860, marginTop: 36, gap: 28, padDefault: "10px 18px", padScrolled: "10px 14px",
    mMarginTop: 20, mSide: 24,
    note: "Most compact — links truly hugging center, large negative space either side. Tighten internal gaps so 860px doesn't feel cramped. Boldest 'floating' read.",
  },
];

const DW = 1280, DH = 440, MW = 375, MH = 460;

/* ── Composition A vs B (locked B·Float 940, Option 0 glass) ─────── */
function CompFrame({ compose, state }) {
  const over = state === "over";
  return (
    <div className={"frame " + (over ? "bg-over" : "bg-scroll")} style={{ width: DW, height: DH }}>
      {over ? (
        <div className="hero-ctx">
          <p className="hero-eyebrow">REAL FOOD · STRAIGHT FROM THE SOURCE</p>
          <h2 className="hero-h1">אוכל אמיתי,<br/>ישר <em>מהמקור</em> אלייך</h2>
        </div>
      ) : (
        <div className="scroll-ctx">
          <h2 className="scroll-h1">מהמטבח של השכן</h2>
          <div className="scroll-row"><span/><span/><span/></div>
        </div>
      )}
      <NavDesktop spec={SPECS[1]} state={state} compose={compose} pillOnly={!over} />
    </div>
  );
}

function CompExplain() {
  return (
    <div className="hier">
      <p className="hier-eyebrow">COMPOSITION · BEST-PRACTICES PASS</p>
      <h3>Where do the links sit?</h3>
      <ol className="hier-list">
        <li><span className="dot dot-2" /><b>A · three clusters</b> — logo at the start, links centered in a 1fr track, actions at the end. Symmetric and balanced; the links anchor the middle.</li>
        <li><span className="dot dot-1" /><b>B · grouped lead</b> — logo + links travel together at the start, one clean air gap, actions at the end. The Superpower / Linear pattern, mirrored to RTL — more editorial, more decisive.</li>
      </ol>
      <p className="hier-foot"><b>✓ Locked: B · grouped lead.</b> Logo + links travel together at the start with one clean air gap before the actions — the more editorial, decisive read. Nav copy <span className="ltr" dir="rtl">גלו</span> (gender-neutral, ADR-014 hybrid). Everything else is the freeze: 940 · Option 0 glass · search-primary hierarchy.</p>
    </div>
  );
}

function App() {
  return (
    <DesignCanvas>
      <DCSection id="intro" title="FloatingNavbar · pill refinement" subtitle="MEH-732 · width + spacing exploration · v5 locked structure, RTL Hebrew · design only">
        <DCArtboard id="brief" label="Read me first" width={620} height={540}>
          <div className="brief">
            <p className="brief-eyebrow">DESIGN ONLY · NO CODE</p>
            <h3>Three ways to make the pill float.</h3>
            <p>Each row below shows one width/spacing direction — <strong>desktop 1280</strong> + <strong>mobile 375</strong>, in both the <strong>over-image</strong> (transparent, light text over the hero) and <strong>scrolled</strong> (cream pill) states.</p>
            <p>Nothing about the locked v5 structure changes — same layout, logo right · links center · actions left. I move four numbers (<span className="ltr">max-width</span>, side margins, zone gaps, <span className="ltr">margin-top</span>) and apply the resolved <strong>action hierarchy</strong> (next card). Exact values sit on the <em>Hand-off values</em> card at the end of each row.</p>
            <div className="brief-base">
              <span className="brief-base-k">Today (baseline)</span>
              <span className="brief-base-v">max-width <b className="ltr">1200px</b> · near edge-to-edge · margin-top <b className="ltr">24px</b> — feels wide, doesn't read as floating.</span>
            </div>
            <p className="brief-foot">Pick a row → I stop. You port the chosen numbers via Claude Code.</p>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="hier" title="Action hierarchy" subtitle="Live-QA fix · one bold action (search) · add-business secondary · login as quiet link · applies to A/B/C">
        <DCArtboard id="hier-explain" label="The decision" width={620} height={620}>
          <HierExplain />
        </DCArtboard>
        <DCArtboard id="hier-over" label="Resolved · over-image (state 1)" width={DW} height={DH}>
          <Frame state="over" device="desktop" spec={SPECS[1]} w={DW} h={DH} />
        </DCArtboard>
        <DCArtboard id="hier-scroll" label="Resolved · scrolled (state 2)" width={DW} height={DH}>
          <Frame state="scroll" device="desktop" spec={SPECS[1]} w={DW} h={DH} />
        </DCArtboard>
        <DCArtboard id="hier-login" label="Inner page = /login · login link hidden (state 3)" width={DW} height={DH}>
          <Frame state="scroll" device="desktop" spec={SPECS[1]} w={DW} h={DH} page="login" />
        </DCArtboard>
      </DCSection>

      {SPECS.map((spec) => (
        <DCSection
          key={spec.id}
          id={spec.id}
          title={spec.name}
          subtitle={`max-width ${spec.maxWidth}px · margin-top ${spec.marginTop}px · zone gap ${spec.gap}px${spec.tag === "recommended" ? "  ·  ★ recommended" : ""}`}
        >
          <DCArtboard id={spec.id + "-d-over"} label="Desktop 1280 · over-image" width={DW} height={DH}>
            <Frame state="over" device="desktop" spec={spec} w={DW} h={DH} />
          </DCArtboard>
          <DCArtboard id={spec.id + "-d-scroll"} label="Desktop 1280 · scrolled" width={DW} height={DH}>
            <Frame state="scroll" device="desktop" spec={spec} w={DW} h={DH} />
          </DCArtboard>
          <DCArtboard id={spec.id + "-m-over"} label="Mobile 375 · over-image" width={MW} height={MH}>
            <Frame state="over" device="mobile" spec={spec} w={MW} h={MH} />
          </DCArtboard>
          <DCArtboard id={spec.id + "-m-scroll"} label="Mobile 375 · scrolled" width={MW} height={MH}>
            <Frame state="scroll" device="mobile" spec={spec} w={MW} h={MH} />
          </DCArtboard>
          <DCArtboard id={spec.id + "-spec"} label="Hand-off values" width={420} height={MH}>
            <SpecSheet spec={spec} />
          </DCArtboard>
        </DCSection>
      ))}

      <DCSection id="gap" title="Scrolled-gap treatment" subtitle="B·Float 940 · narrow pill exposes content in the top slot + side margins · pick one treatment → freeze">
        <DCArtboard id="gap-none" label="The collision (today)" width={DW} height={DH}>
          <GapDemo treatment="none" />
        </DCArtboard>
        <DCArtboard id="gap-band" label="Option 1 · Backdrop band" width={DW} height={DH}>
          <GapDemo treatment="band" />
        </DCArtboard>
        <DCArtboard id="gap-blur" label="Option 2 · Backdrop-blur" width={DW} height={DH}>
          <GapDemo treatment="blur" />
        </DCArtboard>
        <DCArtboard id="gap-freeze" label="Freeze sheet · port values" width={460} height={1100}>
          <FreezeSheet />
        </DCArtboard>
      </DCSection>

      <DCSection id="gap2" title="Pill-only vs blur — the float decision" subtitle="✓ LOCKED: Option 0 · pill-only · B·Float 940 · the translucent pill holds the float without becoming a header bar">
        <DCArtboard id="gap2-explain" label="The decision" width={560} height={580}>
          <GapDecision />
        </DCArtboard>
        <DCArtboard id="gap2-o0-d" label="✓ Option 0 · pill-only · desktop 1280 (LOCKED)" width={DW} height={DH}>
          <GapScene treatment="pillonly" device="desktop" />
        </DCArtboard>
        <DCArtboard id="gap2-o2-d" label="Option 2 · blur shelf · desktop (not chosen)" width={DW} height={DH}>
          <GapScene treatment="blur" device="desktop" />
        </DCArtboard>
        <DCArtboard id="gap2-o0-m" label="✓ Option 0 · pill-only · mobile 375 (LOCKED)" width={MW} height={540}>
          <GapScene treatment="pillonly" device="mobile" />
        </DCArtboard>
        <DCArtboard id="gap2-o2-m" label="Option 2 · blur shelf · mobile (not chosen)" width={MW} height={540}>
          <GapScene treatment="blur" device="mobile" />
        </DCArtboard>
      </DCSection>

      <DCSection id="compose" title="Composition — clusters vs grouped lead" subtitle="✓ LOCKED: B · grouped lead + air gap · B·Float 940 · Option 0 glass · nav copy גלו">
        <DCArtboard id="comp-explain" label="The two arrangements" width={560} height={DH}>
          <CompExplain />
        </DCArtboard>
        <DCArtboard id="comp-b-over" label="✓ B · grouped lead · over-image (LOCKED)" width={DW} height={DH}>
          <CompFrame compose="B" state="over" />
        </DCArtboard>
        <DCArtboard id="comp-b-scroll" label="✓ B · grouped lead · scrolled glass (LOCKED)" width={DW} height={DH}>
          <CompFrame compose="B" state="scroll" />
        </DCArtboard>
        <DCArtboard id="comp-a-over" label="A · three clusters · over-image (not chosen)" width={DW} height={DH}>
          <CompFrame compose="A" state="over" />
        </DCArtboard>
        <DCArtboard id="comp-a-scroll" label="A · three clusters · scrolled (not chosen)" width={DW} height={DH}>
          <CompFrame compose="A" state="scroll" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
