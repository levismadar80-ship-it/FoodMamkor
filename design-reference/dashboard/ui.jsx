/* ============================================================
   ui.jsx — shared atoms for the producer dashboard
   ============================================================ */
const { useState, useEffect, useRef } = React;

/* ---- Phosphor icon helper (brand-locked icon set) ---- */
function Icon({ name, weight = "regular", size, className = "", style = {} }) {
  const base = weight === "bold" ? "ph-bold" : weight === "fill" ? "ph-fill" : "ph";
  const st = { lineHeight: 1, ...style };
  if (size) st.fontSize = size;
  return <i className={`${base} ph-${name} ${className}`} style={st} aria-hidden="true"></i>;
}

/* ---- data-binding annotation (deliverable 3) ----
   Wraps a dynamic element; the tag shows only in "שיוכי דאטה" mode.
   nb=true marks a NEEDS-BACKEND element. */
function Bind({ f, nb, children }) {
  return (
    <>
      {children}
      <span className={`bind-tag${nb ? " nb" : ""}`}>{nb ? `NB: ${f}` : f}</span>
    </>
  );
}

/* ---- NEEDS-BACKEND summary panel (shows in bindings mode) ---- */
const NEEDS_BACKEND = [
  "שעות שיא (תובנות) — אין דאטה שעתית; views_by_day הוא יומי בלבד",
  "פילוח לפי שכונה — top_cities נותן עיר בלבד (top-5)",
  "אחוז שינוי מספרי מול תקופה קודמת — קיימת רק מגמה קטגורית (weekly_trend: up/down/stable)",
];
function NeedsBackendPanel() {
  return (
    <section className="nb-panel" dir="rtl">
      <h4>NEEDS-BACKEND — לא לעצב עד שקיים</h4>
      <ul>{NEEDS_BACKEND.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </section>
  );
}

/* ---- tab bar — exists in code: סקירה/עריכה/תובנות/כלים ---- */
const TABS = [
  { key: "home", icon: "squares-four", label: "סקירה" },
  { key: "edit", icon: "pencil-simple", label: "עריכה" },
  { key: "insights", icon: "chart-line", label: "תובנות" },
  { key: "tools", icon: "wrench", label: "כלים" },
];
function TabBar({ active, onNav, variant = "bottom" }) {
  return (
    <nav className={variant === "top" ? "tabs-top" : "tabbar"} aria-label="ניווט ראשי">
      {TABS.map(t => (
        <button key={t.key} className={`tab${active === t.key ? " on" : ""}`}
                onClick={() => onNav(t.key)}
                aria-current={active === t.key ? "page" : undefined}>
          <Icon name={t.icon} weight={active === t.key ? "fill" : "regular"} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ---- quiet help line (page bottom, every screen) ---- */
function HelpLine() {
  return (
    <div className="helpline">
      <a href="#" onClick={e => e.preventDefault()}>
        <Icon name="whatsapp-logo" weight="fill" />צריכה עזרה? כתבי לנו בוואטסאפ
      </a>
    </div>
  );
}

/* ---- progress ring (faithful to existing ProfileCompletenessCard) ---- */
function RingGauge({ percent, size = 62, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (percent / 100) * c;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
         aria-label={`השלמת פרופיל: ${percent}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5DFD3" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#C98600" strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={`${filled} ${c - filled}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dasharray .6s cubic-bezier(.22,1,.36,1)" }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
            className="ring-num" fontSize={Math.round(size * 0.26)} fill="#1a1a1a">{percent}%</text>
    </svg>
  );
}

/* ---- generic button ---- */
function Btn({ variant = "primary", size, block, icon, iconWeight = "bold", children, ...rest }) {
  const cls = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", block ? "btn-block" : ""].join(" ");
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} weight={iconWeight} />}
      {children}
    </button>
  );
}

/* ---- toast ---- */
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="toast" key={msg}>
      <div className="pill"><Icon name="check-circle" weight="fill" />{msg}</div>
    </div>
  );
}

/* =========================================================
   ProfileCompletenessCard — the SINGLE completeness widget
   Checklist = EXACTLY the 6 fields from code; % = done/6.
   ONE ring. 100% = calm gold seal moment, no confetti.
   ========================================================= */
function CompletenessCard({ items, onToggle, onCta }) {
  const total = items.length;
  const done = items.filter(i => i.done).length;
  const percent = Math.round((done / total) * 100);
  const nextItem = items.find(i => !i.done);
  const remaining = total - done;
  const full = percent >= 100;

  let headline = "בואי נתחיל";
  if (full) headline = "הפרופיל שלך מלא";
  else if (percent >= 70) headline = `כמעט שם — ${percent}% מוכן`;
  else headline = `הפרופיל ${percent}% מוכן`;

  return (
    <section className={`pc${full ? " complete" : ""}`} aria-labelledby="pc-h">
      <div className="pc-head">
        <RingGauge percent={percent} />
        <div className="copy">
          <span className="eyebrow"><Bind f="done/6 · ProfileCompletenessCard (קיים בקוד)">השלמת פרופיל</Bind></span>
          <h2 id="pc-h" className="serif">
            {full && <span className="seal"><Icon name="seal-check" weight="fill" /></span>}
            {headline}
          </h2>
          <p className="sub">
            {remaining > 0
              ? <>נשאר <b>{remaining === 1 ? "פרט אחד" : `${remaining} פרטים`}</b> עד שהפרופיל מלא ולקוחות ימצאו אותך.</>
              : <Bind f="producer.status">נשאר רק האישור שלנו — נעדכן אותך כשהעסק מאושר ועולה לאתר.</Bind>}
          </p>
        </div>
      </div>

      <ul className="checklist" role="list" aria-label="פרטי השלמת הפרופיל">
        {items.map(it => {
          const isNext = !it.done && it === nextItem;
          const rowCls = it.done ? "crow done" : isNext ? "crow next" : "crow todo";
          return (
            <li key={it.key} role="listitem">
              <button className={rowCls} onClick={() => onToggle && onToggle(it.key)}
                      aria-pressed={it.done}>
                <span className="cmark">
                  {it.done
                    ? <Icon name="check-circle" weight="fill" />
                    : isNext ? <Icon name="circle-dashed" /> : <Icon name="circle" />}
                </span>
                {isNext ? (
                  <span className="nextcopy">
                    <span className="ne">השלב הבא</span>
                    <span className="lbl"><Bind f={it.f}>{it.label}</Bind></span>
                  </span>
                ) : (
                  <span className="lbl"><Bind f={it.f}>{it.label}</Bind></span>
                )}
                {it.done && <span className="tick">הושלם</span>}
                {isNext && <Icon name="caret-left" weight="bold" style={{ color: "var(--primary)", fontSize: 16, alignSelf: "center" }} />}
              </button>
            </li>
          );
        })}
      </ul>

      {!full && (
        <div className="pc-cta">
          <Btn variant="primary" block icon="arrow-left" onClick={onCta}>
            {nextItem ? `הוסיפי ${nextItem.label}` : "השלימי פרופיל"}
          </Btn>
        </div>
      )}
    </section>
  );
}

/* slim success row (live state — card shrinks) + one-tap view-public-page */
function CompletenessSlim({ onDismiss, onViewPage }) {
  return (
    <div className="pc-slim">
      <span className="ic"><Icon name="check-circle" weight="fill" /></span>
      <span className="t">מופיע בפני לקוחות <span>· הפרופיל מלא</span></span>
      <button className="viewbtn" onClick={onViewPage}><Icon name="eye" weight="bold" />ראי את העמוד</button>
      <button className="x" onClick={onDismiss} aria-label="הסתרה"><Icon name="x" weight="bold" /></button>
    </div>
  );
}

/* =========================================================
   PhoneVerifyCard
   ========================================================= */
function PhoneVerify({ verified, onVerify }) {
  const [stage, setStage] = useState("idle"); // idle | code | done
  const [digits, setDigits] = useState(["", "", "", ""]);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => { if (verified) setStage("done"); }, [verified]);

  function setDigit(i, v) {
    v = v.replace(/\D/g, "").slice(-1);
    const next = [...digits]; next[i] = v; setDigits(next);
    if (v && i < 3) refs[i + 1].current && refs[i + 1].current.focus();
    if (next.every(d => d)) { setTimeout(() => { setStage("done"); onVerify && onVerify(); }, 280); }
  }

  if (stage === "done") {
    return (
      <section className="verify done">
        <div className="top">
          <span className="ic"><Icon name="seal-check" weight="fill" /></span>
          <div className="copy">
            <h4 className="serif"><Bind f="producer.status ≠ pending_whatsapp">הטלפון מאומת</Bind></h4>
            <p>לקוחות יכולים לפנות אלייך ישירות בוואטסאפ.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="verify">
      <div className="top">
        <span className="ic"><Icon name="device-mobile" weight="fill" /></span>
        <div className="copy">
          <h4 className="serif"><Bind f="producer.status = pending_whatsapp">אמתי את מספר הטלפון</Bind></h4>
          <p>{stage === "idle"
            ? "כדי שלקוחות יוכלו לפנות אלייך בוואטסאפ, נאמת את המספר 050-•••-••12."
            : "שלחנו קוד בן 4 ספרות ב-SMS. הקלידי אותו כאן."}</p>
        </div>
      </div>
      <div className="act">
        {stage === "idle" ? (
          <Btn variant="gold" size="sm" icon="paper-plane-tilt" onClick={() => setStage("code")}>שליחת קוד</Btn>
        ) : (
          <div className="codebox" dir="ltr">
            {digits.map((d, i) => (
              <input key={i} ref={refs[i]} value={d} inputMode="numeric" maxLength={1}
                     onChange={e => setDigit(i, e.target.value)}
                     aria-label={`ספרה ${i + 1}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================================================
   Availability — verbatim 4 states from code
   ========================================================= */
const AVAIL_STATES = [
  { key: "available", label: "זמינה היום", tone: "ok" },
  { key: "busy", label: "עמוסה השבוע", tone: "busy" },
  { key: "break", label: "בהפסקה", tone: "break" },
  { key: "orders", label: "פתוח להזמנות", tone: "ok" },
];
function AvailabilityCard({ value, onChange, locked }) {
  const cur = AVAIL_STATES.find(s => s.key === value) || AVAIL_STATES[0];
  return (
    <section className={`card availcard${locked ? " locked" : ""}`}>
      <div className="top">
        <span className="ic"><Icon name="storefront" weight="fill" /></span>
        <div>
          <h4><Bind f="producer.availability_state">סטטוס זמינות</Bind></h4>
          <p>{locked
            ? <>הסטטוס יופעל כשהעמוד יאושר ויעלה לאוויר.</>
            : <>מה שלקוחות יראו עכשיו: <b style={{ color: "var(--ink)" }}>{cur.label}</b></>}</p>
        </div>
      </div>
      <div className="availopts" role="group" aria-label="בחירת סטטוס זמינות" aria-disabled={locked}>
        {AVAIL_STATES.map(s => (
          <button key={s.key} className={`availopt${s.key === value ? " on" : ""}`}
                  data-tone={s.tone} aria-pressed={s.key === value} disabled={locked}
                  onClick={() => !locked && onChange && onChange(s.key)}>
            <span className="dot"></span>{s.label}
          </button>
        ))}
      </div>
      {locked && (
        <div className="avail-note"><Icon name="clock-countdown" weight="fill" />ייפעל כשהעמוד באוויר</div>
      )}
    </section>
  );
}

/* =========================================================
   EmptyState — encouraging + exactly ONE action
   ========================================================= */
function EmptyState({ icon = "chart-line-up", title, lede, steps, cta, onCta }) {
  return (
    <div className="empty">
      <div className="glyph"><Icon name={icon} /></div>
      <h3 className="serif">{title}</h3>
      {lede && <p className="lede">{lede}</p>}
      {steps && (
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i}><span className="n">{i + 1}</span><span className="st">{s}</span></li>
          ))}
        </ol>
      )}
      {cta && <div className="cta"><Btn variant="primary" icon="arrow-left" onClick={onCta}>{cta}</Btn></div>}
    </div>
  );
}

/* =========================================================
   KPI card — NO per-KPI delta (data constraint: only a
   categorical weekly_trend exists). f = binding annotation.
   ========================================================= */
function Kpi({ icon, value, label, suffix, lead, f }) {
  return (
    <div className={`kpi${lead ? " lead" : ""}`}>
      <div className="topr">
        <span className="ic"><Icon name={icon} weight="fill" /></span>
      </div>
      <div className="val">{value}{suffix && <span style={{ fontSize: "0.55em", color: "var(--muted)" }}> {suffix}</span>}</div>
      <div className="lbl"><Bind f={f}>{label}</Bind></div>
    </div>
  );
}

/* =========================================================
   Spoke card (hub launchpad)
   ========================================================= */
function Spoke({ icon, title, desc, go, kpi, sample, onClick }) {
  return (
    <button className="spoke" onClick={onClick}>
      <Icon name="caret-left" weight="bold" className="chev" />
      <span className="ic"><Icon name={icon} /></span>
      <h4 className="serif">{title}</h4>
      <p>{desc}</p>
      {sample ? (
        <span className="sample">
          <span className="blur">{sample}</span>
          <span className="cap"><Icon name="eye" />ככה זה ייראה</span>
        </span>
      ) : (
        <span className="meta">
          {kpi ? <><span className="kpibadge">{kpi.v}</span>{kpi.l}</> : <>{go}<Icon name="arrow-left" weight="bold" /></>}
        </span>
      )}
    </button>
  );
}

/* =========================================================
   Trend area chart (30-day) — simple data viz
   ========================================================= */
function TrendChart({ data, w = 320, h = 96 }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pad = 6;
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" data-om-raster
         style={{ width: "100%", height: h }} aria-hidden="true">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2e6853" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2e6853" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#tg)" />
      <path d={line} fill="none" stroke="#2e6853" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.6" fill="#2e6853" stroke="#FFFEFB" strokeWidth="2" />
    </svg>
  );
}

Object.assign(window, {
  Icon, Bind, NeedsBackendPanel, TabBar, HelpLine,
  RingGauge, Btn, Toast,
  CompletenessCard, CompletenessSlim, PhoneVerify,
  AvailabilityCard, AVAIL_STATES, EmptyState, Kpi, Spoke, TrendChart,
});
