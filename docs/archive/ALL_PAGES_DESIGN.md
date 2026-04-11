# מהמקור — עיצוב מלא לכל העמודים
> קרא CLAUDE.md + docs/DESIGN.md קודם. עדכן CLAUDE.md בסוף.

## עיקרון מנחה לכל עמוד
חם, אישי, שוק איכרים — לא tech startup.
פונטים: Frank Ruhl Libre לכותרות, DM Sans לגוף.
צבעים: background #F5F0E8, primary #2e6853, text #1C1A17.
אנימציות: עדינות בלבד — fade-in, slide-up. ללא dark mode.

---

## סטטוס כל עמוד

| עמוד | מכוסה? | מה חסר |
|------|--------|--------|
| / דף הבית | ✅ מלא | — |
| /map מפה | ⚠️ חלקי | עיצוב sidebar, popup, מסנן |
| /producer/:id עמוד עסק | ⚠️ חלקי | גלריה, layout מלא |
| /about חזון | ⚠️ חלקי | סקציות חדשות לא מעוצבות |
| /events אירועים | ❌ חסר | עמוד שלם חסר |
| /login כניסה | ✅ תוקן | — |
| /register הרשמה | ❌ חסר | עיצוב טופס |
| /register/business | ❌ חסר | multi-step form |
| /terms תנאי שימוש | ❌ חסר | layout טקסט |
| /admin | ⚠️ חלקי | sidebar, צבעים |
| /producer/dashboard | ❌ חסר | עמוד שלם |
| 404 | ❌ חסר | דף שגיאה |

---

## עמוד 1 — /map המפה

```jsx
// layout: sidebar שמאל + מפה ימין (desktop)
//         מפה למעלה + רשימה למטה (mobile)

<div style={{ display: 'flex', height: '100vh', paddingTop: 64 }}>

  {/* Sidebar */}
  <div style={{
    width: 340, flexShrink: 0,
    background: 'white',
    borderLeft: '1px solid #e8e0d0',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    {/* חיפוש */}
    <div style={{ padding: '20px 20px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#F5F0E8', borderRadius: 10,
        padding: '10px 14px', gap: 8,
      }}>
        <MagnifyingGlass size={16} color="#6b6b6b" />
        <input
          placeholder="חפשי בעיר או קטגוריה..."
          style={{ border: 'none', background: 'transparent',
            outline: 'none', flex: 1, direction: 'rtl',
            fontFamily: 'DM Sans', fontSize: 14 }}
        />
      </div>
    </div>

    {/* מסננים */}
    <div style={{ padding: '12px 20px', borderBottom: '1px solid #e8e0d0' }}>
      <CategoryFilterPills />
    </div>

    {/* רשימת עסקים */}
    <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
      {producers.map(p => (
        <MapListCard
          key={p.id}
          producer={p}
          active={activeProducer === p.id}
          onClick={() => focusOnMap(p)}
        />
      ))}
    </div>
  </div>

  {/* מפה */}
  <div style={{ flex: 1, position: 'relative' }}>
    <LeafletMap />
  </div>
</div>

// MapListCard — כרטיסייה קומפקטית בסיידבר:
function MapListCard({ producer, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', gap: 12, padding: '12px',
      borderRadius: 12, cursor: 'pointer',
      background: active ? '#EAF3DE' : 'transparent',
      border: active ? '1px solid #2e6853' : '1px solid transparent',
      marginBottom: 4, transition: 'all 0.2s',
    }}>
      <img src={producer.images[0]} style={{
        width: 56, height: 56, borderRadius: 8,
        objectFit: 'cover', flexShrink: 0,
      }} />
      <div>
        <div style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 15, fontWeight: 700 }}>
          {producer.name}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#6b6b6b' }}>
          {producer.city} · {producer.category}
        </div>
        {producer.avg_rating > 0 && (
          <div style={{ fontSize: 12, color: '#8B6914' }}>
            ⭐ {producer.avg_rating.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  )
}

// Popup במפה — כרטיסייה קטנה:
// שם + תמונה קטנה + כפתור "פרטים מלאים →"
```

---

## עמוד 2 — /producer/:id עמוד עסק

```jsx
<main style={{ background: '#F5F0E8', paddingTop: 64 }}>

  {/* Breadcrumb */}
  <div style={{ padding: '16px 40px', fontFamily: 'DM Sans', fontSize: 13, color: '#6b6b6b' }}>
    <a href="/">בית</a> › <a href={`/?category=${producer.category}`}>{producer.category}</a> › {producer.name}
  </div>

  <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 80px' }}>

    {/* גלריה תמונות */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: '2fr 1fr',
      gap: 8, borderRadius: 20,
      overflow: 'hidden', marginBottom: 32,
      height: 400,
    }}>
      <img src={producer.images[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 8 }}>
        {producer.images.slice(1, 3).map((img, i) => (
          <img key={i} src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ))}
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32 }}>

      {/* עמודה שמאלית — מידע */}
      <div>
        {/* שם + badges */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <h1 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 36, color: '#1C1A17', flex: 1 }}>
            {producer.name}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            {producer.is_verified && (
              <span style={{ background: '#EAF3DE', color: '#2e6853',
                padding: '4px 12px', borderRadius: 20, fontSize: 13 }}>
                ✅ מאומת
              </span>
            )}
            {producer.avg_rating > 0 && (
              <span style={{ background: '#FFF9E6', color: '#8B6914',
                padding: '4px 12px', borderRadius: 20, fontSize: 13 }}>
                ⭐ {producer.avg_rating.toFixed(1)} ({producer.reviews_count})
              </span>
            )}
          </div>
        </div>

        {/* עיר + קטגוריה */}
        <div style={{ fontFamily: 'DM Sans', color: '#6b6b6b', fontSize: 15, marginBottom: 20 }}>
          <MapPin size={14} weight="duotone" /> {producer.city} &nbsp;·&nbsp; {producer.category}
        </div>

        {/* תיאור */}
        <p style={{ fontFamily: 'DM Sans', fontSize: 16, lineHeight: 1.7,
          color: '#3a3a3a', marginBottom: 32 }}>
          {producer.description}
        </p>

        {/* משלוחים */}
        {producer.delivery_areas?.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h3 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 22, marginBottom: 16 }}>
              אזורי משלוח
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#EAF3DE' }}>
                  <th style={thStyle}>עיר</th>
                  <th style={thStyle}>יום</th>
                  <th style={thStyle}>מינימום</th>
                </tr>
              </thead>
              <tbody>
                {producer.delivery_areas.map(area => (
                  <tr key={area.id} style={{ borderBottom: '1px solid #e8e0d0' }}>
                    <td style={tdStyle}>{area.city}</td>
                    <td style={tdStyle}>{area.delivery_day}</td>
                    <td style={tdStyle}>₪{area.min_order}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ביקורות */}
        <ReviewsSection producerId={producer.id} />
      </div>

      {/* עמודה ימנית — כרטיס קשר sticky */}
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'sticky', top: 80,
          background: 'white', borderRadius: 16,
          padding: 24, border: '1px solid #e8e0d0',
          boxShadow: '0 4px 24px rgba(46,104,83,0.06)',
        }}>
          <h3 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 20, marginBottom: 20 }}>
            צרי קשר
          </h3>

          {/* WhatsApp */}
          <a href={`https://wa.me/${producer.phone}?text=היי! מצאתי אותך במהמקור`}
            target="_blank"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#25D366', color: 'white',
              padding: '14px 20px', borderRadius: 10,
              textDecoration: 'none', marginBottom: 10,
              fontFamily: 'DM Sans', fontSize: 15,
            }}>
            <WhatsappLogo size={20} weight="fill" />
            שלחי הודעה
          </a>

          {/* טלפון */}
          {producer.phone && (
            <a href={`tel:${producer.phone}`} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              border: '1px solid #e8e0d0', color: '#1C1A17',
              padding: '12px 20px', borderRadius: 10,
              textDecoration: 'none', marginBottom: 10,
              fontFamily: 'DM Sans', fontSize: 15,
            }}>
              <Phone size={18} weight="duotone" />
              {producer.phone}
            </a>
          )}

          {/* אינסטגרם */}
          {producer.instagram && (
            <a href={`https://instagram.com/${producer.instagram}`} target="_blank"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                border: '1px solid #e8e0d0', color: '#1C1A17',
                padding: '12px 20px', borderRadius: 10,
                textDecoration: 'none', marginBottom: 20,
                fontFamily: 'DM Sans', fontSize: 15,
              }}>
              <InstagramLogo size={18} weight="duotone" />
              @{producer.instagram}
            </a>
          )}

          {/* מועדפים + שתף */}
          <div style={{ display: 'flex', gap: 8 }}>
            <FavoriteButton producerId={producer.id} />
            <ShareButton slug={producer.slug} name={producer.name} />
          </div>

          {/* הצג במפה */}
          <button onClick={() => focusOnMap(producer)}
            style={{
              width: '100%', marginTop: 12,
              border: '1px solid #2e6853', color: '#2e6853',
              background: 'transparent', padding: '10px',
              borderRadius: 8, cursor: 'pointer',
              fontFamily: 'DM Sans', fontSize: 14,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
            }}>
            <MapTrifold size={16} weight="duotone" />
            הצג במפה
          </button>
        </div>
      </div>
    </div>
  </div>
</main>
```

---

## עמוד 3 — /events אירועים

```jsx
<main style={{ background: '#F5F0E8', paddingTop: 80, minHeight: '100vh' }}>
  <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

    {/* Header */}
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ textAlign: 'center', padding: '48px 0 40px' }}
    >
      <h1 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 'clamp(32px, 5vw, 52px)', color: '#1C1A17' }}>
        אירועים בחוות ואצל יצרנים
      </h1>
      <p style={{ fontFamily: 'DM Sans', color: '#6b6b6b', fontSize: 17, marginTop: 12 }}>
        סדנאות, סיורים, ימים פתוחים וטעימות
      </p>
    </motion.div>

    {/* מסננים */}
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap',
      marginBottom: 32, justifyContent: 'center',
    }}>
      {['הכל', 'סדנה', 'סיור', 'שוק', 'קטיף', 'טעימות'].map(cat => (
        <button key={cat}
          onClick={() => setFilter(cat)}
          style={{
            padding: '8px 20px', borderRadius: 50,
            border: '1px solid #e8e0d0',
            background: filter === cat ? '#2e6853' : 'white',
            color: filter === cat ? 'white' : '#1C1A17',
            fontFamily: 'DM Sans', fontSize: 14, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>
          {cat}
        </button>
      ))}
    </div>

    {/* גריד אירועים */}
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 24, paddingBottom: 80,
      }}
    >
      {events.map(event => (
        <motion.div key={event.id} variants={item}>
          <EventCard event={event} />
        </motion.div>
      ))}
    </motion.div>
  </div>
</main>

// EventCard:
function EventCard({ event }) {
  return (
    <div style={{
      background: 'white', borderRadius: 16,
      overflow: 'hidden', border: '1px solid #e8e0d0',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-4px)'
      e.currentTarget.style.boxShadow = '0 8px 32px rgba(46,104,83,0.12)'
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = 'none'
      e.currentTarget.style.boxShadow = 'none'
    }}>
      <img src={event.image_url || event.producer?.images[0]}
        style={{ width: '100%', height: 180, objectFit: 'cover' }} />
      <div style={{ padding: '20px' }}>
        {/* תאריך */}
        <div style={{
          fontFamily: 'DM Sans', fontSize: 13,
          color: '#2e6853', fontWeight: 600, marginBottom: 8,
        }}>
          📅 {formatDate(event.event_date)} · {event.event_time}
        </div>
        {/* שם */}
        <h3 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 20, marginBottom: 6 }}>
          {event.title}
        </h3>
        {/* עסק + עיר */}
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#6b6b6b', marginBottom: 12 }}>
          {event.producer?.name} · {event.city}
        </div>
        {/* תחתית */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            background: '#EAF3DE', color: '#2e6853',
            padding: '3px 10px', borderRadius: 20, fontSize: 12,
          }}>
            {event.category}
          </span>
          <span style={{ fontFamily: 'DM Sans', fontWeight: 600, color: '#8B6914' }}>
            {event.price === 0 ? 'חינם' : `₪${event.price}`}
          </span>
        </div>
      </div>
    </div>
  )
}
```

---

## עמוד 4 — /register/business הרשמת עסק (multi-step)

```jsx
// 4 שלבים ברורים:

const STEPS = ['פרטי העסק', 'תמונות', 'משלוחים', 'סיכום']

<main style={{ background: '#F5F0E8', minHeight: '100vh', paddingTop: 80 }}>
  <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>

    {/* Progress bar */}
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        {STEPS.map((step, i) => (
          <span key={step} style={{
            fontFamily: 'DM Sans', fontSize: 13,
            color: i <= currentStep ? '#2e6853' : '#aaa',
            fontWeight: i === currentStep ? 600 : 400,
          }}>
            {step}
          </span>
        ))}
      </div>
      <div style={{ height: 4, background: '#e8e0d0', borderRadius: 2 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: '#2e6853',
          width: `${((currentStep + 1) / STEPS.length) * 100}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>

    {/* כרטיס שלב */}
    <AnimatePresence mode="wait">
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        style={{
          background: 'white', borderRadius: 20,
          padding: '40px', border: '1px solid #e8e0d0',
        }}
      >
        {currentStep === 0 && <StepBusinessInfo />}
        {currentStep === 1 && <StepImages />}
        {currentStep === 2 && <StepDelivery />}
        {currentStep === 3 && <StepSummary />}
      </motion.div>
    </AnimatePresence>

    {/* כפתורי ניווט */}
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
      {currentStep > 0 && (
        <button onClick={prevStep} style={{
          border: '1px solid #e8e0d0', background: 'white',
          padding: '12px 24px', borderRadius: 10, cursor: 'pointer',
          fontFamily: 'DM Sans',
        }}>
          → חזרה
        </button>
      )}
      <button onClick={nextStep} style={{
        background: '#2e6853', color: 'white',
        border: 'none', padding: '12px 32px',
        borderRadius: 10, cursor: 'pointer',
        fontFamily: 'DM Sans', marginRight: 'auto',
      }}>
        {currentStep === STEPS.length - 1 ? 'שלחי לאישור 🌿' : 'המשך'}
      </button>
    </div>
  </div>
</main>
```

---

## עמוד 5 — /terms תנאי שימוש

```jsx
<main style={{ background: '#F5F0E8', paddingTop: 80, minHeight: '100vh' }}>
  <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px' }}>

    <h1 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 40, marginBottom: 8 }}>
      תנאי שימוש
    </h1>
    <p style={{ fontFamily: 'DM Sans', color: '#6b6b6b', marginBottom: 48 }}>
      עדכון אחרון: אפריל 2026
    </p>

    {/* סקציות — כל אחת בכרטיס */}
    {TERMS_SECTIONS.map(section => (
      <div key={section.title} style={{
        background: 'white', borderRadius: 16,
        padding: '28px 32px', marginBottom: 16,
        border: '1px solid #e8e0d0',
      }}>
        <h2 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 22, marginBottom: 12 }}>
          {section.title}
        </h2>
        <p style={{ fontFamily: 'DM Sans', lineHeight: 1.8, color: '#3a3a3a' }}>
          {section.content}
        </p>
      </div>
    ))}
  </div>
</main>
```

---

## עמוד 6 — /admin (layout כללי)

```jsx
// עיצוב admin — ירוק כהה, מקצועי אבל לא קר

// צבעים לאדמין בלבד:
const ADMIN_COLORS = {
  sidebar: '#1a2e1a',      // ירוק כהה מאוד
  sidebarActive: '#2e6853',
  sidebarText: '#EAF3DE',
  content: '#F5F0E8',
  card: 'white',
}

<div style={{ display: 'flex', minHeight: '100vh' }}>

  {/* Sidebar */}
  <div style={{
    width: 240, background: ADMIN_COLORS.sidebar,
    padding: '24px 0', flexShrink: 0,
    position: 'fixed', top: 0, bottom: 0, right: 0,
  }}>
    <div style={{
      padding: '0 20px 24px',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      fontFamily: 'Frank Ruhl Libre', fontSize: 20, color: 'white',
    }}>
      מהמקור Admin
    </div>

    <nav style={{ padding: '16px 12px' }}>
      {ADMIN_MENU.map(item => (
        <a key={item.href} href={item.href} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 8,
          color: isActive(item.href) ? 'white' : 'rgba(255,255,255,0.6)',
          background: isActive(item.href) ? ADMIN_COLORS.sidebarActive : 'transparent',
          textDecoration: 'none', fontFamily: 'DM Sans', fontSize: 14,
          marginBottom: 2, transition: 'all 0.15s',
        }}>
          <item.Icon size={16} weight="duotone" />
          {item.label}
        </a>
      ))}
    </nav>
  </div>

  {/* Content */}
  <main style={{
    flex: 1, marginRight: 240,
    background: ADMIN_COLORS.content,
    minHeight: '100vh', padding: '32px',
  }}>
    {children}
  </main>
</div>
```

---

## עמוד 7 — 404

```jsx
<main style={{
  background: '#F5F0E8', minHeight: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}}>
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    style={{ textAlign: 'center', padding: 24 }}
  >
    <div style={{ fontSize: 80, marginBottom: 16 }}>🌿</div>
    <h1 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 48, color: '#1C1A17', marginBottom: 12 }}>
      404
    </h1>
    <p style={{ fontFamily: 'DM Sans', fontSize: 18, color: '#6b6b6b', marginBottom: 32 }}>
      הדף לא נמצא — אבל יש לנו הרבה בתי עסק טובים 🌱
    </p>
    <a href="/" style={{
      background: '#2e6853', color: 'white',
      padding: '14px 32px', borderRadius: 50,
      textDecoration: 'none', fontFamily: 'DM Sans', fontSize: 15,
    }}>
      חזרה לדף הבית
    </a>
  </motion.div>
</main>
```

---

## Helper Styles — שים בקובץ נפרד

```js
// styles/shared.js
export const thStyle = {
  padding: '10px 16px', textAlign: 'right',
  fontFamily: 'DM Sans', fontSize: 13,
  color: '#2e6853', fontWeight: 600,
}

export const tdStyle = {
  padding: '12px 16px',
  fontFamily: 'DM Sans', fontSize: 14,
  color: '#1C1A17',
}

export const WarmInput = ({ placeholder, type = 'text', value, onChange }) => (
  <input
    type={type} placeholder={placeholder}
    value={value} onChange={onChange}
    style={{
      padding: '12px 16px', borderRadius: 10,
      border: '1px solid #e8e0d0',
      background: 'white', fontSize: 15,
      fontFamily: 'DM Sans', outline: 'none',
      direction: 'rtl', width: '100%',
      transition: 'border-color 0.2s',
    }}
    onFocus={e => e.target.style.borderColor = '#2e6853'}
    onBlur={e => e.target.style.borderColor = '#e8e0d0'}
  />
)
```

---

## עדכן CLAUDE.md:

```
עדכן CLAUDE.md:
## עיצוב — כיסוי מלא לכל העמודים (אפריל 2026)
- /map: sidebar + MapListCard + LeafletMap
- /producer/:id: gallery grid + sticky contact card + reviews
- /events: filter pills + EventCard grid
- /register/business: 4-step multi-step + AnimatePresence transitions
- /terms: כרטיסי סקציות על #F5F0E8
- /admin: sidebar #1a2e1a + content #F5F0E8
- 404: 🌿 + הפניה לדף הבית
- shared: WarmInput, thStyle, tdStyle
```
