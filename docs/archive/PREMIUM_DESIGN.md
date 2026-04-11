# מהמקור — שיפורי עיצוב פרמיום
> קרא CLAUDE.md קודם. עדכן CLAUDE.md בסוף.
> השראה: gardensweet.com, Graza, Simply Chocolate, Foraged

---

## שיפור 1 — Line-Art SVG Icons (במקום Phosphor)

האתרים הטובים ביותר (gardensweet, Graza) משתמשים ב-hand-drawn SVG.
מרגיש חם, אנושי, וייחודי — לא generic כמו ספריית אייקונים.

```jsx
// החלף את כל Phosphor Icons בקטגוריות ב-SVG מותאם:

const CategoryIcons = {
  'בשר, עוף ודגים': (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none"
      stroke="#2e6853" strokeWidth="1.5" strokeLinecap="round">
      {/* חתך בשר */}
      <path d="M12 44 C12 44 8 36 14 28 C20 20 32 18 38 22 C44 26 46 34 42 40 C38 46 28 48 20 46 Z"/>
      <path d="M38 22 L52 10"/>
      <circle cx="50" cy="12" r="4"/>
      <path d="M20 38 C22 35 26 34 29 36"/>
    </svg>
  ),
  'ירקות, פירות ומשקים': (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none"
      stroke="#2e6853" strokeWidth="1.5" strokeLinecap="round">
      {/* עלה */}
      <path d="M32 52 L32 20"/>
      <path d="M32 20 C32 20 18 16 14 28 C18 28 26 26 32 32"/>
      <path d="M32 28 C32 28 44 20 50 30 C46 32 38 30 32 36"/>
      <path d="M28 44 L20 50"/>
    </svg>
  ),
  'חלב וגבינות': (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none"
      stroke="#2e6853" strokeWidth="1.5" strokeLinecap="round">
      {/* בקבוק חלב */}
      <path d="M24 16 L24 12 C24 10 26 8 28 8 L36 8 C38 8 40 10 40 12 L40 16"/>
      <path d="M20 16 L20 52 C20 54 22 56 24 56 L40 56 C42 56 44 54 44 52 L44 16 Z"/>
      <path d="M20 26 L44 26"/>
      <circle cx="30" cy="38" r="2"/>
      <circle cx="36" cy="44" r="2"/>
    </svg>
  ),
  'לחמים ואפייה': (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none"
      stroke="#2e6853" strokeWidth="1.5" strokeLinecap="round">
      {/* לחם עם קיטור */}
      <path d="M14 40 C14 40 12 32 18 26 C24 20 40 20 46 26 C52 32 50 40 50 40 Z"/>
      <path d="M14 40 L14 48 C14 50 16 52 18 52 L46 52 C48 52 50 50 50 48 L50 40"/>
      <path d="M24 20 C24 16 22 14 24 10"/>
      <path d="M32 20 C32 14 30 12 32 8"/>
      <path d="M40 20 C40 16 38 14 40 10"/>
    </svg>
  ),
  'שמנים ודבש': (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none"
      stroke="#2e6853" strokeWidth="1.5" strokeLinecap="round">
      {/* צנצנת עם מכסה */}
      <path d="M22 24 L22 52 C22 54 24 56 26 56 L38 56 C40 56 42 54 42 52 L42 24 Z"/>
      <path d="M20 24 L44 24"/>
      <path d="M24 18 L40 18 C42 18 44 20 44 22 L44 24 L20 24 L20 22 C20 20 22 18 24 18 Z"/>
      <path d="M28 36 C30 32 34 32 36 36 C38 40 36 46 32 46 C28 46 26 40 28 36 Z"/>
    </svg>
  ),
  'טיפוח וסבונים': (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none"
      stroke="#2e6853" strokeWidth="1.5" strokeLinecap="round">
      {/* ספל סבון */}
      <rect x="18" y="28" width="28" height="24" rx="4"/>
      <path d="M22 28 L22 22 C22 20 24 18 26 18 L38 18 C40 18 42 20 42 22 L42 28"/>
      <circle cx="26" cy="16" r="3"/>
      <circle cx="34" cy="12" r="2"/>
      <circle cx="40" cy="15" r="2.5"/>
    </svg>
  ),
}
```

**שימוש בקטגוריות grid:**
```jsx
// במקום: <Leaf size={40} weight="duotone" color="white" />
// שים:
<div style={{ marginBottom: 16 }}>
  {React.cloneElement(CategoryIcons[category.name], {
    stroke: 'white', width: 56, height: 56
  })}
</div>
```

---

## שיפור 2 — Ken Burns Effect

```css
/* globals.css */
@keyframes kenburns-right {
  0%   { transform: scale(1) translate(0%, 0%); }
  100% { transform: scale(1.08) translate(-2%, -1%); }
}
@keyframes kenburns-left {
  0%   { transform: scale(1) translate(0%, 0%); }
  100% { transform: scale(1.08) translate(2%, -1%); }
}

.hero-bg {
  animation: kenburns-right 20s ease-in-out infinite alternate;
  will-change: transform;
}
.parallax-bg {
  animation: kenburns-left 25s ease-in-out infinite alternate;
  will-change: transform;
}
```

```jsx
// Hero Section:
<div style={{ overflow: 'hidden', position: 'absolute', inset: 0 }}>
  <div
    className="hero-bg"
    style={{
      position: 'absolute', inset: '-5%',
      backgroundImage: 'url(...)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}
  />
</div>

// ParallaxDivider:
<div style={{ overflow: 'hidden', height: 420, position: 'relative' }}>
  <div
    className="parallax-bg"
    style={{
      position: 'absolute', inset: '-5%',
      backgroundImage: `url(${image})`,
      backgroundSize: 'cover',
    }}
  />
</div>
```

---

## שיפור 3 — Marquee (גלילת טקסט אינסופית)

האתרים הטובים (Graza, Foraged) משתמשים בזה בין סקציות — נותן תחושת פרמיום:

```css
@keyframes marquee {
  0%   { transform: translateX(0%); }
  100% { transform: translateX(-50%); }
}
.marquee-track {
  animation: marquee 25s linear infinite;
  display: flex;
  gap: 48px;
  width: max-content;
}
```

```jsx
// הוסף בין Category Grid ל-Producers section:
<div style={{
  background: '#2e6853',
  padding: '14px 0',
  overflow: 'hidden',
  borderTop: '1px solid rgba(255,255,255,0.1)',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
}}>
  <div className="marquee-track">
    {[...Array(2)].map((_, i) => (
      <React.Fragment key={i}>
        {['🌿 ללא מעובד', '🥩 ממרעה', '🧀 אורגני',
          '🍞 מחמצת', '🫒 כתית', '🌱 טרי ואמיתי',
          '✅ מאומת', '📍 מקומי'].map(text => (
          <span key={text} style={{
            color: '#EAF3DE', fontFamily: 'DM Sans',
            fontSize: 14, letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}>
            {text}
          </span>
        ))}
      </React.Fragment>
    ))}
  </div>
</div>
```

---

## שיפור 4 — Number Counter Animation

כשמשתמש מגיע ל-Social Proof Bar — המספרים סופרים מ-0:

```jsx
import { useEffect, useState, useRef } from 'react'

function AnimatedCounter({ target, duration = 1500 }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true
        const start = Date.now()
        const tick = () => {
          const elapsed = Date.now() - start
          const progress = Math.min(elapsed / duration, 1)
          // easeOut
          const eased = 1 - Math.pow(1 - progress, 3)
          setCount(Math.floor(eased * target))
          if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.5 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target, duration])

  return <span ref={ref}>{count}</span>
}

// שימוש ב-Social Proof Bar:
<AnimatedCounter target={producersCount} /> יצרנים מאומתים
```

---

## שיפור 5 — Cursor Custom (עדין)

Graza ואתרי food פרמיום משתמשים ב-custom cursor עדין:

```css
/* cursor ירוק עגול קטן */
* { cursor: none; }

.custom-cursor {
  width: 12px; height: 12px;
  background: #2e6853;
  border-radius: 50%;
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  transition: transform 0.15s ease, opacity 0.3s;
  mix-blend-mode: multiply;
}
.custom-cursor.hover {
  transform: scale(3);
  opacity: 0.4;
}
```

```jsx
// components/CustomCursor.jsx
export default function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const move = e => setPos({ x: e.clientX, y: e.clientY })
    const enter = () => setHovered(true)
    const leave = () => setHovered(false)

    window.addEventListener('mousemove', move)
    document.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('mouseenter', enter)
      el.addEventListener('mouseleave', leave)
    })
    return () => window.removeEventListener('mousemove', move)
  }, [])

  return (
    <div
      className={`custom-cursor ${hovered ? 'hover' : ''}`}
      style={{ left: pos.x - 6, top: pos.y - 6 }}
    />
  )
}
// הוסף ב-layout.js: <CustomCursor />
// ⚠️ desktop בלבד! הסתר על mobile
```

---

## שיפור 6 — תמונות נוספות לאתר (Unsplash חינם)

```
Hero:
https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920

Parallax divider 1 (בין categories לproducers):
https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600

Parallax divider 2 (לפני events):
https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1600

/about hero background:
https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600

/neighbor header:
https://images.unsplash.com/photo-1498579809087-ef1e558fd1da?w=1600

/events header:
https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600
```

---

## מה לשלוח ל-Claude Code

```
Read CLAUDE.md, then read PREMIUM_DESIGN.md and implement:

1. Replace Phosphor category icons with hand-drawn SVG line-art
   (see CategoryIcons object in file)

2. Add Ken Burns animation to hero and parallax dividers

3. Add marquee strip between category grid and producers section
   (scrolling text: ללא מעובד · ממרעה · אורגני · מחמצת...)

4. Add AnimatedCounter to Social Proof Bar numbers

5. Add subtle custom cursor (desktop only, hide on mobile/touch)

6. Add all Unsplash images to appropriate sections

Update CLAUDE.md after.
```

---

## עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
- אייקונים: hand-drawn SVG line-art (לא Phosphor) בקטגוריות
- Ken Burns: hero + parallax dividers
- Marquee strip: בין categories לproducers
- AnimatedCounter: Social Proof Bar
- Custom cursor: desktop בלבד, mix-blend-mode: multiply
- תמונות Unsplash: hero, parallax x2, about, neighbor, events
```
