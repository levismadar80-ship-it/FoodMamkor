/* navsystem-app.jsx — Phase 6 nav system: frames, cards, canvas, tweaks. */

const NS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface": "cream",
  "activeStyle": "green",
  "labels": true
}/*EDITMODE-END*/;

const { useState: nsUseState } = React;
const MW6 = 375, MH6 = 740, DW6 = 1280, DH6 = 480;
const NS_CHIPS = ["גבינות מהחווה", "לחם מחמצת", "שמן זית", "ירקות אורגני", "דבש"];

function NsHeroCtx({ desktop = false }) {
  return (
    <div className="hero-ctx">
      <p className="hero-eyebrow">REAL FOOD · STRAIGHT FROM THE SOURCE</p>
      <h2 className="hero-h1">אוכל אמיתי,<br/>ישר <em>מהמקור</em> אלייך</h2>
    </div>
  );
}
function NsPhoto({ slotId }) {
  return (
    <div className="photo-layer">
      <div className="photo-fallback"></div>
      <image-slot id={slotId} shape="rect" placeholder="גררו לכאן צילום תוצרת (Cloudinary)"></image-slot>
      <div className="photo-overlay"></div>
    </div>
  );
}
function NsScrollCtx({ mobile = false }) {
  return (
    <React.Fragment>
      <div className="scroll-chips">
        {NS_CHIPS.slice(0, mobile ? 3 : 5).map((c) => <span className="scroll-chip" key={c}>{c}</span>)}
      </div>
      <div className="scroll-ctx">
        <h2 className="scroll-h1">מהמקור — ישר אלייך</h2>
        <div className="scroll-row"><span></span><span></span><span></span></div>
      </div>
    </React.Fragment>
  );
}

/* ── Mobile frame ───────────────────────────────────────────────── */
function MobileFrame({ state, auth, t, producer = false, sheet = false, slotId }) {
  const over = state === "over";
  const [active, setActive] = nsUseState(sheet ? "account" : "discover");
  const [sheetOpen, setSheetOpen] = nsUseState(sheet);
  const onTab = (id) => {
    setActive(id);
    if (id === "account") setSheetOpen((v) => !v); else setSheetOpen(false);
  };
  return (
    <div className={"frame frame-m " + (over ? "" : "bg-scroll")} style={{ width: MW6, height: MH6 }}>
      {over ? <NsPhoto slotId={slotId} /> : null}
      {over ? <NsHeroCtx /> : <NsScrollCtx mobile />}
      <TopBarMobile state={state} surface={t.surface} />
      {sheetOpen && <AccountSheet auth={auth} producer={producer} />}
      <BottomPill state={state} surface={t.surface} active={active} activeStyle={t.activeStyle} labels={t.labels} auth={auth} onTab={onTab} />
    </div>
  );
}

/* ── Desktop frame ──────────────────────────────────────────────── */
function DesktopFrame({ state, auth, t, showCta = true, slotId }) {
  const over = state === "over";
  return (
    <div className={"frame frame-d " + (over ? "" : "bg-scroll")} style={{ width: DW6, height: DH6 }}>
      {over ? <NsPhoto slotId={slotId} /> : null}
      {over ? <NsHeroCtx desktop /> : <NsScrollCtx />}
      <TopBarDesktop state={state} surface={t.surface} auth={auth} showCta={showCta} />
    </div>
  );
}

/* ── Cards ──────────────────────────────────────────────────────── */
function NsBriefCard() {
  return (
    <div className="card">
      <p className="card-eyebrow">NAV SYSTEM · BOTTOM-PRIMARY · DIRECTION A</p>
      <h3>Cream Signature — the pill moves to the thumb.</h3>
      <p>Primary nav lives in a floating cream pill at the bottom — <b>4 destinations, zero actions</b>: גלו · מפה · אודות · חשבון. The mobile top shrinks to <b>logo + quiet search only</b>.</p>
      <ul className="card-list">
        <li><span className="card-num">01</span><b>Pill-in-pill active:</b> filled green tab, cream icon + label; Phosphor fill-on-active. Over photography the active flips cream-on-dark for AA.</li>
        <li><span className="card-num">02</span><b>הוסיפו עסק is an action, not a tab</b> — a quiet text link + gold ↗ in the desktop top corner (the Yelp / TripAdvisor / OpenTable “for businesses” pattern); no fill, no button. Off mobile chrome entirely: account-sheet entry «יש לך בית עסק?» + footer + /for-businesses <span className="ltr">[pending Sapir]</span>. Producers/admins (MEH-669) see none of them.</li>
        <li><span className="card-num">03</span><b>Hamburger retired.</b> Secondary (login, favorites, settings, language, logout) moves to a warm-dark account sheet — the old drawer's surface + gold numerals, demoted to secondary duty.</li>
        <li><span className="card-num">04</span><b>One family:</b> top bar, bottom pill and sheet share radius, icon set and surface tokens. Desktop keeps a single refined top bar — no bottom nav.</li>
      </ul>
      <p className="card-foot"><b>Over-image:</b> real produce photography (drop a photo into any hero slot — it persists) with the brand bottom overlay; the pills carry their own contents-veil <span className="ltr">rgba(22,38,30,.34) + blur 10px</span>. Tabs are clickable; tweak surface / active style / labels live.</p>
    </div>
  );
}

function NsPatternsCard() {
  return (
    <div className="card">
      <p className="card-eyebrow">PATTERNS &amp; ANTI-PATTERNS</p>
      <h3>Borrowed forms, owned voice.</h3>
      <ul className="card-list">
        <li><span className="card-num">01</span><b>Floating bottom tab pill</b> — Instagram's form: equal-weight icons, subtle active highlight, thumb-zone reach. Re-skinned in cream/green/gold so it reads Mehamakor, not Meta.</li>
        <li><span className="card-num">02</span><b>Minimal masthead</b> — Kinfolk / Cereal: the top recedes to logo + one quiet tool; whitespace does the segmentation.</li>
        <li><span className="card-num">03</span><b>Produce-forward hero</b> — Natoora: full-bleed photography with a warm overlay; chrome floats above it instead of replacing it.</li>
      </ul>
      <div className="card-divider"></div>
      <ul className="card-list">
        <li><span className="card-x">✕</span><b>Action-in-tab-bar</b> — «הוסיפו עסק» never becomes a fifth tab. Tab bars navigate; bending one to carry a primary action is the classic mobile anti-pattern.</li>
        <li><span className="card-x">✕</span><b>Loud search CTA</b> — the Wolt/10bis marketplace tell. Search stays a quiet icon, top, equal weight with everything else.</li>
      </ul>
      <p className="card-foot">Copy is DNA-lock clean: <b>גלו · מפה · אודות · הוסיפו עסק · כניסה לחשבון · מהמקור — ישר אלייך.</b></p>
    </div>
  );
}

function NsSpecCard() {
  const rows = [
    ["bottom pill", "max 343px · inset 16px · pad 6px"],
    ["tabs", "4 · min 64×56px (≥44 target)"],
    ["icons", "Phosphor regular · fill-on-active"],
    ["tab set", "compass · map-trifold · flower · user/avatar"],
    ["labels", "DM Sans 500 · 11px"],
    ["active (cream surf)", "#2E6853 fill · #F5F0E8 content"],
    ["active (over photo)", "rgba(245,240,232,.94) · #1F4A38"],
    ["surface · cream", "#F5F0E8 · 1px #E8E0D0"],
    ["surface · over", "rgba(22,38,30,.34) · blur 10px"],
    ["surface · glass alt", "#F5F0E8 @85% · blur 12px"],
    ["CTA", "desktop · quiet text link · #1F4A38 + ↗ #8B6914"],
    ["CTA mobile paths", "account sheet · footer · /for-businesses*"],
    ["CTA gate", "hidden for producer/admin (MEH-669)"],
    ["account sheet", "#1E3527 · radius 20 · secondary only"],
    ["motion", "200ms ease · reduced-motion → instant"],
    ["hide-on-scroll", "reuse MEH-734 (top + bottom)"],
    ["desktop", "single top bar 1040px · no bottom nav"],
  ];
  return (
    <div className="card spec">
      <p className="card-eyebrow">HAND-OFF VALUES</p>
      <h3>Port sheet — nav system v1.</h3>
      <table><tbody>
        {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td className="ltr">{v}</td></tr>)}
      </tbody></table>
      <p className="spec-k">Copy (ADR-014 · chrome = neutral plural)</p>
      <p className="card-foot" style={{ marginTop: 0, paddingTop: 8, borderTop: "none" }}>גלו · מפה · אודות · חשבון · הוסיפו עסק — forbidden home-cook phrases nowhere in the system.</p>
    </div>
  );
}

/* ── App ────────────────────────────────────────────────────────── */
function NsApp() {
  const [t, setTweak] = useTweaks(NS_DEFAULTS);
  return (
    <React.Fragment>
      <DesignCanvas>
        <DCSection id="p6-intro" title="Nav System · bottom-primary" subtitle="Direction A · Cream Signature · supersedes the top-pill-only pass · RTL Hebrew · design only">
          <DCArtboard id="p6-brief" label="Read me first" width={620} height={640}>
            <NsBriefCard />
          </DCArtboard>
          <DCArtboard id="p6-patterns" label="Patterns · anti-patterns" width={620} height={640}>
            <NsPatternsCard />
          </DCArtboard>
        </DCSection>

        <DCSection id="p6-mobile" title="Mobile 375" subtitle="Signature bottom pill (4 destinations) + minimal top · tabs are clickable · drop a real produce photo into the hero slots">
          <DCArtboard id="p6-m-over-out" label="Over-image · logged-out" width={MW6} height={MH6}>
            <MobileFrame state="over" auth="out" t={t} slotId="p6-hero-m-out" />
          </DCArtboard>
          <DCArtboard id="p6-m-over-in" label="Over-image · logged-in (avatar tab)" width={MW6} height={MH6}>
            <MobileFrame state="over" auth="in" t={t} slotId="p6-hero-m-in" />
          </DCArtboard>
          <DCArtboard id="p6-m-scroll-out" label="Scrolled · logged-out" width={MW6} height={MH6}>
            <MobileFrame state="scroll" auth="out" t={t} />
          </DCArtboard>
          <DCArtboard id="p6-m-scroll-in" label="Scrolled · logged-in" width={MW6} height={MH6}>
            <MobileFrame state="scroll" auth="in" t={t} />
          </DCArtboard>
          <DCArtboard id="p6-m-sheet" label="Account sheet open · secondary items" width={MW6} height={MH6}>
            <MobileFrame state="scroll" auth="in" t={t} sheet />
          </DCArtboard>
          <DCArtboard id="p6-m-gate" label="Producer/admin · sheet without business entry (MEH-669)" width={MW6} height={MH6}>
            <MobileFrame state="scroll" auth="in" t={t} sheet producer />
          </DCArtboard>
        </DCSection>

        <DCSection id="p6-desktop" title="Desktop 1280" subtitle="Single refined top bar · links inline · one CTA · no bottom nav">
          <DCArtboard id="p6-d-over" label="Over-image · logged-out" width={DW6} height={DH6}>
            <DesktopFrame state="over" auth="out" t={t} slotId="p6-hero-d" />
          </DCArtboard>
          <DCArtboard id="p6-d-scroll" label="Scrolled · logged-in (avatar)" width={DW6} height={DH6}>
            <DesktopFrame state="scroll" auth="in" t={t} />
          </DCArtboard>
        </DCSection>

        <DCSection id="p6-spec" title="Hand-off" subtitle="Everything needed to port the system">
          <DCArtboard id="p6-spec-sheet" label="Port sheet" width={520} height={880}>
            <NsSpecCard />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="Bottom pill" />
        <TweakRadio label="Surface" value={t.surface} options={["cream", "glass", "dark"]} onChange={(v) => setTweak("surface", v)} />
        <TweakRadio label="Active state" value={t.activeStyle} options={["green", "light", "gold"]} onChange={(v) => setTweak("activeStyle", v)} />
        <TweakToggle label="Labels" value={t.labels} onChange={(v) => setTweak("labels", v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<NsApp />);
