/* ============================================================
   sections.jsx — עריכה / תובנות / כלים / הגדרות / תצוגה
   Structure-only + one fully-designed representative card each
   ============================================================ */
const { useState } = React;
const {
  Icon: I3, Bind: B3, NeedsBackendPanel: NBPanel3, HelpLine: Help3,
  EmptyState: Empty3, Btn: Button3, TrendChart: Trend, Kpi: Kpi3, AVAIL_STATES: AV3,
} = window;

function SubHeader({ title, sub, onBack }) {
  return (
    <header className="backbar" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
      <button className="backbtn" onClick={onBack}>
        <I3 name="arrow-right" weight="bold" />חזרה לסקירה
      </button>
      <div>
        <h1 className="serif" style={{ fontSize: 26, fontWeight: 900, color: "var(--primary)", margin: 0, lineHeight: 1.15 }}>{title}</h1>
        {sub && <p style={{ fontSize: 14, color: "var(--muted)", margin: "5px 0 0" }}>{sub}</p>}
      </div>
    </header>
  );
}

/* ----------------------------- עריכה ----------------------------- */
const CATEGORIES = ["מאפים ביתיים", "עוגות מעוצבות", "אוכל מבושל", "ממרחים ושימורים", "מאפים ללא גלוטן"];

function EditSection({ onBack, onToast }) {
  const [open, setOpen] = useState("details");
  const [biz, setBiz] = useState("מטבח של מאיה");
  const [bio, setBio] = useState("חלות, עוגות שמרים ומאפים שנאפים טרי כל בוקר בבית, משכונת המושבה ברמת השרון.");
  const [cat, setCat] = useState("מאפים ביתיים");

  const groups = [
    { key: "details", icon: "identification-card", title: "פרטי העסק ותיאור", desc: "שם, תיאור וקטגוריה", status: "ok", statusLabel: "מולא", f: "producer.name · short_description · categories" },
    { key: "photos", icon: "image", title: "תמונות הגלריה", desc: "תמונה ראשית ועד 8 נוספות", status: "todo", statusLabel: "חסר ראשית", f: "producer.images[]" },
    { key: "contact", icon: "chat-circle-text", title: "ערוצי קשר", desc: "וואטסאפ, טלפון, אינסטגרם", status: "ok", statusLabel: "מולא", f: "contact channels (edit spoke)" },
    { key: "faq", icon: "question", title: "שאלות נפוצות", desc: "תשובות מוכנות ללקוחות", status: "todo", statusLabel: "ריק", f: "producer.custom_questions" },
  ];

  return (
    <div className="screen anim-fwd">
      <div className="stack">
        <SubHeader title="עריכה" sub="כל מה שלקוחות רואים בעמוד שלך — במקום אחד." onBack={onBack} />

        <div className="grouplist">
          {groups.map(g => (
            <React.Fragment key={g.key}>
              <button className={`grouprow${open === g.key ? " open" : ""}`}
                      onClick={() => setOpen(open === g.key ? null : g.key)}>
                <span className="ic"><I3 name={g.icon} /></span>
                <div className="copy">
                  <h4><B3 f={g.f}>{g.title}</B3></h4>
                  <p>{g.desc}</p>
                </div>
                <span className={`status ${g.status}`}>{g.statusLabel}</span>
                <span className="chev"><I3 name="caret-left" weight="bold" /></span>
              </button>

              {open === g.key && g.key === "details" && (
                <div className="group-body">
                  <span className="rep-tag"><I3 name="sparkle" weight="fill" />כרטיס לדוגמה — מעוצב במלואו</span>
                  <div className="field">
                    <label htmlFor="f-biz">שם העסק</label>
                    <input id="f-biz" className="input" value={biz} onChange={e => setBiz(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="f-bio">תיאור קצר <span className="hint">— {120 - bio.length} תווים נותרו</span></label>
                    <textarea id="f-bio" className="textarea" maxLength={120} value={bio} onChange={e => setBio(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 18 }}>
                    <label>קטגוריה</label>
                    <div className="tagrow">
                      {CATEGORIES.map(c => (
                        <button key={c} className={`tag-pill${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>
                          {cat === c && <I3 name="check" weight="bold" size={13} />}{c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button3 variant="primary" icon="check" onClick={() => onToast("השינויים נשמרו")}>שמירת שינויים</Button3>
                </div>
              )}

              {open === g.key && g.key !== "details" && (
                <div className="group-body">
                  <span className="rep-tag"><I3 name="stack" weight="fill" />מבנה — מחוץ לטווח האב-טיפוס</span>
                  <p style={{ fontSize: 13.5, color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
                    {g.key === "photos" && "כאן ייפתח מעלה התמונות: תמונה ראשית, גלריה, וגרירה לשינוי סדר."}
                    {g.key === "contact" && "כאן יופיעו שדות וואטסאפ, טלפון ואינסטגרם, ובחירת ערוץ הקשר המועדף."}
                    {g.key === "faq" && "כאן יתווספו שאלות ותשובות מוכנות שיופיעו בעמוד הציבורי."}
                  </p>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        <Help3 />
      </div>
    </div>
  );
}

/* ----------------------------- תובנות ----------------------------- */
const TREND = [3, 4, 2, 5, 6, 4, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10, 8, 12, 11, 13, 12, 14, 13, 12, 15, 14, 16, 15, 17, 18];

function InsightsSection({ profileState, onBack, onNav }) {
  const total = TREND.reduce((a, b) => a + b, 0);
  const rows = [
    { icon: "map-pin", title: "מאיפה מגיעים", desc: "חמש הערים המובילות", f: "analytics.top_cities", nb: false, tag: "מבנה" },
    { icon: "clock", title: "שעות שיא", desc: "מתי גולשים צופים בך", f: "אין דאטה שעתית — views_by_day יומי", nb: true, tag: "NEEDS-BACKEND" },
    { icon: "arrows-left-right", title: "השוואה לחודש קודם", desc: "מגמת צמיחה", f: "אין דלתא מספרית — רק weekly_trend קטגורי", nb: true, tag: "NEEDS-BACKEND" },
  ];

  // numbers + chart — shared so the pre-data preview shows the real shape, blurred
  const numbers = (
    <>
      <div className="kpi-head">
        <h3 className="serif" style={{ fontSize: 16 }}>המספרים שלך</h3>
        <span className="win">7 הימים האחרונים</span>
      </div>
      <div className="kpigrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Kpi3 icon="whatsapp-logo" value="12" label="פניות בוואטסאפ" lead f="analytics.whatsapp_clicks.last_7d" />
        <Kpi3 icon="eye" value="57" label="צפיות בפרופיל" f="analytics.profile_views.last_7d" />
      </div>
      <section className="chartcard">
        <div className="ch-head">
          <h4 className="serif"><B3 f="analytics.views_by_day(30)">צפיות בפרופיל</B3></h4>
          <span className="rng">30 יום · <B3 f="analytics.weekly_trend (קטגורי)">מגמה עולה</B3></span>
        </div>
        <div className="ch-total"><B3 f="analytics.profile_views.last_30d">{total}</B3></div>
        <Trend data={TREND} />
      </section>
      <div className="conv-line">
        <I3 name="ranking" /><span>מקום <B3 f="analytics.rank_in_city"><b>3</b></B3> בין בתי העסק בעיר שלך</span>
      </div>
    </>
  );

  // pre-data: soft preview (Mixpanel demo-data pattern) — sample numbers, not a hard lock
  if (profileState !== "live") {
    return (
      <div className="screen anim-fwd">
        <div className="stack">
          <SubHeader title="תובנות" sub="תצוגה מקדימה" onBack={onBack} />
          <div className="preview-wrap">
            <div className="preview-blur"><div className="stack">{numbers}</div></div>
            <div className="preview-cap">
              <div className="badge">
                <div className="glyph"><I3 name="chart-line-up" /></div>
                <h3 className="serif">ככה זה ייראה כשיגיעו צפיות</h3>
                <p>התובנות נפתחות אוטומטית עם הצפייה הראשונה. המספרים כאן הם דוגמה בלבד.</p>
                <div className="cta"><Button3 variant="ghost" icon="arrow-right" onClick={onBack}>חזרה לסקירה</Button3></div>
              </div>
            </div>
          </div>
          <Help3 />
        </div>
      </div>
    );
  }

  return (
    <div className="screen anim-fwd">
      <div className="stack">
        <SubHeader title="תובנות" sub="מה קורה בעמוד שלך." onBack={onBack} />

        <span className="rep-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700, color: "var(--gold)", margin: "0 2px" }}>
          <I3 name="sparkle" weight="fill" />כרטיס לדוגמה — מעוצב במלואו
        </span>
        {numbers}

        <div className="struct">
          {rows.map((r, i) => (
            <div className="struct-row" key={i}>
              <span className="ic"><I3 name={r.icon} /></span>
              <div className="copy"><h4><B3 f={r.f} nb={r.nb}>{r.title}</B3></h4><p>{r.desc}</p></div>
              <span className="tagx" style={r.nb ? { color: "#a33d2a", borderColor: "rgba(194,69,47,.35)" } : null}>{r.tag}</span>
            </div>
          ))}
        </div>

        <NBPanel3 />
        <Help3 />
      </div>
    </div>
  );
}

/* ----------------------------- כלים ----------------------------- */
function ToolsSection({ onBack, onToast, onPreview }) {
  const rows = [
    { icon: "fork-knife", title: "מתכונים", desc: "שתפי מתכון שמוביל ללקוחות חדשים" },
    { icon: "users-three", title: "קבוצות רכש", desc: "ארגני הזמנה משותפת לשכונה" },
  ];
  return (
    <div className="screen anim-fwd">
      <div className="stack">
        <SubHeader title="כלים" sub="להרחיב את העסק מעבר לפרופיל." onBack={onBack} />

        <button className="navrow" onClick={onPreview}>
          <span className="ic"><I3 name="globe-simple" /></span>
          <div className="copy"><h4>הצג את העסק באתר</h4><p>כך לקוחות רואים את העמוד שלך</p></div>
          <span className="chev"><I3 name="arrow-up-left" weight="bold" /></span>
        </button>

        <section className="card pad">
          <span className="rep-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700, color: "var(--gold)", marginBottom: 4 }}>
            <I3 name="sparkle" weight="fill" />כרטיס לדוגמה — מעוצב במלואו
          </span>
          <Empty3
            icon="calendar-plus"
            title="עוד לא יצרת אירוע"
            lede="אירוע מספר ללקוחות מתי המכירה הבאה — דוכן שוק, מארז חג או יום אפייה."
            cta="צרי אירוע ראשון"
            onCta={() => onToast("נפתח יוצר האירועים")}
          />
        </section>

        <div className="struct">
          {rows.map((r, i) => (
            <div className="struct-row" key={i}>
              <span className="ic"><I3 name={r.icon} /></span>
              <div className="copy"><h4>{r.title}</h4><p>{r.desc}</p></div>
              <span className="tagx">בקרוב</span>
            </div>
          ))}
        </div>

        <Help3 />
      </div>
    </div>
  );
}

/* ----------------------------- הגדרות (profile mode) ----------------------------- */
function SettingsSection({ onBack, onToast, phoneVerified }) {
  return (
    <div className="screen anim-fwd">
      <div className="stack">
        <SubHeader title="הגדרות" sub="פרטי החשבון והעסק." onBack={onBack} />

        <div className="card">
          <div className="setrow">
            <span className="ic"><I3 name="storefront" /></span>
            <div className="copy"><h5>שם העסק</h5><p><B3 f="producer.name">מטבח של מאיה</B3></p></div>
          </div>
          <div className="setrow">
            <span className="ic"><I3 name="map-pin" /></span>
            <div className="copy"><h5>עיר</h5><p><B3 f="producer.city">רמת השרון</B3></p></div>
          </div>
          <div className="setrow">
            <span className="ic"><I3 name="link-simple" /></span>
            <div className="copy"><h5>כתובת העמוד</h5><p dir="ltr" style={{ textAlign: "end" }}><B3 f="producer.slug">mehamakor.online/maya-kitchen</B3></p></div>
            <button className="actx" onClick={() => onToast("הקישור הועתק")}>העתקה</button>
          </div>
          <div className="setrow">
            <span className="ic"><I3 name="device-mobile" /></span>
            <div className="copy"><h5>טלפון</h5><p dir="ltr" style={{ textAlign: "end" }}>050-•••-••12</p></div>
            {phoneVerified
              ? <span className="statuschip"><I3 name="seal-check" weight="fill" /><B3 f="producer.status ≠ pending_whatsapp">מאומת</B3></span>
              : <span className="statuschip" style={{ color: "var(--gold)", background: "var(--gold-soft)" }}><B3 f="producer.status = pending_whatsapp">ממתין לאימות</B3></span>}
          </div>
          <div className="setrow">
            <span className="ic"><I3 name="package" /></span>
            <div className="copy"><h5>תוכנית</h5><p><B3 f="producer.plan">חינם</B3></p></div>
          </div>
          <div className="setrow">
            <span className="ic"><I3 name="seal-check" /></span>
            <div className="copy"><h5>סטטוס העסק</h5><p><B3 f="producer.status">מאושר ופעיל</B3></p></div>
          </div>
        </div>

        <Button3 variant="ghost" icon="sign-out" onClick={() => onToast("התנתקת מהחשבון")}>התנתקות</Button3>

        <Help3 />
      </div>
    </div>
  );
}

/* -------------------- תצוגה — the public page as a customer sees it --------------------
   Airbnb "preview as guest" idiom: green takeover bar + חזרה לניהול. */
function PreviewScreen({ onBack, availability }) {
  const av = AV3.find(s => s.key === availability) || AV3[0];
  return (
    <>
      <div className="pv-bar">
        <span className="t"><I3 name="eye" weight="fill" />ככה הלקוחות רואות אותך</span>
        <button className="back" onClick={onBack}><I3 name="arrow-right" weight="bold" />חזרה לניהול</button>
      </div>
      <div className="app-scroll">
        <div className="anim-fwd">
          <div className="pub-hero"><span className="cap">producer.images[0] — תמונה ראשית</span></div>
          <div className="pub-body">
            <div>
              <h1 className="pub-name"><B3 f="producer.name">מטבח של מאיה</B3></h1>
              <div className="pub-meta" style={{ marginTop: 9 }}>
                <span className="pub-chip avail"><I3 name="storefront" weight="fill" /><B3 f="producer.availability_state">{av.label}</B3></span>
                <span className="pub-chip"><I3 name="map-pin" /><B3 f="producer.city">רמת השרון</B3></span>
                <span className="pub-chip"><I3 name="tag" /><B3 f="producer.categories[0]">מאפים ביתיים</B3></span>
              </div>
            </div>
            <div className="pub-rating">
              <span className="stars">{[1, 2, 3, 4, 5].map(n => <I3 key={n} name="star" weight="fill" />)}</span>
              <span className="num"><B3 f="analytics.average_rating">4.9</B3></span>
              <span style={{ color: "var(--muted)" }}>· <B3 f="analytics.total_reviews">23 ביקורות</B3></span>
            </div>
            <p className="pub-bio"><B3 f="producer.short_description">חלות, עוגות שמרים ומאפים שנאפים טרי כל בוקר בבית, משכונת המושבה ברמת השרון.</B3></p>
            <Button3 variant="primary" block icon="whatsapp-logo" iconWeight="fill">שליחת הודעה בוואטסאפ</Button3>
            <div className="pub-gal">
              {[1, 2, 3].map(n => <div className="tile" key={n}><span>images[{n}]</span></div>)}
            </div>
            <div className="pub-faq">
              <div className="q"><B3 f="producer.custom_questions[0]">אפשר להזמין ליום שישי?</B3><I3 name="plus" /></div>
              <div className="q"><B3 f="producer.custom_questions[1]">יש אפשרות ללא גלוטן?</B3><I3 name="plus" /></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { EditSection, InsightsSection, ToolsSection, SettingsSection, PreviewScreen });
