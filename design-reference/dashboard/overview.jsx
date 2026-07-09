/* ============================================================
   overview.jsx — the hub home (סקירה), both states
   ============================================================ */
const { useState } = React;
const {
  Icon: I2, Bind: B2, NeedsBackendPanel: NBPanel, HelpLine: Help2,
  CompletenessCard: PCCard, CompletenessSlim: PCSlim, PhoneVerify: PV,
  AvailabilityCard: AvCard, Kpi: KpiCard, Spoke: SpokeCard, Btn: Button2,
} = window;

/* spoke definitions shared by both states — secondary entry; the
   canonical navigation is the persistent tab bar */
function SpokeGrid({ live, onNav, kpiHeadline }) {
  return (
    <div className="stack-sm">
      <div className="spokes-head">
        <h3 className="serif">{live ? "כל הניהול במקום אחד" : "המשך לנהל"}</h3>
      </div>
      <div className={`spokes${live ? "" : " dim"}`}>
        <SpokeCard icon="pencil-simple" title="עריכה"
          desc="ביו, תמונות, ערוצי קשר ושאלות נפוצות"
          go="לעריכה" onClick={() => onNav("edit")} />
        {live ? (
          <SpokeCard icon="chart-line-up" title="תובנות"
            desc="צפיות, פניות ומגמות לאורך זמן"
            kpi={kpiHeadline} onClick={() => onNav("insights")} />
        ) : (
          <SpokeCard icon="chart-line-up" title="תובנות"
            desc="צפיות, פניות ומגמות"
            sample="57" onClick={() => onNav("insights")} />
        )}
        <SpokeCard icon="wrench" title="כלים"
          desc="אירועים, מתכונים, קבוצות רכש"
          go="פתיחה" onClick={() => onNav("tools")} />
      </div>
    </div>
  );
}

/* launch path — pre-live only. Retires ENTIRELY in the live state. */
function LaunchPath({ remaining }) {
  return (
    <div className="launch">
      <div className="glyph"><I2 name="rocket-launch" /></div>
      <h3 className="serif">עוד אין צפיות — ככה משיגים את הראשונות</h3>
      <p className="lede">שלושה צעדים עד שהעמוד באוויר ומגיע ללקוחות באזור:</p>
      <ol className="lsteps">
        <li className="lstep active">
          <span className="mk">1</span>
          <div className="lc"><h5>השלמת הפרופיל</h5>
            <p>{remaining === 1 ? "נשאר פרט אחד" : `נשארו ${remaining} פרטים`} — בכרטיס למעלה.</p></div>
          <span className="pill now">עכשיו</span>
        </li>
        <li className="lstep wait">
          <span className="mk">2</span>
          <div className="lc"><h5><B2 f="producer.status = pending">אישור העסק</B2></h5>
            <p>במהמקור עוברות על כל בית עסק חדש לפני שהוא עולה לאתר. בדרך כלל תוך יום-יומיים — נעדכן אותך כשהעסק מאושר.</p></div>
          <span className="pill wait">בהמתנה</span>
        </li>
        <li className="lstep locked">
          <span className="mk"><I2 name="lock-simple" /></span>
          <div className="lc"><h5>שיתוף הקישור</h5><p>ייפתח אחרי שהפרופיל יאושר — אז משתפים בקבוצות הוואטסאפ שלך.</p></div>
          <span className="pill lock"><I2 name="lock-simple" />נעול</span>
        </li>
      </ol>
    </div>
  );
}

/* per-field explainer for the dynamic "next step" greeting */
const NEXT_EXPLAIN = {
  city: "כך לקוחות יודעות איפה למצוא אותך",
  map: "כך לקוחות מהאזור מוצאות אותך בחיפוש",
  contact: "בלעדיהם אין דרך לפנות אלייך",
  category: "כך מגיעים אלייך מי שמחפשים בדיוק את זה",
  photo: "היא מה שגורם ללקוחות לעצור ולבחור בך",
  bio: "כמה משפטים שמספרים מי את ומה את מכינה",
};

/* ---------------- INCOMPLETE state ---------------- */
function OverviewIncomplete(props) {
  const { name, items, onToggleItem, onCta, phoneVerified, onVerify, availability, onAvailability, onNav, onViewPage } = props;
  const next = items.find(i => !i.done);
  const remaining = items.filter(i => !i.done).length;
  return (
    <div className="screen anim-fwd">
      <div className="stack">
        <header className="greet">
          <span className="eyebrow he">ניהול העסק · סקירה</span>
          <h1>בוקר טוב, <B2 f="producer.name">{name}</B2></h1>
          <p>{next
            ? <>הצעד הבא: <b>{next.label}</b> — {NEXT_EXPLAIN[next.key]}.</>
            : <>הפרופיל מלא — נעדכן אותך כשהעסק מאושר.</>}</p>
        </header>

        <button className="previewrow" onClick={onViewPage}>
          <span className="ic"><I2 name="eye" /></span>
          <div className="copy"><h4>ראי תצוגה מקדימה</h4><p>איך העמוד שלך ייראה ללקוחות</p></div>
          <span className="chev"><I2 name="caret-left" weight="bold" /></span>
        </button>

        <PCCard items={items} onToggle={onToggleItem} onCta={onCta} />

        <PV verified={phoneVerified} onVerify={onVerify} />

        <AvCard value={availability} onChange={onAvailability} locked />

        <LaunchPath remaining={remaining} />

        <SpokeGrid live={false} onNav={onNav} />

        <NBPanel />
        <Help2 />
      </div>
    </div>
  );
}

/* ---------------- LIVE state ---------------- */
/* KPI order leads with the money metric (RTL reading order):
   WhatsApp פניות → «צרו קשר» → דירוג → צפיות. Uniform 7-day window,
   NO per-KPI deltas (only categorical weekly_trend exists in code). */
const LIVE_KPIS = [
  { icon: "whatsapp-logo", value: "12", label: "פניות בוואטסאפ", lead: true, f: "analytics.whatsapp_clicks.last_7d" },
  { icon: "cursor-click", value: "34", label: "לחיצות «צרו קשר»", f: "analytics.contact_clicks.last_7d" },
  { icon: "star", value: "4.9", label: "דירוג ממוצע · כל הזמן", f: "analytics.average_rating" },
  { icon: "eye", value: "57", label: "צפיות בפרופיל", f: "analytics.profile_views.last_7d" },
];

/* anonymous activity pulse — max 3 rows, no names, no per-row city.
   Component exists in code; rows bind to its feed. */
const PULSE = [
  { icon: "whatsapp-logo", tone: "wa", t: "פנייה בוואטסאפ", when: "לפני שעתיים" },
  { icon: "star", tone: "gold", t: "ביקורת חדשה · 5★", when: "לפני 5 שעות" },
  { icon: "eye", t: "צפייה בפרופיל", when: "אתמול" },
];

function ActivityPulse({ events, onOpenWa, onShare, onNav }) {
  if (!events || events.length === 0) {
    return (
      <section className="card pad">
        <div className="inbox-head"><h3 className="serif">פעילות אחרונה</h3></div>
        <div className="pulse-empty">
          <div className="glyph"><I2 name="pulse" /></div>
          <p>עוד אין פעילות — שתפי את העמוד כדי להתחיל.</p>
          <div className="cta"><Button2 variant="primary" icon="share-network" onClick={onShare}>שתפי את העמוד</Button2></div>
        </div>
      </section>
    );
  }
  return (
    <section className="card pad">
      <div className="inbox-head">
        <h3 className="serif"><B2 f="ActivityPulse (רכיב קיים, פיד אנונימי)">פעילות אחרונה</B2></h3>
        <button className="more" onClick={() => onNav("insights")}>כל הפעילות</button>
      </div>
      <div className="pulse">
        {events.map((e, i) => (
          <div className="pulse-row" key={i}>
            <span className={`ic${e.tone === "wa" ? " wa" : e.tone === "gold" ? " gold" : ""}`}><I2 name={e.icon} weight="fill" /></span>
            <span className="t">{e.t}</span>
            <span className="when">{e.when}</span>
          </div>
        ))}
      </div>
      <div className="pulse-cta">
        <Button2 variant="primary" block icon="whatsapp-logo" iconWeight="fill" onClick={onOpenWa}>פתחי וואטסאפ לענות</Button2>
      </div>
    </section>
  );
}

function OverviewLive(props) {
  const { name, availability, onAvailability, onNav, slimDismissed, onDismissSlim, onOpenWa, onShare, onViewPage } = props;
  return (
    <div className="screen anim-fwd">
      <div className="stack">
        <header className="greet">
          <span className="eyebrow he">ניהול העסק · סקירה</span>
          <h1>שלום, <B2 f="producer.name">{name}</B2></h1>
          {/* insight-led subtitle (spec) */}
          <p>השבוע: <B2 f="analytics.profile_views.last_7d"><b>57 צפיות</b></B2> · <B2 f="analytics.whatsapp_clicks.last_7d"><b>12 פניות בוואטסאפ</b></B2> — פתחי כדי לענות.</p>
        </header>

        {!slimDismissed && <PCSlim onDismiss={onDismissSlim} onViewPage={onViewPage} />}

        {/* co-leads: the numbers + the activity pulse both sit at the top */}
        <section className="stack-sm">
          <div className="kpi-head">
            <h3 className="serif">המספרים שלך</h3>
            <span className="win">7 הימים האחרונים</span>
          </div>
          <div className="kpigrid">
            {LIVE_KPIS.map((k, i) => <KpiCard key={i} {...k} />)}
          </div>
          <div className="conv-line">
            <I2 name="funnel" /><span><B2 f="analytics.conversion_rate"><b>5%</b></B2> מהצופות פנו אלייך</span>
            <span className="tip">· אות לכך שכדאי לחזק את הקריאה לפעולה</span>
          </div>
          <div className="kpi-foot"><I2 name="info" />הדירוג מחושב מאז ההצטרפות; שאר המדדים — 7 הימים האחרונים.</div>
        </section>

        <ActivityPulse events={PULSE} onOpenWa={onOpenWa} onShare={onShare} onNav={onNav} />

        <AvCard value={availability} onChange={onAvailability} />

        <SpokeGrid live={true} onNav={onNav} kpiHeadline={{ v: "57", l: "צפיות · 7 ימים" }} />

        <NBPanel />
        <Help2 />
      </div>
    </div>
  );
}

Object.assign(window, { OverviewIncomplete, OverviewLive, LIVE_KPIS, PULSE, ActivityPulse, SpokeGrid, LaunchPath });
