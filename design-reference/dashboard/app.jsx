/* ============================================================
   app.jsx — shell, presentation chrome, router, state
   ============================================================ */
const { useState, useEffect, useRef } = React;
const {
  Icon, Toast, TabBar, Bind,
  OverviewIncomplete, OverviewLive,
  EditSection, InsightsSection, ToolsSection, SettingsSection, PreviewScreen,
} = window;

const STORE = "meh-dash-v2"; // v2: 6-field checklist (v1 key left untouched)
/* checklist = EXACTLY the 6 fields from ProfileCompletenessCard */
const DEFAULT_ITEMS = [
  { key: "city", label: "עיר", done: true, f: "producer.city" },
  { key: "map", label: "מיקום על המפה", done: false, f: "producer location (או אזורי משלוח לעסק-משלוחים)" },
  { key: "contact", label: "פרטי קשר", done: true, f: "contact channels (edit spoke)" },
  { key: "category", label: "קטגוריה", done: true, f: "producer.categories" },
  { key: "photo", label: "תמונה ראשית", done: false, f: "producer.images[0]" },
  { key: "bio", label: "תיאור קצר", done: false, f: "producer.short_description" },
];

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
}

function App() {
  const saved = loadState();
  const [device, setDevice] = useState(saved.device || "mobile");
  const [profileState, setProfileState] = useState(saved.profileState || "incomplete");
  const [screen, setScreen] = useState(saved.screen || "home");
  const [items, setItems] = useState(Array.isArray(saved.items) && saved.items.length === 6 ? saved.items : DEFAULT_ITEMS);
  const [phoneVerified, setPhoneVerified] = useState(saved.phoneVerified || false);
  const [availability, setAvailability] = useState(saved.availability || "available");
  const [slimDismissed, setSlimDismissed] = useState(saved.slimDismissed || false);
  const [showBind, setShowBind] = useState(saved.showBind || false);
  const [toast, setToast] = useState("");
  const scrollRef = useRef(null);

  // persist
  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify({ device, profileState, screen, items, phoneVerified, availability, slimDismissed, showBind }));
  }, [device, profileState, screen, items, phoneVerified, availability, slimDismissed, showBind]);

  // toast auto-clear
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  // scroll to top on screen change
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [screen, profileState]);

  const fire = (m) => setToast(m);

  /* toast per checklist completion + calm 100% moment (correction 6) */
  function toggleItem(key) {
    setItems(prev => {
      const next = prev.map(i => i.key === key ? { ...i, done: !i.done } : i);
      const it = next.find(i => i.key === key);
      if (it.done) {
        const allDone = next.every(i => i.done);
        fire(allDone ? "הפרופיל מלא — שלחנו לאישור, נעדכן אותך" : `${it.label} — הושלם`);
      }
      return next;
    });
  }
  function nav(s) { setScreen(s); }

  // ----- router -----
  const isPreview = screen === "preview";
  let body = null;
  if (screen === "edit") {
    body = <EditSection onBack={() => nav("home")} onToast={fire} />;
  } else if (screen === "insights") {
    body = <InsightsSection profileState={profileState} onBack={() => nav("home")} onNav={nav} />;
  } else if (screen === "tools") {
    body = <ToolsSection onBack={() => nav("home")} onToast={fire} onPreview={() => nav("preview")} />;
  } else if (screen === "settings") {
    body = <SettingsSection onBack={() => nav("home")} onToast={fire} phoneVerified={phoneVerified} />;
  } else if (profileState === "live") {
    body = <OverviewLive name="מאיה" availability={availability} onAvailability={setAvailability}
              onNav={nav} slimDismissed={slimDismissed} onDismissSlim={() => setSlimDismissed(true)}
              onOpenWa={() => fire("פותחת את וואטסאפ — שם השיחה מתנהלת")}
              onShare={() => fire("הקישור הועתק — שתפי בוואטסאפ")}
              onViewPage={() => nav("preview")} />;
  } else {
    body = <OverviewIncomplete name="מאיה" items={items} onToggleItem={toggleItem}
              onCta={() => nav("edit")}
              phoneVerified={phoneVerified} onVerify={() => { setPhoneVerified(true); fire("הטלפון אומת בהצלחה"); }}
              availability={availability} onAvailability={setAvailability}
              onNav={nav} onViewPage={() => nav("preview")} />;
  }

  const Frame = (
    <div className={`device ${device}`}>
      {device === "mobile" && <div className="notch"></div>}
      {device === "desktop" && (
        <div className="winbar">
          <span className="dot" style={{ background: "#e0685e" }}></span>
          <span className="dot" style={{ background: "#e6b34d" }}></span>
          <span className="dot" style={{ background: "#69b06a" }}></span>
          <span className="urlbar">mehamakor.online / ניהול-העסק</span>
        </div>
      )}
      <div className="glass">
        <div className="app">
          {isPreview ? (
            <PreviewScreen onBack={() => nav("home")} availability={availability} />
          ) : (
            <>
              {/* persistent app header — avatar + business name + city + gear (no bell) */}
              <header className="appbar">
                <span className="avatar">מ</span>
                <div className="who">
                  <span className="biz"><Bind f="producer.name">מטבח של מאיה</Bind></span>
                  <span className="role">בית עסק · <Bind f="producer.city">רמת השרון</Bind></span>
                </div>
                <div className="right">
                  <button className="iconbtn" onClick={() => nav("settings")} aria-label="הגדרות">
                    <Icon name="gear-six" />
                  </button>
                </div>
              </header>

              {/* tab bar exists in code and STAYS in every screen (correction 3):
                  desktop — top row; mobile — bottom bar */}
              {device === "desktop" && <TabBar variant="top" active={screen} onNav={nav} />}

              <div className="app-scroll" ref={scrollRef}>
                <div key={`${screen}-${profileState}`}>{body}</div>
              </div>

              {device === "mobile" && <TabBar active={screen} onNav={nav} />}
            </>
          )}

          <Toast msg={toast} />
        </div>
      </div>
    </div>
  );

  return (
    <div className={`stage${showBind ? " show-bindings" : ""}`}>
      <div className="controlbar">
        <div className="cb-brand">
          <span className="k">אב-טיפוס · סבב 5</span>
          <span className="t">ניהול העסק — כיוון ג · מוקד וזרועות</span>
        </div>
        <div className="seg-group">
          <span className="seg-label">מצב פרופיל</span>
          <div className="seg" role="tablist">
            <button className={profileState === "incomplete" ? "on" : ""} onClick={() => setProfileState("incomplete")}>לא הושלם</button>
            <button className={profileState === "live" ? "on" : ""} onClick={() => setProfileState("live")}>פעיל</button>
          </div>
        </div>
        <div className="seg-group">
          <span className="seg-label">תצוגה</span>
          <div className="seg" role="tablist">
            <button className={device === "mobile" ? "on" : ""} onClick={() => setDevice("mobile")}>נייד</button>
            <button className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")}>דסקטופ</button>
          </div>
        </div>
        <div className="seg-group">
          <span className="seg-label">שיוכי דאטה</span>
          <div className="seg" role="tablist">
            <button className={!showBind ? "on" : ""} onClick={() => setShowBind(false)}>מוסתר</button>
            <button className={showBind ? "on" : ""} onClick={() => setShowBind(true)}>מוצג</button>
          </div>
        </div>
      </div>

      <div className="viewport">{Frame}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
