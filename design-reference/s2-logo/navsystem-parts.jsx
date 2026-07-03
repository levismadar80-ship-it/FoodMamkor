/* navsystem-parts.jsx — Phase 6 nav system: shared pieces.
   Exports to window for navsystem-app.jsx (Babel scripts don't share scope). */

/* ── Logo ───────────────────────────────────────────────────────── */
function nsPetals(light) {
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
function nsLogoSVG(light) {
  const word = light ? "#F5F0E8" : "#1C1A17";
  const sub = light ? "#C9D9B8" : "#5c584f";
  return `<svg viewBox="0 0 460 140" role="img" aria-label="מהמקור">
    <g transform="translate(410 70) scale(0.58)"><g opacity="0.94">${nsPetals(light)}</g></g>
    <text x="350" y="80" text-anchor="end" direction="rtl" font-family="'Frank Ruhl Libre',serif" font-weight="700" font-size="50" fill="${word}">מהמקור</text>
    <text x="350" y="104" text-anchor="end" direction="rtl" font-family="'Cormorant Garamond',serif" font-style="italic" font-weight="500" font-size="15" fill="${sub}" letter-spacing="0.02em">— from the source</text>
  </svg>`;
}
function NsRaw({ html, className, style }) {
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* surface class for the shared pill family */
function nsSurf(state, surface) {
  if (state === "over") return "surf-over";
  return surface === "glass" ? "surf-glass" : surface === "dark" ? "surf-dark" : "surf-cream";
}

/* ── Mobile top bar — logo · search · ONE CTA (gated) ───────────── */
function TopBarMobile({ state, surface }) {
  const over = state === "over";
  return (
    <div className="topbar-shell">
      <div className={"topbar pillsurf " + nsSurf(state, surface === "dark" ? "cream" : surface) + (over ? " is-over" : "")}>
        <a className="logo" href="#" aria-label="מהמקור"><NsRaw html={nsLogoSVG(over)} /></a>
        <div className="top-actions">
          <button className="ico-btn" type="button" aria-label="חיפוש"><i className="ph ph-magnifying-glass" aria-hidden="true"></i></button>
        </div>
      </div>
    </div>
  );
}

/* ── Signature bottom pill — 4 DESTINATIONS, no actions ─────────── */
const NS_TABS = [
  { id: "discover", label: "גלו", icon: "ph-compass" },
  { id: "map", label: "מפה", icon: "ph-map-trifold" },
  { id: "about", label: "אודות", icon: "ph-flower" },
  { id: "account", label: "חשבון", icon: "ph-user" },
];

function BottomPill({ state, surface, active, activeStyle, labels, auth, onTab }) {
  const over = state === "over";
  const botClass = over ? "bot-over" : surface === "dark" ? "bot-dark" : "";
  return (
    <div className="botbar-shell">
      <nav
        className={[
          "botbar pillsurf",
          nsSurf(state, surface),
          "act-" + activeStyle,
          botClass,
          labels ? "" : "no-labels",
        ].join(" ")}
        aria-label="ניווט ראשי"
      >
        {NS_TABS.map((tab) => {
          const isActive = active === tab.id;
          const fillIcon = activeStyle !== "gold" && isActive;
          return (
            <button
              key={tab.id}
              type="button"
              className={"tab" + (isActive ? " is-active" : "")}
              aria-current={isActive ? "page" : undefined}
              aria-label={tab.id === "account" ? (auth === "in" ? "החשבון שלי" : "כניסה לחשבון") : tab.label}
              onClick={onTab ? () => onTab(tab.id) : undefined}
            >
              {tab.id === "account" && auth === "in"
                ? <span className="tab-avatar">ס</span>
                : <i className={(fillIcon ? "ph-fill " : "ph ") + tab.icon} aria-hidden="true"></i>}
              <span className="tab-label">{tab.id === "account" && auth === "in" ? "ספיר" : tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ── Account sheet — secondary items only (drawer retired) ──────── */
function AccountSheet({ auth, producer = false }) {
  return (
    <React.Fragment>
      <div className="sheet-scrim"></div>
      <div className="sheet" role="dialog" aria-label="חשבון והגדרות">
        <div className="sheet-head">
          <span className="sheet-avatar">{auth === "in" ? "ס" : <i className="ph ph-user" aria-hidden="true"></i>}</span>
          <div>
            <p className="sheet-name">{auth === "in" ? "ספיר" : "אורחת"}</p>
            <p className="sheet-sub">{auth === "in" ? "מחוברת" : "עוד לא בפנים"}</p>
          </div>
        </div>
        <ul className="sheet-rows">
          {auth === "out" && (
            <li><button type="button" className="sheet-row"><i className="ph ph-sign-in" aria-hidden="true"></i>כניסה לחשבון</button></li>
          )}
          <li><button type="button" className="sheet-row"><i className="ph ph-heart" aria-hidden="true"></i>מועדפים</button></li>
          <li><button type="button" className="sheet-row"><i className="ph ph-gear" aria-hidden="true"></i>הגדרות</button></li>
          {!producer && (
            <li><button type="button" className="sheet-row is-biz"><i className="ph ph-storefront" aria-hidden="true"></i>יש לך בית עסק?<span className="biz-arrow" aria-hidden="true">↗</span></button></li>
          )}
          <li>
            <button type="button" className="sheet-row is-quiet">
              <i className="ph ph-globe-simple" aria-hidden="true"></i>שפה
              <span className="sheet-num ltr"><span className="lang-b">עב</span> / EN</span>
            </button>
          </li>
          {auth === "in" && (
            <li><button type="button" className="sheet-row is-quiet"><i className="ph ph-sign-out" aria-hidden="true"></i>התנתקות</button></li>
          )}
        </ul>
      </div>
    </React.Fragment>
  );
}

/* ── Desktop top bar — single refined bar, no bottom nav ────────── */
function TopBarDesktop({ state, surface, auth, showCta = true }) {
  const over = state === "over";
  return (
    <div className="topbar-d-shell">
      <nav className={"topbar-d pillsurf " + nsSurf(state, surface === "dark" ? "cream" : surface) + (over ? " is-over" : "")} aria-label="primary">
        <div className="lead-group">
          <a className="logo logo-d" href="#" aria-label="מהמקור"><NsRaw html={nsLogoSVG(over)} /></a>
          <ul className="nav-links">
            <li><a className="nav-link is-current" href="#">גלו</a></li>
            <li><a className="nav-link" href="#">מפה</a></li>
            <li><a className="nav-link" href="#">אודות</a></li>
          </ul>
        </div>
        <div className="actions">
          <div className="trio">
            <button className="ico-btn" type="button" aria-label="חיפוש"><i className="ph ph-magnifying-glass" aria-hidden="true"></i></button>
            <button className="ico-btn" type="button" aria-label="שפה · עברית / English"><i className="ph ph-globe-simple" aria-hidden="true"></i></button>
            {auth === "in"
              ? <button className="avatar-btn" type="button" aria-label="החשבון שלי"><span className="avatar">ס</span></button>
              : <button className="ico-btn" type="button" aria-label="כניסה לחשבון"><i className="ph ph-user" aria-hidden="true"></i></button>}
          </div>
          {showCta && (
            <a href="#" className="cta-link">הוסיפו עסק <span className="arrow" aria-hidden="true">↗</span></a>
          )}
        </div>
      </nav>
    </div>
  );
}

Object.assign(window, { nsLogoSVG, NsRaw, nsSurf, TopBarMobile, BottomPill, AccountSheet, TopBarDesktop, NS_TABS });
