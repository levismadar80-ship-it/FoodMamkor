/* Surface C — admin moderation queue (kashrut-queue pattern, desktop-first) */
const { useState: useStateC } = React;
const { OIcon: IC, OBtn: BtnC } = window;

const Q0 = [
  {
    id: 1, biz: "מטבח של מאיה", city: "רמת השרון", initial: "מ",
    type: "percent", headline: <React.Fragment><span dir="ltr">10%</span> הנחה</React.Fragment>,
    terms: "על כל התפריט, לא כולל מארזי חג",
    min: 150, exp: "9 באוגוסט", submitted: "לפני שעתיים", status: "pending",
  },
  {
    id: 2, biz: "הדבש של נועה", city: "פרדס חנה", initial: "ה",
    type: "gift", headline: "מתנה: צנצנת דבש קטנה לכל הזמנה ראשונה",
    terms: null, min: null, exp: "15 בספטמבר", submitted: "לפני 5 שעות", status: "pending",
  },
  {
    id: 3, biz: "מאפיית שחרית", city: "חיפה", initial: "מ",
    type: "amount", headline: <React.Fragment><span dir="ltr">₪20</span> הנחה</React.Fragment>,
    terms: "על מגש שבת מלא, איסוף עצמי בלבד",
    min: 120, exp: "24 ביולי", submitted: "אתמול", status: "pending",
  },
  {
    id: 4, biz: "קונדיטוריית עדן", city: "גבעתיים", initial: "ק",
    type: "percent", headline: <React.Fragment><span dir="ltr">15%</span> הנחה</React.Fragment>,
    terms: "על עוגות בהזמנה אישית", min: null, exp: "20 באוגוסט", submitted: "לפני 3 ימים", status: "live",
  },
  {
    id: 5, biz: "שוקולד ברקת", city: "באר שבע", initial: "ש",
    type: "amount", headline: <React.Fragment><span dir="ltr">₪30</span> הנחה</React.Fragment>,
    terms: "כולל משלוח חינם לכל הארץ", min: 200, exp: "1 באוקטובר", submitted: "לפני שבוע", status: "rejected",
    reason: "ההטבה מבטיחה משלוח חינם בלי לציין אזור. בקשי להוסיף אזור משלוח לתנאים.",
  },
];

const TYPE_LABEL = { percent: "אחוז", amount: "סכום", gift: "מתנה" };
const TYPE_ICON = { percent: "percent", amount: "money", gift: "gift" };

function AdminQueue() {
  const [rows, setRows] = useStateC(Q0);
  const [tab, setTab] = useStateC("pending");
  const [rejecting, setRejecting] = useStateC(null); // row id
  const [reason, setReason] = useStateC("");
  const [reasonErr, setReasonErr] = useStateC(false);

  const pending = rows.filter(r => r.status === "pending");
  const live = rows.filter(r => r.status === "live");
  const rejected = rows.filter(r => r.status === "rejected");
  const shown = tab === "pending" ? pending : tab === "live" ? live : rejected;

  function approve(id) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, status: "live" } : r));
    setRejecting(null);
  }
  function startReject(id) { setRejecting(id); setReason(""); setReasonErr(false); }
  function confirmReject(id) {
    if (reason.trim().length < 8) { setReasonErr(true); return; }
    setRows(rs => rs.map(r => r.id === id ? { ...r, status: "rejected", reason: reason.trim() } : r));
    setRejecting(null);
  }

  return (
    <div className="sheet adminsheet">
      <header className="adm-head">
        <div>
          <span className="eyebrow-he">ניהול · מהמקור</span>
          <h1 className="serif adm-h">אישור הטבות</h1>
          <p className="adm-sub">כמו תור אישורי הכשרות — כל הטבה עוברת עין אנושית לפני שהיא עולה לעמוד העסק.</p>
        </div>
        <div className="seg adm-tabs">
          <button className={tab === "pending" ? "on" : ""} onClick={() => setTab("pending")}>ממתינות ({pending.length})</button>
          <button className={tab === "live" ? "on" : ""} onClick={() => setTab("live")}>חיות ({live.length})</button>
          <button className={tab === "rejected" ? "on" : ""} onClick={() => setTab("rejected")}>נדחו ({rejected.length})</button>
        </div>
      </header>

      <div className="card adm-list">
        {shown.length === 0 && (
          <div className="adm-empty"><IC name="check-circle" weight="fill" />
            {tab === "pending" ? "אין הטבות שממתינות לאישור. תור נקי." : tab === "live" ? "אין הטבות חיות כרגע." : "אין הטבות שנדחו."}
          </div>
        )}
        {shown.map(r => (
          <article key={r.id} className={`adm-row st-${r.status}`}>
            <div className="adm-biz">
              <span className="adm-avatar">{r.initial}</span>
              <div className="who">
                <h4>{r.biz}</h4>
                <p>{r.city} · הוגש {r.submitted}</p>
              </div>
            </div>

            <div className="adm-offer">
              <div className="l1">
                <span className="typechip"><IC name={TYPE_ICON[r.type]} weight="bold" />{TYPE_LABEL[r.type]}</span>
                <h5 className="serif">{r.headline}</h5>
              </div>
              <p className="l2">
                {r.min ? <span className="pt"><IC name="basket" />מינימום <span dir="ltr">₪{r.min}</span></span> : <span className="pt none">ללא מינימום קנייה</span>}
                <span className="pt"><IC name="calendar-blank" />עד {r.exp}</span>
              </p>
              {r.terms && <p className="l3">"{r.terms}"</p>}
              {r.status === "rejected" && r.reason && <p className="l3 why"><IC name="arrow-bend-down-left" />סיבת הדחייה: {r.reason}</p>}
            </div>

            <div className="adm-acts">
              {r.status === "pending" && rejecting !== r.id && (
                <React.Fragment>
                  <BtnC size="sm" icon="check" onClick={() => approve(r.id)}>אישור</BtnC>
                  <BtnC variant="ghost" size="sm" icon="x" onClick={() => startReject(r.id)}>דחייה</BtnC>
                </React.Fragment>
              )}
              {r.status === "live" && <span className="statechip live"><IC name="seal-check" weight="fill" />באוויר</span>}
              {r.status === "rejected" && <span className="statechip rej"><IC name="x-circle" weight="fill" />נדחתה</span>}
            </div>

            {rejecting === r.id && (
              <div className="adm-rejectbox">
                <label htmlFor={`rej-${r.id}`}>סיבת הדחייה — נשלחת לבעלת העסק כמו שהיא</label>
                <textarea id={`rej-${r.id}`} className={`textarea${reasonErr ? " err" : ""}`} rows={2}
                          placeholder="למשל: ההטבה מבטיחה משלוח חינם בלי לציין אזור"
                          value={reason} onChange={e => { setReason(e.target.value); setReasonErr(false); }} />
                {reasonErr && <p className="errline"><IC name="warning-circle" />כמה מילים לפחות — בעלת העסק צריכה להבין מה לתקן</p>}
                <div className="rej-acts">
                  <BtnC variant="gold" size="sm" icon="paper-plane-tilt" onClick={() => confirmReject(r.id)}>שליחת דחייה</BtnC>
                  <BtnC variant="quiet" size="sm" onClick={() => setRejecting(null)}>ביטול</BtnC>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      <p className="adm-foot"><IC name="info" />הטבה אחת חיה לכל בית עסק. אישור הטבה חדשה מוריד אוטומטית את הקודמת. הטבות שפג תוקפן יורדות מהעמוד בלי טיפול ידני.</p>
    </div>
  );
}

const elC = document.getElementById("c-desktop");
if (elC) ReactDOM.createRoot(elC).render(<AdminQueue />);
