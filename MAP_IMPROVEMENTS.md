# מהמקור — שיפורי UX לדף המפה
> קרא CLAUDE.md קודם. עדכן CLAUDE.md בסוף.

---

## מה למדנו מ-Airbnb, LocalHarvest ואתרים מובילים

הדברים שעושים מפת חיפוש טובה:
1. רשימה ומפה **תמיד ביחד** — לא toggle בין שניהם
2. hover על כרטיסייה = הסימן במפה מואר (ולהפך)
3. גלילה במפה = הרשימה מתעדכנת אוטומטית
4. Clustering — כשיש הרבה עסקים באזור קטן
5. "חפש באזור זה" — כפתור שמופיע אחרי גלילה
6. מיקום נוכחי — "הצג עסקים קרובים אלי"
7. סימנים שונים לפי קטגוריה

---

## שיפור 1 — "חפש באזור זה" (כמו Airbnb)

```jsx
// כשהמשתמש מזיז את המפה — הצג כפתור:
const [mapMoved, setMapMoved] = useState(false)
const [mapBounds, setMapBounds] = useState(null)

// על אירוע move של Leaflet:
map.on('moveend', () => {
  setMapMoved(true)
  setMapBounds(map.getBounds())
})

// כפתור שמופיע אחרי גלילה:
{mapMoved && (
  <div style={{
    position: 'absolute',
    top: 16, left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
  }}>
    <button
      onClick={() => {
        fetchProducersInBounds(mapBounds)
        setMapMoved(false)
      }}
      style={{
        background: 'white',
        border: '1px solid #e8e0d0',
        borderRadius: 50,
        padding: '10px 20px',
        fontFamily: 'DM Sans',
        fontSize: 14,
        cursor: 'pointer',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      🔍 חפש באזור זה
    </button>
  </div>
)}
```

---

## שיפור 2 — מיקום נוכחי

```jsx
// כפתור "קרוב אלי" בפינת המפה:
<button
  onClick={() => {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords
      map.flyTo([latitude, longitude], 13, { duration: 1.2 })
      fetchProducersNear(latitude, longitude, 10) // 10 ק"מ
    })
  }}
  style={{
    position: 'absolute',
    bottom: 24, left: 16,
    zIndex: 1000,
    background: 'white',
    border: '1px solid #e8e0d0',
    borderRadius: 10,
    padding: '10px 14px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'DM Sans',
    fontSize: 13,
  }}
>
  <MapPin size={16} weight="duotone" color="#2e6853" />
  קרוב אלי
</button>
```

---

## שיפור 3 — Hover מקושר (רשימה ↔ מפה)

```jsx
// state משותף:
const [hoveredId, setHoveredId] = useState(null)

// בכרטיסייה:
<div
  onMouseEnter={() => {
    setHoveredId(producer.id)
    // הדגש סימן במפה:
    markers[producer.id]?.setZIndexOffset(1000)
    markers[producer.id]?.getElement()?.classList.add('marker-hovered')
  }}
  onMouseLeave={() => {
    setHoveredId(null)
    markers[producer.id]?.setZIndexOffset(0)
    markers[producer.id]?.getElement()?.classList.remove('marker-hovered')
  }}
  style={{
    border: hoveredId === producer.id
      ? '2px solid #2e6853'
      : '1px solid #e8e0d0',
    transform: hoveredId === producer.id ? 'scale(1.01)' : 'none',
    transition: 'all 0.15s',
  }}
>

// CSS לסימן מואר:
// .marker-hovered { transform: scale(1.3); filter: brightness(1.1); }
```

---

## שיפור 4 — Clustering (כשיש הרבה עסקים)

```bash
npm install react-leaflet-cluster
```

```jsx
import MarkerClusterGroup from 'react-leaflet-cluster'

// עטוף את כל הסימנים:
<MarkerClusterGroup
  chunkedLoading
  iconCreateFunction={(cluster) => {
    // סימן cluster מותאם אישית:
    return L.divIcon({
      html: `
        <div style="
          background: #2e6853; color: white;
          border-radius: 50%; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          font-family: DM Sans; font-size: 13px; font-weight: 600;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        ">
          ${cluster.getChildCount()}
        </div>
      `,
      className: '',
      iconSize: [36, 36],
    })
  }}
>
  {producers.map(p => <ProducerMarker key={p.id} producer={p} />)}
</MarkerClusterGroup>
```

---

## שיפור 5 — סימנים לפי קטגוריה

```jsx
// סימן שונה לכל קטגוריה:
const CATEGORY_COLORS = {
  'בשר, עוף ודגים':      '#c04040',
  'ירקות, פירות ומשקים': '#2e6853',
  'חלב וגבינות':          '#4a90d9',
  'לחמים ואפייה':         '#8B6914',
  'שמנים ודבש':           '#e8a020',
  'טיפוח וסבונים':        '#9b59b6',
}

const CATEGORY_EMOJIS = {
  'בשר, עוף ודגים':      '🥩',
  'ירקות, פירות ומשקים': '🥬',
  'חלב וגבינות':          '🥛',
  'לחמים ואפייה':         '🍞',
  'שמנים ודבש':           '🫒',
  'טיפוח וסבונים':        '🧴',
}

function createCustomMarker(producer, isActive) {
  const color = CATEGORY_COLORS[producer.category] || '#2e6853'
  const emoji = CATEGORY_EMOJIS[producer.category] || '🌿'

  return L.divIcon({
    html: `
      <div style="
        background: ${isActive ? color : 'white'};
        color: ${isActive ? 'white' : color};
        border: 2px solid ${color};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        width: ${isActive ? '40px' : '32px'};
        height: ${isActive ? '40px' : '32px'};
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: all 0.2s;
      ">
        <span style="transform: rotate(45deg); font-size: ${isActive ? '18px' : '14px'}">
          ${emoji}
        </span>
      </div>
    `,
    className: '',
    iconSize: [isActive ? 40 : 32, isActive ? 40 : 32],
    iconAnchor: [isActive ? 20 : 16, isActive ? 40 : 32],
  })
}
```

---

## שיפור 6 — Popup משופר

```jsx
// Popup שמציג מידע מהיר + כפתורי פעולה:
function ProducerPopup({ producer }) {
  return `
    <div style="
      font-family: DM Sans; min-width: 220px;
      direction: rtl; padding: 4px;
    ">
      <img src="${producer.images[0]}"
        style="width: 100%; height: 120px; object-fit: cover;
               border-radius: 8px; margin-bottom: 10px;" />
      <div style="font-family: Frank Ruhl Libre; font-size: 16px;
                  font-weight: 700; margin-bottom: 4px;">
        ${producer.name}
      </div>
      <div style="font-size: 13px; color: #6b6b6b; margin-bottom: 8px;">
        ${producer.city} · ${producer.category}
      </div>
      ${producer.avg_rating ? `
        <div style="font-size: 13px; color: #8B6914; margin-bottom: 10px;">
          ⭐ ${producer.avg_rating.toFixed(1)} (${producer.reviews_count} ביקורות)
        </div>
      ` : ''}
      <div style="display: flex; gap: 6px;">
        <a href="/producer/${producer.slug}"
          style="flex: 1; background: #2e6853; color: white;
                 padding: 8px; border-radius: 6px; text-align: center;
                 text-decoration: none; font-size: 13px;">
          פרטים מלאים
        </a>
        <a href="https://wa.me/${producer.phone}?text=היי! מצאתי אותך במהמקור"
          target="_blank"
          style="background: #25D366; color: white;
                 padding: 8px 10px; border-radius: 6px;
                 text-decoration: none; font-size: 16px;">
          💬
        </a>
      </div>
    </div>
  `
}
```

---

## שיפור 7 — Mobile: תצוגת כרטיסייה תחתית

```jsx
// במובייל — במקום sidebar, הצג כרטיסייה בתחתית כשלוחצים על סימן:
{isMobile && selectedProducer && (
  <motion.div
    initial={{ y: '100%' }}
    animate={{ y: 0 }}
    exit={{ y: '100%' }}
    transition={{ type: 'spring', damping: 25 }}
    style={{
      position: 'fixed',
      bottom: 64, // מעל bottom nav
      left: 0, right: 0,
      background: 'white',
      borderRadius: '20px 20px 0 0',
      padding: '20px',
      zIndex: 500,
      boxShadow: '0 -4px 32px rgba(0,0,0,0.12)',
    }}
  >
    {/* drag handle */}
    <div style={{
      width: 36, height: 4,
      background: '#e8e0d0',
      borderRadius: 2,
      margin: '0 auto 16px',
    }} />

    <MobileProducerCard producer={selectedProducer} />
  </motion.div>
)}
```

---

## שיפור 8 — Legend (מקרא) עם פילטר קטגוריה

```jsx
// בפינה שמאלית תחתונה — legend שהוא גם פילטר:
<div style={{
  position: 'absolute',
  bottom: 24, right: 16,
  zIndex: 1000,
  background: 'white',
  borderRadius: 12,
  padding: '12px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
  maxWidth: 180,
}}>
  <div style={{ fontFamily: 'DM Sans', fontSize: 11,
    color: '#6b6b6b', marginBottom: 8, letterSpacing: '0.08em' }}>
    קטגוריות
  </div>
  {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
    <div
      key={cat}
      onClick={() => toggleCategoryFilter(cat)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 6px', borderRadius: 6, cursor: 'pointer',
        opacity: activeCategories.includes(cat) ? 1 : 0.4,
        transition: 'opacity 0.2s',
        marginBottom: 2,
      }}
    >
      <div style={{
        width: 12, height: 12,
        background: color, borderRadius: '50%',
      }} />
      <span style={{ fontFamily: 'DM Sans', fontSize: 12 }}>
        {CATEGORY_EMOJIS[cat]} {cat.split(',')[0]}
      </span>
    </div>
  ))}
</div>
```

---

## שיפור 9 — "אין תוצאות באזור" — Empty State

```jsx
{producers.length === 0 && !loading && (
  <div style={{
    position: 'absolute',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'white',
    borderRadius: 16, padding: '24px 32px',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
    zIndex: 1000,
    maxWidth: 280,
  }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
    <div style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 18, marginBottom: 8 }}>
      אין עסקים באזור זה עדיין
    </div>
    <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#6b6b6b', marginBottom: 16 }}>
      מכירה מישהי שתוכל להצטרף?
    </div>
    <a href="/register/business" style={{
      background: '#2e6853', color: 'white',
      padding: '10px 20px', borderRadius: 8,
      textDecoration: 'none', fontFamily: 'DM Sans', fontSize: 14,
    }}>
      הוסיפי עסק +
    </a>
  </div>
)}
```

---

## מה לשלוח ל-Claude Code

```
Read CLAUDE.md, then read MAP_IMPROVEMENTS.md and implement all 10 improvements — including the bug fix (improvement 10) first to the /map page.

Priority order:
1. "חפש באזור זה" button (appears after map move)
2. "קרוב אלי" geolocation button
3. Hover sync between list and map markers
4. Marker clustering (npm install react-leaflet-cluster)
5. Category-colored custom markers with emoji
6. Improved popup with photo + action buttons
7. Mobile bottom sheet card (instead of sidebar)
8. Category legend / filter in map corner
9. Empty state when no results in area

Update CLAUDE.md after.
```

---

## עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
## מפה — שיפורים (אפריל 2026)
- "חפש באזור זה" — מופיע אחרי גלילה
- "קרוב אלי" — geolocation
- hover sync — רשימה ↔ מפה דו-כיווני
- clustering — react-leaflet-cluster
- סימנים צבעוניים לפי קטגוריה + emoji
- popup עם תמונה + כפתורי פעולה
- mobile: bottom sheet במקום sidebar
- legend = פילטר קטגוריה בפינה
- empty state: "אין עסקים כאן — הוסיפי +"
```

---

## שיפור 10 — תיקון באג: סימנים מציגים "arker" במקום שם העסק

```jsx
// הבאג: סימנים מציגים "arker" במקום producer.name
// הסיבה הנפוצה: typo ב-template או producer.name=undefined בזמן יצירת הסימן

// ❌ מה שכנראה קיים:
html: `<div>m${producer.name}</div>`
// כש-name=undefined → "mundefined" → נראה כ-"arker"

// ✅ תיקון 1 — הסר את השם מתוך הסימן עצמו, שים רק ב-tooltip:
function createCustomMarker(producer, isActive) {
  const color = CATEGORY_COLORS[producer?.category] || '#2e6853'
  const emoji = CATEGORY_EMOJIS[producer?.category] || '🌿'

  return L.divIcon({
    html: `
      <div style="
        background: ${isActive ? color : 'white'};
        color: ${isActive ? 'white' : color};
        border: 2px solid ${color};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      ">
        <span style="transform: rotate(45deg); font-size: 14px">
          ${emoji}
        </span>
      </div>
    `,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })
}

// ✅ תיקון 2 — Tooltip עם שם נכון:
const marker = L.marker([producer.lat, producer.lng], {
  icon: createCustomMarker(producer, false)
})

marker.bindTooltip(producer.name || 'עסק', {
  permanent: false,
  direction: 'top',
  className: 'producer-tooltip',
})

// ✅ תיקון 3 — ודאי שהסימנים נוצרים רק אחרי שהנתונים נטענו:
useEffect(() => {
  if (!producers || producers.length === 0) return  // ← חשוב!
  producers.forEach(p => {
    if (!p.lat || !p.lng) return  // דלג על עסקים בלי קואורדינטות
    createAndAddMarker(p)
  })
}, [producers])
```

