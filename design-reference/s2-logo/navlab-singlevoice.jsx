/* navlab-singlevoice.jsx — FloatingNavbar v6 · Direction C "Single Voice"
   Pill-contents redesign on the LOCKED MEH-732 base (B·Float 940 · grouped lead ·
   Option 0 glass · scrollY>60 trigger). Strategy locked upstream:
   search→icon · ONE emphasized CTA (הוסיפו עסק) · login folds into the icon trio.
   Tweaks: CTA treatment (filled/ghost/gold) · cluster tightness.
   Icon language: Phosphor regular, equal weight — shared family with the planned
   Instagram-style floating BottomNav pill (sibling brief). RTL Hebrew, ADR-014 chrome copy. */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "ctaTreatment": "filled",
  "tightness": 50
}/*EDITMODE-END*/;

const lerp = (a, b, t) => Math.round(a + (b - a) * (t / 100));

/* ── Logo (inline so wordmark can flip cream on dark) ───────────── */
function svPetals(light) {
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
function svLogoSVG(light) {
  const word = light ? "#F5F0E8" : "#1C1A17";
  const sub = light ? "#C9D9B8" : "#5c584f";
  return `<svg viewBox="0 0 460 140" role="img" aria-label="מהמקור">
    <g transform="translate(410 70) scale(0.58)"><g opacity="0.94">${svPetals(light)}</g></g>
    <text x="350" y="80" text-anchor="end" direction="rtl" font-family="'Frank Ruhl Libre',serif" font-weight="700" font-size="50" fill="${word}">מהמקור</text>
    <text x="350" y="104" text-anchor="end" direction="rtl" font-family="'Cormorant Garamond',serif" font-style="italic" font-weight="500" font-size="15" fill="${sub}" letter-spacing="0.02em">— from the source</text>
  </svg>`;
}
function SvRaw({ html, className, style }) {
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ── CTA — the single emphasized action ─────────────────────────── */
function Cta({ treatment, drawer = false }) {
  if (drawer) {
    return (
      <button type="button" className="drawer-cta">
        הוסיפו עסק <span className="arrow" aria-hidden="true">↗</span>
      </button>
    );
  }
  return (
    <button type="button" className={"cta cta-" + treatment}>
      הוסיפו עסק <span className="arrow" aria-hidden="true">↗</span>
    </button>
  );
}

/* ── Desktop pill ───────────────────────────────────────────────── */
function NavDesktop({ state, auth, treatment, tight }) {
  const over = state === "over";
  const linksGap = lerp(34, 22, tight);
  const leadGap = lerp(42, 28, tight);
  const iconGap = lerp(8, 0, tight);
  const actionsGap = lerp(18, 8, tight);
  return (
    <div className="shell" style={{ paddingTop: 32 }}>
      <nav
        className={"nav " + (over ? "is-over" : "is-scrolled")}
        style={{ padding: over ? "12px 20px" : "10px 16px" }}
        aria-label="primary"
      >
        <div className="lead-group" style={{ gap: leadGap }}>
          <a className="logo" href="#" aria-label="מהמקור"><SvRaw html={svLogoSVG(over)} /></a>
          <ul className="nav-links" style={{ gap: linksGap }}>
            <li><a className="nav-link is-current" href="#">גלו</a></li>
            <li><a className="nav-link" href="#">מפה</a></li>
            <li><a className="nav-link" href="#">אודות</a></li>
          </ul>
        </div>
        <div className="actions" style={{ gap: actionsGap }}>
          <div className="trio" style={{ gap: iconGap }}>
            <button className="ico-btn" type="button" aria-label="חיפוש"><i className="ph ph-magnifying-glass" aria-hidden="true"></i></button>
            <button className="ico-btn" type="button" aria-label="שפה · עברית / English"><i className="ph ph-globe-simple" aria-hidden="true"></i></button>
            {auth === "in" ? (
              <button className="avatar-btn" type="button" aria-label="החשבון שלי">
                <span className="avatar">ס</span>
              </button>
            ) : (
              <button className="ico-btn" type="button" aria-label="כניסה לחשבון"><i className="ph ph-user" aria-hidden="true"></i></button>
            )}
          </div>
          <Cta treatment={treatment} />
        </div>
      </nav>
    </div>
  );
}

/* ── Mobile pill + hamburger trigger ────────────────────────────── */
function NavMobile({ state, menuOpen = false }) {
  const over = state === "over";
  return (
    <div className="shell shell-m" style={{ paddingTop: 20 }}>
      <nav
        className={"nav " + (over ? "is-over" : "is-scrolled")}
        style={{ padding: "8px 8px 8px 10px" }}
        aria-label="primary"
      >
        <a className="logo logo-m" href="#" aria-label="מהמקור"><SvRaw html={svLogoSVG(over)} /></a>
        <div className="actions" style={{ gap: 2 }}>
          <button className="ico-btn" type="button" aria-label="חיפוש"><i className="ph ph-magnifying-glass" aria-hidden="true"></i></button>
          <button className="ico-btn" type="button" aria-label={menuOpen ? "סגרו תפריט" : "פתחו תפריט"} aria-expanded={menuOpen}>
            <i className={"ph " + (menuOpen ? "ph-x" : "ph-list")} aria-hidden="true"></i>
          </button>
        </div>
      </nav>
    </div>
  );
}

/* ── Mobile drawer — warm-dark, v5 structure kept, restyled ─────── */
function Drawer({ treatment }) {
  return (
    <div className="drawer" role="dialog" aria-label="תפריט ראשי">
      <ul className="drawer-links">
        <li><a className="drawer-link is-current" href="#"><span>גלו</span><span className="drawer-num">01</span></a></li>
        <li><a className="drawer-link" href="#"><span>מפה</span><span className="drawer-num">02</span></a></li>
        <li><a className="drawer-link" href="#"><span>אודות</span><span className="drawer-num">03</span></a></li>
      </ul>
      <div className="drawer-foot">
        <Cta treatment={treatment} drawer />
        <div className="drawer-quiet-row">
          <a className="drawer-login" href="#">כניסה לחשבון</a>
          <button className="drawer-lang" type="button" aria-label="שפה">
            <i className="ph ph-globe-simple" aria-hidden="true"></i>
            <span><b>עב</b> / EN</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Frames ─────────────────────────────────────────────────────── */
const DW = 1280, DH = 440, MW = 375, MH = 480;
const CHIPS = ["גבינות מהחווה", "לחם מחמצת", "שמן זית", "ירקות אורגני", "דבש", "מאפים"];

function HeroCtx() {
  return (
    <div className="hero-ctx">
      <p className="hero-eyebrow">REAL FOOD · STRAIGHT FROM THE SOURCE</p>
      <h2 className="hero-h1">אוכל אמיתי,<br/>ישר <em>מהמקור</em> אלייך</h2>
    </div>
  );
}
function ScrollCtx({ mobile = false }) {
  return (
    <React.Fragment>
      <div className="scroll-chips">
        {CHIPS.slice(0, mobile ? 3 : 6).map((c) => <span className="scroll-chip" key={c}>{c}</span>)}
      </div>
      <div className="scroll-ctx">
        <h2 className="scroll-h1">מהמטבח של השכן</h2>
        <div className="scroll-row"><span></span><span></span><span></span></div>
      </div>
    </React.Fragment>
  );
}

function DesktopFrame({ state, auth, treatment, tight }) {
  const over = state === "over";
  return (
    <div className={"frame " + (over ? "bg-over" : "bg-scroll")} style={{ width: DW, height: DH }}>
      {over ? <HeroCtx /> : <ScrollCtx />}
      <NavDesktop state={state} auth={auth} treatment={treatment} tight={tight} />
    </div>
  );
}

function MobileFrame({ state, drawer = false, treatment }) {
  const over = state === "over";
  const h = drawer ? 640 : MH;
  return (
    <div className={"frame frame-m " + (over ? "bg-over" : "bg-scroll")} style={{ width: MW, height: h }}>
      {over ? <HeroCtx /> : <ScrollCtx mobile />}
      <NavMobile state={state} menuOpen={drawer} />
      {drawer && <Drawer treatment={treatment} />}
    </div>
  );
}

/* ── Cards ──────────────────────────────────────────────────────── */
function BriefCard() {
  return (
    <div className="card">
      <p className="card-eyebrow">PILL REDESIGN · DIRECTION C LOCKED</p>
      <h3>Single Voice — two weights, one action.</h3>
      <p>The v5 action cluster spoke four interactive languages at once: text link + icon + outlined pill + filled green search. This pass reduces the whole bar to <b>two visual weights</b> — quiet line-work, and exactly one emphasized CTA.</p>
      <ul className="card-list">
        <li><span className="card-num">01</span><b>Search → quiet icon.</b> The green button is gone. Magnifying glass sits in the trio, equal weight with the globe.</li>
        <li><span className="card-num">02</span><b>Login folds into the trio.</b> A Phosphor <span className="ltr">user</span> icon logged-out; a 30px Frank Ruhl initial avatar logged-in. No second button style anywhere.</li>
        <li><span className="card-num">03</span><b>One CTA — הוסיפו עסק.</b> Treatment is the open knob: filled / ghost / gold-typographic. Feel them live in the Tweaks panel.</li>
        <li><span className="card-num">04</span><b>Tightened composition.</b> Lead group + air gap kept (locked), internal gaps close ranks via the tightness tweak.</li>
      </ul>
      <p className="card-foot"><b>Over-image legibility fix:</b> the pill (and only the pill) carries a whisper of dark glass — <span className="ltr">rgba(22,38,30,.30) + blur 10px</span> — so its own contents hold AA over bright produce. No full-band scrim (parked issue stays parked). Hide-on-scroll (MEH-734) and auth logic untouched.</p>
    </div>
  );
}

function PatternsCard() {
  return (
    <div className="card">
      <p className="card-eyebrow">PATTERNS &amp; ANTI-PATTERNS</p>
      <h3>What this borrows, what it refuses.</h3>
      <ul className="card-list">
        <li><span className="card-num">01</span><b>Equal-weight icon reduction</b> — Instagram top chrome. Search, globe and account read as one matched Phosphor set; no icon outranks another. Shared family with the planned floating BottomNav pill.</li>
        <li><span className="card-num">02</span><b>Grouped masthead + air gap</b> — Kinfolk / Cereal. Logo and links travel together like a print masthead; one deliberate gap before the actions, segmentation by air alone — no hairlines, no fills.</li>
        <li><span className="card-num">03</span><b>Single clear action</b> — the Airbnb reduction principle (and only that). One emphasized CTA per surface; everything else recedes. The search-as-hero half of that pattern is deliberately NOT borrowed.</li>
      </ul>
      <div className="card-divider"></div>
      <ul className="card-list">
        <li><span className="card-x">✕</span><b>Search as a loud CTA</b> — the Wolt/10bis marketplace tell. A magazine's search is a quiet tool, not a storefront door.</li>
        <li><span className="card-x">✕</span><b>Competing button fills</b> — v5's green search vs outlined add-business. Two containers fighting is what made the bar read transactional.</li>
      </ul>
      <p className="card-foot">3-second read target: <b>editorial magazine, not marketplace.</b> The produce stays the hero; the chrome recedes to two weights.</p>
    </div>
  );
}

function SpecCard() {
  const rows = [
    ["base (locked, MEH-732)", "940px · top 32px · grouped lead"],
    ["scrolled glass (locked)", "#F5F0E8 @85% · blur 12px"],
    ["over-image veil (new)", "rgba(22,38,30,.30) · blur 10px"],
    ["over-image border", "rgba(245,240,232,.14) 1px"],
    ["icon buttons", "44×44 hit · 20px glyph"],
    ["icons", "Phosphor regular (ADR-013)"],
    ["trio", "magnifying-glass · globe-simple · user"],
    ["avatar (logged-in)", "30px · Frank Ruhl 700 · #EAF3DE"],
    ["CTA filled", "#2E6853 · cream text · flips cream over image"],
    ["CTA ghost", "1px #2E6853 · fills on hover"],
    ["CTA gold", "text + ↗ #8B6914 / #E7C88A over image"],
    ["tightness 0→100 · links gap", "34px → 22px"],
    ["tightness · lead gap", "42px → 28px"],
    ["tightness · icon gap", "8px → 0px"],
    ["tightness · trio→CTA gap", "18px → 8px"],
    ["mobile pill", "logo · search icon · burger (44px)"],
    ["mobile CTA + login + lang", "in drawer (structure kept)"],
  ];
  return (
    <div className="card spec">
      <p className="card-eyebrow">HAND-OFF VALUES</p>
      <h3>Port sheet — v6 Single Voice.</h3>
      <table><tbody>
        {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td className="ltr">{v}</td></tr>)}
      </tbody></table>
      <p className="spec-k">Copy (ADR-014 · chrome = neutral plural)</p>
      <p className="card-foot" style={{ marginTop: 0, paddingTop: 8, borderTop: "none" }}>גלו · מפה · אודות · הוסיפו עסק · כניסה לחשבון — no Lorem Ipsum. Behavior layer (hide-on-scroll MEH-734, auth states) reused as-is.</p>
    </div>
  );
}

/* ── App ────────────────────────────────────────────────────────── */
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const treatment = t.ctaTreatment;
  const tight = t.tightness;
  return (
    <React.Fragment>
      <DesignCanvas>
        <DCSection id="v6-intro" title="FloatingNavbar v6 · Single Voice" subtitle="Direction C locked · pill-contents redesign on the MEH-732 freeze · RTL Hebrew · design only">
          <DCArtboard id="v6-brief" label="Read me first" width={620} height={620}>
            <BriefCard />
          </DCArtboard>
          <DCArtboard id="v6-patterns" label="Patterns · anti-patterns" width={620} height={620}>
            <PatternsCard />
          </DCArtboard>
        </DCSection>

        <DCSection id="v6-desktop" title="Desktop 1280" subtitle="Both surface states × both auth states · icon trio (search · globe · account) + one CTA · tweak the CTA treatment live">
          <DCArtboard id="v6-d-over-out" label="Over-image · logged-out" width={DW} height={DH}>
            <DesktopFrame state="over" auth="out" treatment={treatment} tight={tight} />
          </DCArtboard>
          <DCArtboard id="v6-d-scroll-out" label="Scrolled glass · logged-out" width={DW} height={DH}>
            <DesktopFrame state="scroll" auth="out" treatment={treatment} tight={tight} />
          </DCArtboard>
          <DCArtboard id="v6-d-over-in" label="Over-image · logged-in (avatar)" width={DW} height={DH}>
            <DesktopFrame state="over" auth="in" treatment={treatment} tight={tight} />
          </DCArtboard>
          <DCArtboard id="v6-d-scroll-in" label="Scrolled glass · logged-in (avatar)" width={DW} height={DH}>
            <DesktopFrame state="scroll" auth="in" treatment={treatment} tight={tight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="v6-mobile" title="Mobile 375" subtitle="Quiet search icon + hamburger trigger · CTA, login and language live in the warm-dark drawer (v5 structure kept)">
          <DCArtboard id="v6-m-over" label="Over-image" width={MW} height={MH}>
            <MobileFrame state="over" treatment={treatment} />
          </DCArtboard>
          <DCArtboard id="v6-m-scroll" label="Scrolled glass" width={MW} height={MH}>
            <MobileFrame state="scroll" treatment={treatment} />
          </DCArtboard>
          <DCArtboard id="v6-m-drawer" label="Drawer open · warm-dark" width={MW} height={640}>
            <MobileFrame state="over" drawer treatment={treatment} />
          </DCArtboard>
        </DCSection>

        <DCSection id="v6-spec" title="Hand-off" subtitle="Everything Claude Code needs to port v6 onto FloatingNavbar.jsx">
          <DCArtboard id="v6-spec-sheet" label="Port sheet" width={520} height={920}>
            <SpecCard />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="CTA · הוסיפו עסק" />
        <TweakRadio
          label="Treatment"
          value={treatment}
          options={["filled", "ghost", "gold"]}
          onChange={(v) => setTweak("ctaTreatment", v)}
        />
        <TweakSection label="Composition" />
        <TweakSlider
          label="Cluster tightness"
          value={tight}
          min={0}
          max={100}
          step={5}
          onChange={(v) => setTweak("tightness", v)}
        />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
