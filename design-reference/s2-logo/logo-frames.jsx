// logo-frames.jsx — MEH-637 Phase 2 v4
// Direction A pivoted to full Hebrew wordmark with actual letterform mods:
//   A1 · Two Different Mems  — true per-letter transforms (no two mems the same)
//   A2 · Stroke Ligature     — SVG stroke physically connects ה+מ
//   A3 · Stylistic Alternates— extended bent ר tail + extended ק descender
//   A4 · Custom Serif Termin.— rounded ink pads at specific terminals
// B, C, D unchanged from v2 (per Sapir's "keep B / keep C / D archived").
// App-icon strategy reversed per m0043: wordmark primary, single-מ favicon-source.
// Honest constraint: SVG overlays on rendered text, not real OpenType. Sketch
// fidelity, not production glyphs.

const PAL = {
  primary: '#2E6853', primaryDark: '#2E4A2E',
  bg: '#F5F0E8', warm: '#FFFEFB',
  text: '#1C1A17', muted: '#5c584f',
  accent: '#8B6914', border: '#e8e0d0',
  fail: '#8a1a1a',
};
const FONT = {
  head: '"Frank Ruhl Libre", "Heebo", Georgia, serif',
  body: '"DM Sans", "Heebo", system-ui, sans-serif',
  en: '"Cormorant Garamond", Georgia, serif',
  script: '"Caveat", "Frank Ruhl Libre", cursive',
};

// ─────────────────────────────────────────────────────────────
// Wordmark — מהמקור with per-letter spans + overlay slot
// Each letter is an inline-block with position:relative so absolutely-
// positioned children (overlays) follow the letter's box. Variants:
//   plain        — pure Frank Ruhl 900, the reference
//   twoMems      — first מ scaleY(0.82); second מ scaleX(1.22)
//   ligature     — SVG stroke from ה to second מ at the top bar
//   styleAlt     — extended ר tail + extended ק descender
//   customSerif  — rounded ink pads at top-left of ה + top-right of ר
// ─────────────────────────────────────────────────────────────

function Letter({ char, size, ink, transform, origin = 'center center', children }) {
  return (
    <span style={{
      fontFamily: FONT.head, fontWeight: 900, fontSize: size, color: ink,
      lineHeight: 1, display: 'inline-block', position: 'relative',
      transform: transform, transformOrigin: origin,
      verticalAlign: 'baseline',
    }}>{char}{children}</span>
  );
}

function Wordmark({ size = 140, ink = PAL.primary, variant = 'plain' }) {
  const mem1Style = variant === 'twoMems'
    ? { transform: 'scaleY(0.72)', origin: 'center 70%' } : {};
  const mem2Style = variant === 'twoMems'
    ? { transform: 'scaleX(1.32)', origin: 'center' } : {};

  // Stylistic-alternate overlays (A3)
  const reshTail = variant === 'styleAlt' && (
    <span style={{
      position: 'absolute',
      bottom: size * 0.06,
      right: '95%',
      width: size * 0.6,
      height: size * 0.07,
      background: ink,
      transform: 'rotate(8deg)',
      transformOrigin: 'right top',
      borderRadius: size * 0.03,
    }} />
  );
  const qofDescender = variant === 'styleAlt' && (
    <span style={{
      position: 'absolute',
      top: '78%',
      left: '34%',
      width: size * 0.07,
      height: size * 0.42,
      background: ink,
      borderBottomLeftRadius: size * 0.03,
      borderBottomRightRadius: size * 0.03,
    }} />
  );

  // Custom-serif overlays (A4) — rounded ink pads attached to specific terminals
  const heTopLeftPad = variant === 'customSerif' && (
    <span style={{
      position: 'absolute',
      top: size * 0.20,
      right: '88%',
      width: size * 0.14,
      height: size * 0.08,
      background: ink,
      borderRadius: size * 0.05,
    }} />
  );
  const reshTopRightPad = variant === 'customSerif' && (
    <span style={{
      position: 'absolute',
      top: size * 0.20,
      left: '85%',
      width: size * 0.14,
      height: size * 0.08,
      background: ink,
      borderRadius: size * 0.05,
    }} />
  );
  const vavBottomPad = variant === 'customSerif' && (
    <span style={{
      position: 'absolute',
      bottom: size * 0.18,
      left: '20%',
      width: size * 0.12,
      height: size * 0.045,
      background: ink,
    }} />
  );

  return (
    <div lang="he" dir="rtl" style={{
      position: 'relative', display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      <Letter char="מ" size={size} ink={ink} transform={mem1Style.transform} origin={mem1Style.origin} />
      <Letter char="ה" size={size} ink={ink}>{heTopLeftPad}</Letter>
      <Letter char="מ" size={size} ink={ink} transform={mem2Style.transform} origin={mem2Style.origin} />
      <Letter char="ק" size={size} ink={ink}>{qofDescender}</Letter>
      <Letter char="ו" size={size} ink={ink}>{vavBottomPad}</Letter>
      <Letter char="ר" size={size} ink={ink}>{reshTail}{reshTopRightPad}</Letter>

      {/* Ligature (A2) — overlay bridging ה and second מ at the top bar.
          Hand-positioned via the wordmark's own bounding box. */}
      {variant === 'ligature' && (
        <span style={{
          position: 'absolute',
          top: size * 0.20,
          right: '30%',
          width: '22%',
          height: size * 0.085,
          background: ink,
        }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Single-letter monogram (kept for B, C, favicon source, etc.)
// ─────────────────────────────────────────────────────────────

function Mem({ size = 320, ink = PAL.primary }) {
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <span style={{
        fontFamily: FONT.head, fontWeight: 900, fontSize: size * 0.98, color: ink, lineHeight: 1,
      }}>מ</span>
    </div>
  );
}

function MonoC1({ size = 320, ink = PAL.primary }) {
  const inset = size * 0.13;
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: inset, border: `2px solid ${ink}`, background: 'transparent' }} />
      <span style={{ fontFamily: FONT.head, fontWeight: 900, fontSize: size * 0.74, color: ink, lineHeight: 1 }}>מ</span>
    </div>
  );
}

function MonoC2({ size = 320, ink = PAL.primary }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: FONT.head, fontWeight: 900, fontSize: size * 0.95, color: ink, lineHeight: 1 }}>מ</span>
      <div style={{ position: 'absolute', bottom: size * 0.04, left: size * 0.18, width: size * 0.27, height: 1.5, background: ink }} />
      <div style={{ position: 'absolute', bottom: size * 0.04, left: size * 0.5,  width: size * 0.16, height: 1.5, background: ink }} />
    </div>
  );
}

function MonoD1({ size = 320, ink = PAL.primary }) {
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{
        fontFamily: FONT.script, fontWeight: 600, fontSize: size * 1.05, color: ink, lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>m</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Lockup pieces
// ─────────────────────────────────────────────────────────────

function LatinSecondary({ size = 13, ink = PAL.muted, tracking = '0.22em' }) {
  return (
    <span style={{
      fontFamily: FONT.body, fontWeight: 500, fontSize: size, color: ink,
      letterSpacing: tracking, textTransform: 'uppercase',
    }}>Mehamakor</span>
  );
}

function HebrewWord({ size = 56, ink = PAL.primary, weight = 700 }) {
  return (
    <span lang="he" dir="rtl" style={{
      fontFamily: FONT.head, fontWeight: weight, fontSize: size, color: ink,
      lineHeight: 1.05, letterSpacing: 0,
    }}>מהמקור</span>
  );
}

function LockupA({ variant, ink = PAL.primary }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <Wordmark size={56} ink={ink} variant={variant} />
      <LatinSecondary size={12} ink={PAL.muted} />
    </div>
  );
}

function LockupB1({ ink = PAL.primary }) {
  return (
    <div dir="rtl" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <HebrewWord size={56} ink={ink} />
      <span style={{ width: 8, height: 8, borderRadius: 4, background: ink, display: 'inline-block' }} />
      <LatinSecondary size={14} ink={ink} tracking="0.2em" />
    </div>
  );
}

function LockupB2({ ink = PAL.primary }) {
  return (
    <div dir="rtl" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <HebrewWord size={56} ink={ink} />
      <span style={{ width: 1, height: 34, background: ink, display: 'inline-block', opacity: 0.85 }} />
      <LatinSecondary size={14} ink={ink} tracking="0.2em" />
    </div>
  );
}

function LockupC1({ ink = PAL.primary }) {
  return (
    <div dir="rtl" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 26, height: 26, border: `1.5px solid ${ink}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{ fontFamily: FONT.head, fontWeight: 900, fontSize: 22, color: ink, lineHeight: 1 }}>מ</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <HebrewWord size={48} ink={ink} />
        <LatinSecondary size={11} ink={ink} tracking="0.2em" />
      </div>
    </div>
  );
}

function LockupC2({ ink = PAL.primary }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 36, height: 1.5, background: ink }} />
        <div style={{ width: 18, height: 1.5, background: ink }} />
      </div>
      <HebrewWord size={56} ink={ink} />
      <LatinSecondary size={12} ink={ink} tracking="0.22em" />
    </div>
  );
}

function LockupD1({ ink = PAL.primary }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <span lang="he" dir="rtl" style={{
        fontFamily: FONT.head, fontWeight: 500, fontStyle: 'italic',
        fontSize: 52, color: ink, lineHeight: 1.05,
      }}>מהמקור</span>
      <span style={{
        fontFamily: FONT.script, fontWeight: 600, fontSize: 36, color: ink, lineHeight: 1,
      }}>Mehamakor</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Favicon row + inverse swatch
// ─────────────────────────────────────────────────────────────

function FaviconRow({ Mono = Mem, monoProps = {} }) {
  const sizes = [16, 32, 48];
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
      {sizes.map((px) => (
        <div key={px} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: px, height: px, background: PAL.warm,
            border: `1px solid ${PAL.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <Mono size={px} ink={PAL.primary} {...monoProps} />
          </div>
          <span className="numeric" style={{ fontFamily: FONT.body, fontSize: 9, color: PAL.muted, letterSpacing: '0.1em' }}>{px}</span>
        </div>
      ))}
    </div>
  );
}

function InverseWordmarkSwatch({ variant, w = 220, h = 60 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: w, height: h, background: PAL.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Wordmark size={28} ink={PAL.warm} variant={variant} />
      </div>
      <span className="numeric" style={{ fontFamily: FONT.body, fontSize: 9, color: PAL.muted, letterSpacing: '0.1em' }}>INVERSE</span>
    </div>
  );
}

function InverseMonoSwatch({ Mono = Mem, monoProps = {}, size = 56 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: size, height: size, background: PAL.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Mono size={size * 0.92} ink={PAL.warm} {...monoProps} />
      </div>
      <span className="numeric" style={{ fontFamily: FONT.body, fontSize: 9, color: PAL.muted, letterSpacing: '0.1em' }}>INV</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// App-icon strategy: wordmark PRIMARY, single-מ favicon-source SECONDARY
// ─────────────────────────────────────────────────────────────

function AppIconPrimary({ variant, size = 110 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: size, height: size, background: PAL.primary,
        borderRadius: size * 0.22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        padding: '0 8px',
      }}>
        <Wordmark size={size * 0.25} ink={PAL.warm} variant={variant} />
      </div>
      <div style={{
        fontFamily: FONT.body, fontSize: 10, color: PAL.primary,
        letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
      }}>Primary · Wordmark</div>
      <div style={{
        fontFamily: FONT.en, fontStyle: 'italic', fontSize: 11, color: PAL.muted,
      }}><span className="numeric">1024×1024</span></div>
    </div>
  );
}

function AppIconSecondary({ size = 78 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: size, height: size, background: PAL.primary,
        borderRadius: size * 0.22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: FONT.head, fontWeight: 900, fontSize: size * 0.62,
          color: PAL.warm, lineHeight: 1,
        }}>מ</span>
      </div>
      <div style={{
        fontFamily: FONT.body, fontSize: 10, color: PAL.muted,
        letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600,
      }}>Favicon-source · <span style={{ fontFamily: FONT.head, fontStyle: 'normal' }} lang="he" dir="rtl">מ</span></div>
      <div style={{
        fontFamily: FONT.en, fontStyle: 'italic', fontSize: 11, color: PAL.muted,
      }}><span className="numeric">16 / 32 / 48</span></div>
    </div>
  );
}

function AppIconRow({ variant }) {
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', justifyContent: 'flex-start' }}>
      <AppIconPrimary variant={variant} />
      <AppIconSecondary />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Gate display
// ─────────────────────────────────────────────────────────────

function GateStatus({ gates }) {
  const colors = {
    pass: { fg: PAL.primary, dot: PAL.primary },
    risk: { fg: PAL.accent,  dot: PAL.accent  },
    fail: { fg: PAL.fail,    dot: PAL.fail    },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {gates.map((g) => {
        const c = colors[g.state];
        return (
          <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, lineHeight: 1.4 }}>
            <span style={{
              fontFamily: FONT.body, fontWeight: 600, fontSize: 10, letterSpacing: '0.12em',
              color: c.fg, width: 30, flexShrink: 0,
            }}>{g.id}</span>
            <span style={{ flex: 1, fontFamily: FONT.en, fontStyle: 'italic', fontSize: 13, color: PAL.muted, lineHeight: 1.35 }}>
              <span style={{
                display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                background: c.dot, marginRight: 6, transform: 'translateY(-2px)',
              }} />{g.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ArtboardShell — two flavours: 'wordmark' (A) and 'mono' (B/C/D)
// ─────────────────────────────────────────────────────────────

function ArtboardShell({
  id, dir, name, signature, signaturePull,
  hero, lockup,
  appIcons,          // { variant } for wordmark direction
  faviconMono = Mem, monoProps = {},
  inverse,           // 'wordmark' or 'mono'
  variant,           // wordmark variant for inverse-wordmark
  gates, archivedNote,
}) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: PAL.bg,
      padding: '36px 40px 28px',
      display: 'flex', flexDirection: 'column',
      fontFamily: FONT.body, color: PAL.text,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* TOP — id + direction tag */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 10, borderBottom: `1px solid ${PAL.border}`, marginBottom: 14 }}>
        <span className="numeric" style={{
          fontFamily: FONT.body, fontSize: 11, fontWeight: 600, color: PAL.text,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>{id}</span>
        <span style={{
          fontFamily: FONT.body, fontSize: 10, fontWeight: 500, color: PAL.muted,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>{dir}</span>
      </div>

      {/* TITLE + signature */}
      <div style={{ marginBottom: 10 }}>
        <h2 style={{
          fontFamily: FONT.head, fontWeight: 700, fontSize: 26, lineHeight: 1.1,
          color: PAL.primaryDark, letterSpacing: '-0.005em', marginBottom: 4,
        }}>{name}</h2>
        <p style={{
          fontFamily: FONT.en, fontStyle: 'italic', fontSize: 14, lineHeight: 1.5,
          color: PAL.muted, maxWidth: '50ch',
        }}>{signature}</p>
      </div>

      {/* HERO */}
      <div style={{
        flex: '0 0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '14px 0 12px',
      }}>{hero}</div>

      {signaturePull && (
        <div style={{
          textAlign: 'center', marginBottom: 10,
          fontFamily: FONT.body, fontSize: 10, fontWeight: 600, color: PAL.accent,
          letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>{signaturePull}</div>
      )}

      {/* LOCKUP */}
      <div style={{
        borderTop: `1px solid ${PAL.border}`,
        borderBottom: `1px solid ${PAL.border}`,
        padding: '16px 0',
        marginBottom: appIcons ? 8 : 12,
        display: 'flex', justifyContent: 'center',
      }}>{lockup}</div>

      {/* APP ICON ROW (Direction A only — wordmark primary, מ secondary) */}
      {appIcons && (
        <div style={{ marginBottom: 12, borderBottom: `1px solid ${PAL.border}`, paddingBottom: 14 }}>
          <div style={{
            fontFamily: FONT.body, fontSize: 9, fontWeight: 600, letterSpacing: '0.18em',
            color: PAL.muted, textTransform: 'uppercase', marginBottom: 10,
          }}>App icon strategy · pre-launch reversal of Q7</div>
          <AppIconRow variant={appIcons.variant} />
        </div>
      )}

      {/* FOOTER */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <div className="numeric" style={{
            fontFamily: FONT.body, fontSize: 9, fontWeight: 600, letterSpacing: '0.18em',
            color: PAL.muted, textTransform: 'uppercase', marginBottom: 8,
          }}>Favicon · 16 / 32 / 48</div>
          <FaviconRow Mono={faviconMono} monoProps={monoProps} />
        </div>
        <div>
          <div style={{
            fontFamily: FONT.body, fontSize: 9, fontWeight: 600, letterSpacing: '0.18em',
            color: PAL.muted, textTransform: 'uppercase', marginBottom: 8,
          }}>Inverse</div>
          {inverse === 'wordmark'
            ? <InverseWordmarkSwatch variant={variant} />
            : <InverseMonoSwatch Mono={faviconMono} monoProps={monoProps} />}
        </div>
        <div>
          <div style={{
            fontFamily: FONT.body, fontSize: 9, fontWeight: 600, letterSpacing: '0.18em',
            color: PAL.muted, textTransform: 'uppercase', marginBottom: 8,
          }}>Gates</div>
          <GateStatus gates={gates} />
        </div>
      </div>

      {archivedNote && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          border: `1px solid ${PAL.fail}`,
          fontFamily: FONT.en, fontStyle: 'italic', fontSize: 12.5, color: PAL.fail,
          lineHeight: 1.4,
        }}>
          <strong style={{ fontFamily: FONT.body, fontStyle: 'normal', fontWeight: 700, letterSpacing: '0.12em', fontSize: 10, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Archive gate</strong>
          {archivedNote}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Direction A · v4 wordmark explorations
// Each is a full מהמקור wordmark with one specific letterform modification.
// Naive-viewer test: place next to default Frank Ruhl 900 — must find at
// least one shape difference (not spacing).
// ─────────────────────────────────────────────────────────────

function A1() {
  return (
    <ArtboardShell
      id="A1 · 01 / 09 · v4"
      dir="Direction A · Wordmark · Contextual alternates"
      name="Two Different Mems"
      signature="The two מ glyphs in מהמקור are not the same shape. First מ vertically compressed (scaleY 0.72); second מ horizontally extended (scaleX 1.32). The eye registers the asymmetry as deliberate — the wordmark has rhythm where Frank Ruhl default has only repetition."
      signaturePull="First מ compressed 28% · second מ extended 32% · contextual asymmetry"
      hero={<Wordmark size={120} variant="twoMems" />}
      lockup={<LockupA variant="twoMems" />}
      appIcons={{ variant: 'twoMems' }}
      inverse="wordmark" variant="twoMems"
      gates={[
        { id: 'G2', text: 'Wordmark vs IMG-4759 single-letter-script: structurally separate.', state: 'pass' },
        { id: 'G9', text: 'Hebrew-native: contextual-alternate logic borrowed from Hebrew newspaper mastheads (Haaretz, טבע).', state: 'pass' },
        { id: 'Q4', text: 'Cereal-Time category: block-set wordmark, no script.', state: 'pass' },
        { id: 'Q15', text: 'Type with intent: two-mem asymmetry is one un-substitutable move.', state: 'pass' },
        { id: 'Q16', text: 'WhatsApp profile (Q16 primary surface): wordmark holds.', state: 'pass' },
      ]}
    />
  );
}

function A2() {
  return (
    <ArtboardShell
      id="A2 · 02 / 09 · v4"
      dir="Direction A · Wordmark · Custom ligature"
      name="The Stroke Ligature"
      signature="A custom ligature physically connects ה and the second מ across their top bars — letters touch, not just sit adjacent. Hebrew display tradition (Hen Macabi lettering, טבע masthead). The connection is the signature."
      signaturePull="ה + מ ligature · top-bar stroke merge"
      hero={<Wordmark size={120} variant="ligature" />}
      lockup={<LockupA variant="ligature" />}
      appIcons={{ variant: 'ligature' }}
      inverse="wordmark" variant="ligature"
      gates={[
        { id: 'G2', text: 'Ligature is within the wordmark; no echo of IMG-4759 dot-above placement.', state: 'pass' },
        { id: 'G9', text: 'Hebrew-native: ligatures are a Hebrew display tradition (Hen Macabi, טבע).', state: 'pass' },
        { id: 'Q4', text: 'Cereal-Time category: block ligature, not handlettered script.', state: 'pass' },
        { id: 'Risk', text: 'Ligature is hand-positioned overlay in this sketch; production needs custom font glyph.', state: 'risk' },
        { id: 'Q16', text: 'WhatsApp at small size: ligature reads as a thickening; survives well.', state: 'pass' },
      ]}
    />
  );
}

function A3() {
  return (
    <ArtboardShell
      id="A3 · 03 / 09 · v4"
      dir="Direction A · Wordmark · Stylistic alternates"
      name="The Extended Tail"
      signature="The ר carries an extended bent tail sweeping left below baseline; the ק receives a longer descender. Stylistic-alternate glyphs in the Oded Ezer / Michal Sahar tradition. Two letters carry the personality; the others stay quiet."
      signaturePull="ר extended bent tail · ק deeper descender"
      hero={<Wordmark size={120} variant="styleAlt" />}
      lockup={<LockupA variant="styleAlt" />}
      appIcons={{ variant: 'styleAlt' }}
      inverse="wordmark" variant="styleAlt"
      gates={[
        { id: 'G2', text: 'Wordmark with custom terminals — no structural echo of IMG-4759.', state: 'pass' },
        { id: 'G9', text: 'Hebrew-native: ק descender is sofit-tradition; ר tail extends an existing terminal, not adds a foreign one.', state: 'pass' },
        { id: 'Q4', text: 'Cereal-Time category risk: ר tail must stay restrained — close to flourish. Watch this.', state: 'risk' },
        { id: 'Q15', text: 'Type with intent: deliberate, two-letter personality.', state: 'pass' },
        { id: 'Risk', text: 'Custom terminals are SVG overlays here; production needs glyph redraw.', state: 'risk' },
      ]}
    />
  );
}

function A4() {
  return (
    <ArtboardShell
      id="A4 · 04 / 09 · v4"
      dir="Direction A · Wordmark · Custom serif terminations"
      name="The Reshaped Serifs"
      signature="Three terminals carry custom rounded ink pads: top-left of ה, top-right of ר, and the vav foot. Frank Ruhl's existing serifs are reshaped from squared to rounded — softens the magazine register without losing authority."
      signaturePull="Three rounded terminals · ה ר ו"
      hero={<Wordmark size={120} variant="customSerif" />}
      lockup={<LockupA variant="customSerif" />}
      appIcons={{ variant: 'customSerif' }}
      inverse="wordmark" variant="customSerif"
      gates={[
        { id: 'G2', text: 'Wordmark with terminal refinement; structurally unlike IMG-4759.', state: 'pass' },
        { id: 'G9', text: 'Hebrew-native: serif reshaping refines an existing Frank Ruhl feature, not foreign import.', state: 'pass' },
        { id: 'Q4', text: 'Cereal-Time category: terminals stay rounded-but-restrained, no flourish.', state: 'pass' },
        { id: 'Q15', text: 'Type with intent: three considered moves; pattern holds across the wordmark.', state: 'pass' },
        { id: 'Risk', text: 'Production needs the rounded terminals drawn into glyph outlines, not overlaid.', state: 'risk' },
      ]}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// B / C / D — unchanged from v2 per Sapir's "keep" direction
// ─────────────────────────────────────────────────────────────

function B1() {
  return (
    <ArtboardShell
      id="B1 · 05 / 09"
      dir="Direction B · Wordmark + punctuation"
      name="The Center Dot"
      signature="The dot promoted to identity — middle-dot punctuation bridges Hebrew and Latin in the lockup. Monogram is unaltered Frank Ruhl מ."
      signaturePull="Middle dot · bilingual bridge"
      hero={<Mem size={280} />}
      lockup={<LockupB1 />}
      faviconMono={Mem}
      inverse="mono"
      gates={[
        { id: 'G2', text: 'Dot lives in the lockup joint, not above the letter — clear of IMG-4759 placement.', state: 'pass' },
        { id: 'G9', text: 'Monogram is unaltered mem; the dot is a lockup device, not a letter modification.', state: 'pass' },
        { id: '16px', text: 'Favicon = plain mem. Letter survives cleanly.', state: 'pass' },
        { id: 'Q9', text: 'Gold-in-logo: dot stays green per Q9 lock.', state: 'pass' },
        { id: 'Note', text: 'In light of Direction A pivot: B explores the "no letterform mod, system device only" position.', state: 'risk' },
      ]}
    />
  );
}

function B2() {
  return (
    <ArtboardShell
      id="B2 · 06 / 09"
      dir="Direction B · Wordmark + punctuation"
      name="The Hairline"
      signature="A vertical hairline divides the bilingual lockup — editorial rule as identity. Monogram is unaltered Frank Ruhl מ; the hairline is a between-script device only."
      signaturePull="Vertical hairline · bilingual divide"
      hero={<Mem size={280} />}
      lockup={<LockupB2 />}
      faviconMono={Mem}
      inverse="mono"
      gates={[
        { id: 'G2', text: 'Hairline is editorial-table convention; no relation to IMG-4759 script.', state: 'pass' },
        { id: 'G9', text: 'Monogram unaltered; hairline is between-script.', state: 'pass' },
        { id: '16px', text: 'Favicon = plain mem; hairline absent at favicon scale.', state: 'pass' },
        { id: 'Q5', text: 'Welcoming: hairline is restrained, neither precious nor industrial.', state: 'pass' },
        { id: 'Note', text: 'Same caveat as B1 — Direction B does not modify letterforms.', state: 'risk' },
      ]}
    />
  );
}

function C1() {
  return (
    <ArtboardShell
      id="C1 · 07 / 09"
      dir="Direction C · Wordmark + editorial device"
      name="The Stamp"
      signature="A square ink-stamp frames the מ as a separate sigil from the wordmark — magazine cover convention. The letter is unaltered; signature lives in the frame around it."
      signaturePull="Square stamp · editorial seal"
      hero={<MonoC1 size={280} />}
      lockup={<LockupC1 />}
      faviconMono={MonoC1}
      inverse="mono"
      gates={[
        { id: 'G3', text: 'No botanical — purely geometric/typographic device.', state: 'pass' },
        { id: 'G9', text: 'Letter unaltered inside the frame — Hebrew-correctness preserved.', state: 'pass' },
        { id: '16px', text: 'Stamp + interior mem at 16px ≈ 6px frame — optical-collapse risk.', state: 'risk' },
        { id: 'Q5', text: 'Hadar: stamp reads as "official." Risk of reading bureaucratic to Michal.', state: 'risk' },
        { id: 'Q15', text: 'Type with intent: device, not letterform — different category.', state: 'pass' },
      ]}
    />
  );
}

function C2() {
  return (
    <ArtboardShell
      id="C2 · 08 / 09"
      dir="Direction C · Wordmark + editorial device"
      name="The Cut Rule"
      signature="A horizontal rule beneath the wordmark with a deliberate break — The Gentlewoman's broken-rule device, translated to Hebrew-led layout. The mem is unaltered; rule sits well below baseline."
      signaturePull="Broken rule · with intentional gap"
      hero={<MonoC2 size={280} />}
      lockup={<LockupC2 />}
      faviconMono={MonoC2}
      inverse="mono"
      gates={[
        { id: 'G3', text: 'Abstract editorial device, not botanical.', state: 'pass' },
        { id: 'G9', text: 'Letter unaltered; rule sits below baseline as separator, not as diacritic.', state: 'pass' },
        { id: '16px', text: 'Broken rule vanishes at favicon — degrades to plain מ.', state: 'risk' },
        { id: 'Q5', text: 'Welcoming: rule is quiet, editorial without being precious.', state: 'pass' },
        { id: 'Q15', text: 'Type with intent: device, not letterform.', state: 'pass' },
      ]}
    />
  );
}

function D1() {
  return (
    <ArtboardShell
      id="D1 · 09 / 09 · gated"
      dir="Direction D · Courtesy script"
      name="The Courtesy Script"
      signature="The single permitted D exploration. Latin in Caveat; Hebrew in Frank Ruhl italic — there is no Hebrew script that pairs with our locked stack. LOCK-tension proof, not a proposal."
      signaturePull="Script · Latin Caveat · Hebrew italic fallback"
      hero={<MonoD1 size={280} />}
      lockup={<LockupD1 />}
      faviconMono={MonoD1}
      inverse="mono"
      gates={[
        { id: 'G2', text: 'Script structurally similar to IMG-4759 register — close call.', state: 'risk' },
        { id: 'G9', text: 'Italic axis on Hebrew is forbidden — no italic tradition.', state: 'fail' },
        { id: 'Q4', text: 'Cereal-Time category proximity: HIGH. Caveat lands directly inside the rejected category.', state: 'fail' },
        { id: '16px', text: 'Caveat lowercase m collapses to noise at 16px.', state: 'fail' },
        { id: 'Q14', text: 'Gut: script reads as personal-brand / boutique — Sapir-confirmed wrong category.', state: 'fail' },
      ]}
      archivedNote="Four gate failures (G9, Q4, 16px, Q14). Logged and archived — not advanced to Phase 3."
    />
  );
}

Object.assign(window, { A1, A2, A3, A4, B1, B2, C1, C2, D1 });
