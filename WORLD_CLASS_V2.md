# מהמקור — עיצוב רמה עולמית
> קרא CLAUDE.md ו-docs/DESIGN.md קודם. בצע לפי הסדר. עדכן CLAUDE.md בסוף.

---

## התקנות נדרשות

```bash
npm install framer-motion @phosphor-icons/react lenis
```

---

## 1. Smooth Scroll — תחושת אתר יוקרתי (Lenis)

זה מה שנותן את התחושה "חלקה" שראית ב-superpower ו-fragment:

```jsx
// app/layout.js
'use client'
import Lenis from 'lenis'
import { useEffect } from 'react'

export default function RootLayout({ children }) {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })
    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    return () => lenis.destroy()
  }, [])

  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
```

---

## 2. Navbar — שקוף + blur (בהשראת beautiful-319)

```jsx
// components/Navbar.jsx
'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Calendar, House, UserCircle } from '@phosphor-icons/react'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        padding: scrolled ? '12px 40px' : '20px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
        background: scrolled ? 'rgba(245,240,232,0.88)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(232,224,208,0.6)' : 'none',
      }}
    >
      {/* לוגו */}
      <a href="/" style={{
        fontFamily: 'Frank Ruhl Libre', fontSize: 22, fontWeight: 700,
        color: scrolled ? '#2e6853' : 'white', textDecoration: 'none',
        letterSpacing: '-0.01em',
      }}>
        מהמקור
      </a>

      {/* ניווט — desktop */}
      <div className="desktop-nav" style={{ display: 'flex', gap: 36, alignItems: 'center' }}>
        {[
          { label: 'גלי עסקים', href: '/' },
          { label: 'מפה', href: '/map' },
          { label: 'אירועים', href: '/events' },
          { label: 'מהשכן', href: '/#neighbor' },
        ].map(item => (
          <a key={item.href} href={item.href} style={{
            fontFamily: 'DM Sans', fontSize: 15,
            color: scrolled ? '#1C1A17' : 'rgba(255,255,255,0.9)',
            textDecoration: 'none', transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => e.target.style.opacity = 0.6}
          onMouseLeave={e => e.target.style.opacity = 1}>
            {item.label}
          </a>
        ))}
      </div>

      {/* CTA */}
      <motion.a
        href="/register/business"
        whileHover={{ scale: 1.03, boxShadow: '0 6px 24px rgba(46,104,83,0.3)' }}
        whileTap={{ scale: 0.97 }}
        style={{
          background: '#2e6853', color: 'white',
          padding: '10px 22px', borderRadius: 50,
          fontFamily: 'DM Sans', fontSize: 14,
          textDecoration: 'none',
        }}
      >
        + הוסיפי עסק
      </motion.a>
    </motion.nav>
  )
}
```

---

## 3. Hero — Sticky Text Reveal (כמו superpower)

```jsx
// components/HeroSection.jsx
'use client'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

export default function HeroSection() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08])

  return (
    <section ref={ref} style={{ height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* תמונת רקע עם parallax */}
      <motion.div style={{
        position: 'absolute', inset: '-10%',
        backgroundImage: 'url(https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        scale,
      }} />

      {/* Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(46,74,46,0.85) 0%, rgba(46,74,46,0.25) 60%, transparent 100%)',
      }} />

      {/* תוכן */}
      <motion.div style={{
        position: 'absolute', bottom: '22%', left: 0, right: 0,
        textAlign: 'center', padding: '0 24px',
        y, opacity,
      }}>
        {/* tag line */}
        <motion.span
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          style={{
            display: 'inline-block',
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            color: '#EAF3DE',
            padding: '6px 18px', borderRadius: 50,
            fontSize: 13, letterSpacing: '0.1em',
            marginBottom: 20, textTransform: 'uppercase',
          }}
        >
          🌿 ישירות מהיצרן אליך
        </motion.span>

        {/* כותרת ראשית */}
        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontFamily: 'Frank Ruhl Libre',
            fontSize: 'clamp(44px, 7vw, 88px)',
            color: 'white', lineHeight: 1.1,
            fontWeight: 700, margin: '0 0 16px',
          }}
        >
          אוכל אמיתי,<br />ישר מהמקור אליך
        </motion.h1>

        {/* תת כותרת */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.7 }}
          style={{
            fontFamily: 'DM Sans', fontSize: 18,
            color: '#EAF3DE', letterSpacing: '0.06em',
            textTransform: 'uppercase', marginBottom: 36,
          }}
        >
          בתי עסק מקומיים · מגדלים קטנים · שכנות שמבשלות בבית
        </motion.p>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.7 }}
          style={{
            display: 'flex', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'white', borderRadius: 50,
            padding: '6px 6px 6px 24px',
            display: 'flex', alignItems: 'center',
            gap: 12, width: 'min(560px, 90vw)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          }}>
            <input
              placeholder="חפשי ירקות טריים, בשר grass-fed..."
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontFamily: 'DM Sans', fontSize: 15,
                background: 'transparent', direction: 'rtl',
              }}
            />
            <button style={{
              background: '#2e6853', color: 'white',
              border: 'none', borderRadius: 50,
              padding: '12px 24px', cursor: 'pointer',
              fontFamily: 'DM Sans', fontSize: 14,
            }}>
              חפשי
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{
          position: 'absolute', bottom: 32,
          left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.6)',
        }}
      >
        ↓
      </motion.div>
    </section>
  )
}
```

---

## 4. Sticky Scroll Section — "איך זה עובד" (כמו superpower)

```jsx
// components/HowItWorks.jsx
'use client'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

const STEPS = [
  { num: '01', title: 'גלי בתי עסק', desc: 'חפשי לפי קטגוריה, עיר, או גרירה על המפה', emoji: '🗺️' },
  { num: '02', title: 'צרי קשר ישיר', desc: 'לחצי WhatsApp ודברי ישירות עם הבעלים', emoji: '💬' },
  { num: '03', title: 'קני מקומי', desc: 'אסופי עצמאית או בקשי משלוח', emoji: '🛒' },
]

export default function HowItWorks() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end']
  })

  return (
    <section ref={containerRef} style={{ height: '300vh', position: 'relative' }}>
      <div style={{
        position: 'sticky', top: 0,
        height: '100vh', overflow: 'hidden',
        display: 'flex', alignItems: 'center',
        background: '#F5F0E8',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px', width: '100%' }}>
          <h2 style={{
            fontFamily: 'Frank Ruhl Libre',
            fontSize: 'clamp(32px, 5vw, 56px)',
            color: '#1C1A17', textAlign: 'center',
            marginBottom: 64,
          }}>
            איך זה עובד?
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
            {STEPS.map((step, i) => {
              const start = i / STEPS.length
              const end = (i + 1) / STEPS.length
              const opacity = useTransform(scrollYProgress, [start, start + 0.1, end - 0.1, end], [0.3, 1, 1, 0.3])
              const y = useTransform(scrollYProgress, [start, start + 0.15], [24, 0])

              return (
                <motion.div key={step.num} style={{ opacity, y, textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>{step.emoji}</div>
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 12,
                    color: '#2e6853', letterSpacing: '0.15em',
                    textTransform: 'uppercase', marginBottom: 8,
                  }}>
                    {step.num}
                  </div>
                  <h3 style={{
                    fontFamily: 'Frank Ruhl Libre', fontSize: 24,
                    color: '#1C1A17', marginBottom: 12,
                  }}>
                    {step.title}
                  </h3>
                  <p style={{ fontFamily: 'DM Sans', color: '#6b6b6b', lineHeight: 1.6 }}>
                    {step.desc}
                  </p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
```

---

## 5. כניסה — AuthKit Style (dark mode + animation)

```jsx
// app/login/page.jsx
'use client'
import { motion } from 'framer-motion'

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f0f',  // dark כמו authkit
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute',
        top: '20%', left: '30%',
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(46,104,83,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Left panel — תמונה + תוכן */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 48,
      }}>
        <motion.div
          initial={{ opacity: 0, x: -32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 40, color: 'white', marginBottom: 16 }}>
            מהמקור
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, lineHeight: 1.6, maxWidth: 360 }}>
            "מצאתי ספק grass-fed ממש ליד הבית תוך 5 דקות"
          </p>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, marginTop: 12 }}>
            — שרה, תל אביב
          </p>
        </motion.div>
      </div>

      {/* Right panel — טופס */}
      <div style={{
        width: 480, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        padding: 48,
      }}>
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '40px 36px',
            width: '100%',
          }}
        >
          <h2 style={{
            fontFamily: 'Frank Ruhl Libre', fontSize: 28,
            color: 'white', marginBottom: 8,
          }}>
            כניסה
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 32 }}>
            ברוכה הבאה חזרה 🌿
          </p>

          {/* Social buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <SocialButton icon="google" label="המשך עם Google" />
            <SocialButton icon="apple" label="המשך עם Apple" dark />
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>או</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>

          {/* Form */}
          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DarkInput placeholder="אימייל" type="email" />
            <DarkInput placeholder="סיסמה" type="password" />
            <motion.button
              whileHover={{ opacity: 0.9 }}
              whileTap={{ scale: 0.98 }}
              style={{
                background: '#2e6853', color: 'white',
                border: 'none', borderRadius: 10,
                padding: '14px', fontSize: 15,
                fontFamily: 'DM Sans', cursor: 'pointer',
                marginTop: 4,
              }}
            >
              כניסה
            </motion.button>
          </form>

          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>
            אין חשבון?{' '}
            <a href="/register" style={{ color: '#4cb08b', textDecoration: 'none' }}>
              הצטרפי
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

function DarkInput({ placeholder, type }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, padding: '13px 16px',
        color: 'white', fontSize: 15,
        fontFamily: 'DM Sans', outline: 'none',
        direction: 'rtl',
      }}
      onFocus={e => e.target.style.borderColor = 'rgba(46,176,139,0.5)'}
      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
    />
  )
}
```

---

## 6. אייקונים — Phosphor (החלף את הכל)

```jsx
// החלף בכל הפרויקט:
import {
  // ניווט
  House, MapTrifold, Calendar, Basket, Heart, UserCircle,
  // קשר
  WhatsappLogo, Phone, InstagramLogo, Globe,
  // עסק
  MapPin, Clock, Truck, Leaf, Seal, Certificate,
  // פעולות
  MagnifyingGlass, FunnelSimple, ArrowRight,
  Plus, Check, X, Warning, Star,
} from '@phosphor-icons/react'

// תמיד עם weight="duotone" לאפקט יפה:
<MapPin size={20} weight="duotone" color="#2e6853" />
<WhatsappLogo size={24} weight="duotone" color="#25D366" />
<Star size={16} weight="fill" color="#F0C040" />
<Leaf size={18} weight="duotone" color="#2e6853" />
```

---

## 7. כרטיסיות — Stagger Animation (כמו koa-foundations)

```jsx
// components/ProducersGrid.jsx
import { motion } from 'framer-motion'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } }
}
const item = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }
}

export default function ProducersGrid({ producers }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 24,
      }}
    >
      {producers.map(p => (
        <motion.div key={p.id} variants={item}>
          <ProducerCard producer={p} />
        </motion.div>
      ))}
    </motion.div>
  )
}
```

---

## 8. Page Transitions

```jsx
// components/PageTransition.jsx
'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'

export default function PageTransition({ children }) {
  const pathname = usePathname()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

---

## 9. Parallax Image Divider (בין סקציות)

```jsx
// components/ParallaxDivider.jsx
'use client'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

export default function ParallaxDivider({ image, quote }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['-15%', '15%'])

  return (
    <div ref={ref} style={{ height: 420, overflow: 'hidden', position: 'relative' }}>
      <motion.div style={{
        position: 'absolute', inset: '-20%',
        backgroundImage: `url(${image})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        y,
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(46,74,46,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          style={{
            fontFamily: 'Frank Ruhl Libre',
            fontSize: 'clamp(24px, 4vw, 44px)',
            color: 'white', textAlign: 'center',
            maxWidth: 700, padding: '0 24px',
            fontStyle: 'italic',
          }}
        >
          "{quote}"
        </motion.p>
      </div>
    </div>
  )
}

// שימוש בדף הבית:
<ParallaxDivider
  image="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600"
  quote="כשאתה יודע מאיפה האוכל שלך — הכל טועם אחרת"
/>
```

---

## 10. מבנה דף הבית הסופי

```jsx
// app/page.jsx
export default function HomePage() {
  return (
    <>
      <HeroSection />            {/* 100vh + parallax */}
      <SocialProofBar />         {/* #2e6853 */}
      <CategoryGrid />           {/* 6 קטגוריות */}
      <ProducersSection />       {/* 8 כרטיסיות + stagger */}
      <ParallaxDivider          {/* ציטוט */}
        image="..."
        quote="כשאתה יודע מאיפה האוכל שלך — הכל טועם אחרת"
      />
      <NeighborSection />        {/* מהמטבח של השכן — #2E4A2E */}
      <HowItWorks />             {/* sticky scroll */}
      <EventsPreview />          {/* 3 אירועים קרובים */}
      <CTASection />             {/* "הוסיפי את העסק שלך" */}
    </>
  )
}
```

---

## אחרי הכל

```bash
/audit
/polish homepage
/polish login
/polish navbar
/normalize
/critique
```

---

## עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
- Smooth scroll: Lenis
- אנימציות: framer-motion — parallax hero, sticky HowItWorks, stagger cards, page transitions
- Navbar: transparent→blur+solid on scroll
- Login: dark mode split layout (authkit style)
- אייקונים: @phosphor-icons/react weight="duotone"
- ParallaxDivider component בין סקציות
- מבנה דף הבית: Hero→Bar→Categories→Producers→Divider→Neighbor→HowItWorks→Events→CTA
```
