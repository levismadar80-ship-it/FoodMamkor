/* Surface A — dashboard create/edit form for the business offer (MEH-1050)
   Lifecycle: empty → editing(draft) → pending_review → live → rejected
   One live offer max; expiry required (+30d default, +6mo max). */
const { useState: useStateA } = React;
const { OIcon: IA, OBtn: BtnA, fmtHeDate: fmtA, OfferCardPreview: PreviewA } = window;

const TODAY_ISO = "2026-07-10";
const DEFAULT_EXP = "2026-08-09";   /* +30d */
const MAX_EXP = "2027-01-10";       /* +6mo */

const TYPES = [
  { key: "percent", label: "אחוז הנחה", icon: "percent" },
  { key: "amount", label: "הנחה בסכום", icon: "money" },
  { key: "gift", label: "מתנה", icon: "gift" },
];

const STAGES = [
  { key: "empty", label: "אין הטבה" },
  { key: "editing", label: "יצירה / עריכה" },
  { key: "pending", label: "ממתינה לאישור" },
  { key: "live", label: "באוויר" },
  { key: "rejected", label: "נדחתה" },
];

function OfferManager() {
  const [stage, setStage] = useStateA("empty");
  const [offer, setOffer] = useStateA({
    type: "percent", value: "10", minPurchase: "150",
    terms: "על כל התפריט, לא כולל מארזי חג",
    expiresAt: DEFAULT_EXP,
  });
  const [errors, setErrors] = useStateA({});

  const isGift = offer.type === "gift";
  const set = (k, v) => { setOffer(o => ({ ...o, [k]: v })); setErrors(e => ({ ...e, [k]: null })); };

  function submit() {
    const e = {};
    if (!isGift && (!offer.value || Number(offer.value) <= 0)) e.value = "צריך ערך להטבה";
    if (isGift && !offer.terms.trim()) e.terms = "ספרי מה כוללת המתנה — זה מה שלקוחות יראו";
    if (isGift && offer.terms.length > 80) e.terms = "תיאור מתנה — עד 80 תווים";
    if (!offer.expiresAt) e.expiresAt = "תאריך תפוגה הוא חובה";
    else if (offer.expiresAt > MAX_EXP) e.expiresAt = "עד חצי שנה קדימה";
    else if (offer.expiresAt <= TODAY_ISO) e.expiresAt = "התאריך כבר עבר";
    setErrors(e);
    if (Object.keys(e).length === 0) setStage("pending");
  }

  return (
    <div className="proto">
      <div className="proto-chrome" aria-label="מצב אב-טיפוס">
        <span className="pc-k">מצב</span>
        <div className="seg">
          {STAGES.map(s => (
            <button key={s.key} className={stage === s.key ? "on" : ""} onClick={() => setStage(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="sheet appsheet">
        <button className="backbtn"><IA name="arrow-right" weight="bold" />חזרה לכלים</button>
        <h1 className="serif scr-h">הטבה מבית העסק</h1>
        <p className="scr-sub">הטבה אחת, בבעלותך — מופיעה בעמוד העסק אחרי אישור קצר של הצוות.</p>

        {stage === "empty" && (
          <div className="empty">
            <div className="glyph"><IA name="seal-percent" /></div>
            <h3 className="serif">עוד לא יצרת הטבה</h3>
            <p className="lede">הטבה מובנית — הנחה או מתנה — שמופיעה בגוף עמוד העסק שלך.</p>
            <ol className="steps">
              <li><span className="n">1</span><span className="st">בוחרים סוג — אחוז, סכום או מתנה</span></li>
              <li><span className="n">2</span><span className="st">קובעים תנאי מינימום ותוקף</span></li>
              <li><span className="n">3</span><span className="st">הצוות מאשר וההטבה עולה לעמוד</span></li>
            </ol>
            <div className="cta"><BtnA icon="plus" onClick={() => setStage("editing")}>צרו הטבה</BtnA></div>
          </div>
        )}

        {stage === "editing" && (
          <div className="card pad formcard">
            <div className="field">
              <label>סוג ההטבה</label>
              <div className="tagrow">
                {TYPES.map(t => (
                  <button key={t.key} className={`tag-pill${offer.type === t.key ? " on" : ""}`} onClick={() => set("type", t.key)}>
                    <IA name={t.icon} weight={offer.type === t.key ? "bold" : "regular"} size={15} />{t.label}
                  </button>
                ))}
              </div>
            </div>

            {!isGift && (
              <div className="field">
                <label htmlFor="of-val">{offer.type === "percent" ? "אחוז ההנחה" : "סכום ההנחה"}</label>
                <div className="valwrap">
                  <input id="of-val" className={`input${errors.value ? " err" : ""}`} inputMode="numeric" dir="ltr"
                         value={offer.value} onChange={e => set("value", e.target.value.replace(/\D/g, "").slice(0, 3))} />
                  <span className="suffix">{offer.type === "percent" ? "%" : "₪"}</span>
                </div>
                {errors.value && <p className="errline"><IA name="warning-circle" />{errors.value}</p>}
              </div>
            )}

            <div className="field">
              <label htmlFor="of-min">מינימום קנייה <span className="hint">— לא חובה. אם יש, הוא מוצג בשורת ההטבה</span></label>
              <div className="valwrap">
                <input id="of-min" className="input" inputMode="numeric" dir="ltr" placeholder="ללא"
                       value={offer.minPurchase} onChange={e => set("minPurchase", e.target.value.replace(/\D/g, "").slice(0, 4))} />
                <span className="suffix">₪</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="of-terms">
                {isGift ? "מה כוללת המתנה?" : "תנאים"}{" "}
                <span className="hint">— {(isGift ? 80 : 200) - offer.terms.length} תווים נותרו</span>
              </label>
              <textarea id="of-terms" className={`textarea${errors.terms ? " err" : ""}`} maxLength={isGift ? 80 : 200}
                        placeholder={isGift ? "למשל: צנצנת דבש קטנה לכל הזמנה ראשונה" : "למשל: בהזמנה מראש, לא כולל מארזי חג"}
                        value={offer.terms} onChange={e => set("terms", e.target.value)} />
              {errors.terms && <p className="errline"><IA name="warning-circle" />{errors.terms}</p>}
            </div>

            <div className="field">
              <label htmlFor="of-exp">בתוקף עד <span className="hint">— ברירת מחדל חודש, עד חצי שנה קדימה</span></label>
              <input id="of-exp" type="date" className={`input datein${errors.expiresAt ? " err" : ""}`}
                     min={TODAY_ISO} max={MAX_EXP}
                     value={offer.expiresAt} onChange={e => set("expiresAt", e.target.value)} />
              {errors.expiresAt
                ? <p className="errline"><IA name="warning-circle" />{errors.expiresAt}</p>
                : <p className="okline"><IA name="calendar-check" />יוצג ללקוחות: בתוקף עד {fmtA(offer.expiresAt)}</p>}
            </div>

            <div className="prevbox">
              <span className="prevbox-k"><IA name="eye" />ככה זה ייראה בעמוד העסק</span>
              <PreviewA offer={offer} />
            </div>

            <div className="formactions">
              <BtnA icon="paper-plane-tilt" onClick={submit}>שליחה לאישור</BtnA>
              <BtnA variant="ghost" onClick={() => setStage("empty")}>ביטול</BtnA>
            </div>
            <p className="quiet-note"><IA name="clock-countdown" />האישור לוקח בדרך כלל עד יום עבודה. נעדכן אותך בוואטסאפ.</p>
          </div>
        )}

        {stage === "pending" && (
          <div className="stack-a">
            <div className="verify">
              <div className="top">
                <span className="ic"><IA name="clock-countdown" weight="fill" /></span>
                <div className="copy">
                  <h4 className="serif">ההטבה ממתינה לאישור הצוות</h4>
                  <p>בדרך כלל עד יום עבודה. נעדכן אותך בוואטסאפ ברגע שההטבה עולה לעמוד.</p>
                </div>
              </div>
            </div>
            <PreviewA offer={offer} />
            <div className="formactions">
              <BtnA variant="ghost" size="sm" icon="pencil-simple" onClick={() => setStage("editing")}>עריכה</BtnA>
              <BtnA variant="quiet" size="sm" icon="trash-simple" onClick={() => setStage("empty")}>ביטול הבקשה</BtnA>
            </div>
            <p className="quiet-note">עריכה מחזירה את ההטבה לטיוטה ושולחת אותה לאישור מחדש.</p>
          </div>
        )}

        {stage === "live" && (
          <div className="stack-a">
            <div className="verify done">
              <div className="top">
                <span className="ic"><IA name="seal-check" weight="fill" /></span>
                <div className="copy">
                  <h4 className="serif">ההטבה באוויר</h4>
                  <p>מופיעה עכשיו בעמוד העסק · בתוקף עד {fmtA(offer.expiresAt)}. כשהתוקף נגמר, ההטבה יורדת מהעמוד לבד.</p>
                </div>
              </div>
            </div>
            <PreviewA offer={offer} />
            <div className="formactions">
              <BtnA variant="ghost" size="sm" icon="pencil-simple" onClick={() => setStage("editing")}>עריכה או החלפה</BtnA>
              <BtnA variant="quiet" size="sm" icon="trash-simple" onClick={() => setStage("empty")}>הסרת ההטבה</BtnA>
            </div>
            <p className="quiet-note"><IA name="info" />אפשר הטבה אחת בכל רגע — גרסה חדשה מחליפה את הנוכחית ועוברת אישור מחדש.</p>
          </div>
        )}

        {stage === "rejected" && (
          <div className="stack-a">
            <div className="verify reject">
              <div className="top">
                <span className="ic"><IA name="warning-circle" weight="fill" /></span>
                <div className="copy">
                  <h4 className="serif">ההטבה לא אושרה</h4>
                  <p>אפשר לתקן ולשלוח שוב — זה לוקח דקה.</p>
                </div>
              </div>
              <blockquote className="rej-reason">
                <span className="k">הסיבה שציין הצוות</span>
                "ההטבה מבטיחה משלוח חינם בלי לציין אזור. הוסיפי אזור משלוח לתנאים."
              </blockquote>
            </div>
            <div className="formactions">
              <BtnA icon="pencil-simple" onClick={() => setStage("editing")}>עריכה ושליחה מחדש</BtnA>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

["a-desktop", "a-mobile"].forEach(id => {
  const el = document.getElementById(id);
  if (el) ReactDOM.createRoot(el).render(<OfferManager />);
});
