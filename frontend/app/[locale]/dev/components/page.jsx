"use client";

import { notFound } from "next/navigation";
import { MagnifyingGlass, Heart, ArrowRight, Leaf } from "@phosphor-icons/react";
import { Button, Input, Card, Badge, Heading, Link } from "@/components/ui";

/**
 * /dev/components — Storybook-style gallery for the MEH-602 atomic layer.
 *
 * DEV-GATED: returns 404 in production (`process.env.NODE_ENV === "production"`).
 * Not linked from anywhere — reachable only by typing the URL in dev/preview.
 * This page exists to eyeball every variant in one place; it is NOT shipped UI.
 */

const BUTTON_VARIANTS = ["primary", "secondary", "outlined", "ghost", "text"];
const BUTTON_SIZES = ["sm", "md", "lg"];
const BADGE_VARIANTS = ["primary", "accent", "secondary", "muted"];
const HEADING_VARIANTS = ["editorial", "hero", "sans"];
const LINK_VARIANTS = ["default", "muted", "accent", "nav"];

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-4 border-b border-border pb-10">
      <Heading level={2} variant="sans" className="text-headline-md">
        {title}
      </Heading>
      {children}
    </section>
  );
}

function Swatch({ label, children }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-[11px] uppercase tracking-[0.15em] text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

export default function DevComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-12 flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <Heading level={1} variant="hero">
          Atomic components
        </Heading>
        <p className="text-body-md text-fg-muted">
          MEH-602 · גלריית וריאנטים — דף פיתוח בלבד (404 ב-production)
        </p>
      </header>

      <Section title="Button">
        <div className="flex flex-col gap-6">
          {BUTTON_SIZES.map((size) => (
            <Swatch key={size} label={`size: ${size}`}>
              <div className="flex flex-wrap items-center gap-3">
                {BUTTON_VARIANTS.map((variant) => (
                  <Button key={variant} variant={variant} size={size}>
                    {variant}
                  </Button>
                ))}
              </div>
            </Swatch>
          ))}
          <Swatch label="states + icon slots">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" leadingIcon={<MagnifyingGlass size={18} weight="bold" />}>
                חיפוש
              </Button>
              {/* Directional glyph pre-mirrored for RTL via scale-x — see Button JSDoc. */}
              <Button
                variant="outlined"
                trailingIcon={<ArrowRight size={18} weight="bold" className="scale-x-[-1]" />}
              >
                המשך
              </Button>
              <Button variant="primary" disabled>
                disabled
              </Button>
              <Button variant="primary" loading>
                שמירה
              </Button>
            </div>
          </Swatch>
        </div>
      </Section>

      <Section title="Input">
        <div className="grid gap-5 sm:grid-cols-2 max-w-[640px]">
          <Input type="text" label="שם" placeholder="שם מלא" helperText="כפי שיופיע בפרופיל" />
          <Input type="email" label="אימייל" placeholder="you@example.com" />
          <Input type="search" label="חיפוש" placeholder="מה בא לך לאכול?" />
          <Input type="text" label="שדה שגוי" defaultValue="??" error="יש להזין לפחות 3 אותיות" />
          <Input type="text" label="מושבת" placeholder="לא ניתן לעריכה" disabled />
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-col gap-6">
          <Swatch label="variants (size: md)">
            <div className="flex flex-wrap items-center gap-2">
              {BADGE_VARIANTS.map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </div>
          </Swatch>
          <Swatch label="size: sm + tooltip">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary" size="sm">
                מאומת
              </Badge>
              <Badge variant="muted" size="sm" tooltip="בית העסק מחזיק בתעודת אורגני בתוקף.">
                אורגני
              </Badge>
            </div>
          </Swatch>
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { variant: "default", active: false, label: "default" },
            { variant: "flat", active: false, label: "flat" },
            { variant: "default", active: true, label: "active" },
          ].map((c) => (
            <Card
              key={c.label}
              variant={c.variant}
              active={c.active}
              href="/dev/components"
              media={
                <div className="relative w-full aspect-[4/3] bg-background flex items-center justify-center">
                  <Leaf size={36} weight="light" className="text-primary/70" aria-hidden="true" />
                </div>
              }
              overlay={
                <div className="absolute bottom-3 start-3 z-[2]">
                  <Badge variant="primary" size="sm">
                    {c.label}
                  </Badge>
                </div>
              }
              footer={
                <>
                  <span className="text-sm font-semibold text-accent">₪45</span>
                  <Heart size={18} weight="regular" className="text-primary" aria-hidden="true" />
                </>
              }
            >
              <p className="text-[11px] uppercase tracking-[0.15em] text-fg-muted">קטגוריה</p>
              <Heading level={3} variant="editorial" className="text-[20px] hover:text-primary">
                שם בית העסק
              </Heading>
              <p className="text-sm text-text/85 line-clamp-1">תיאור קצר של מה שהעסק מציע.</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Heading">
        <div className="flex flex-col gap-4">
          {HEADING_VARIANTS.map((variant) => (
            <Swatch key={variant} label={`variant: ${variant}`}>
              <Heading level={2} variant={variant}>
                מהמקור — טעם של בית
              </Heading>
            </Swatch>
          ))}
        </div>
      </Section>

      <Section title="Link">
        <div className="flex flex-wrap items-center gap-6">
          {LINK_VARIANTS.map((variant) => (
            <Link
              key={variant}
              href="/dev/components"
              variant={variant}
              active={variant === "nav"}
            >
              {variant}
            </Link>
          ))}
        </div>
      </Section>
    </main>
  );
}
