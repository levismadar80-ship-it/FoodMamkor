/**
 * Module:   golden/personas
 * Purpose:  The seven golden-path logins (anchor plan §C.1, MEH-2897), in the
 *           order the `golden` project walks them.
 * Does NOT: hold a password. Each persona names the EXISTING env secret its
 *           password comes from — no new secret exists for these accounts.
 * Related:  backend/scripts/seed_demo_business.py (GOLDEN_BUSINESSES,
 *           GOLDEN_CUSTOMER, GOLDEN_ADMIN — the seed that creates them, run
 *           with `--golden`) · tests/test_golden_personas_seed.py
 *           (`test_golden_personas_match_the_playwright_table` fails when this
 *           table and the seed's disagree on an email or its password env).
 * History:  MEH-2897 (creation).
 *
 * KEEP each entry's `email` and `passwordEnv` on adjacent lines, in that order:
 * the pytest guard reads them with one regex.
 *
 * C2 (a customer signing in with Google) is not here on purpose: automation
 * cannot complete a Google sign-in, so that persona stays a manual line in the
 * release checklist (anchor plan §C.4).
 */

export type PersonaKey = "g1" | "g2" | "g3" | "g4" | "g5" | "c1" | "a1";

export type Persona = {
  key: PersonaKey;
  email: string;
  passwordEnv:
    | "DEMO_OWNER_PASSWORD"
    | "DEMO_CONSUMER_PASSWORD"
    | "DEMO_ADMIN_PASSWORD";
  /** The app role `/auth/me` must report for this login. */
  role: "producer" | "consumer" | "admin";
  /** For a business persona: its slug and `kind`, as seeded. */
  slug?: string;
  kind?: "producer" | "organizer";
  /** One line: what the persona's spec walks. */
  walks: string;
};

export const PERSONAS: Record<PersonaKey, Persona> = {
  g1: {
    key: "g1",
    email: "golden-products@example.com",
    passwordEnv: "DEMO_OWNER_PASSWORD",
    role: "producer",
    slug: "golden-products",
    kind: "producer",
    walks:
      "catalogue (product create/edit/delete), insights, review link, group-buy lifecycle",
  },
  g2: {
    key: "g2",
    email: "golden-events@example.com",
    passwordEnv: "DEMO_OWNER_PASSWORD",
    role: "producer",
    slug: "golden-events",
    kind: "producer",
    walks:
      "events (create/delete), experiences and their sign-ups, the host dashboard",
  },
  g3: {
    key: "g3",
    email: "golden-organizer@example.com",
    passwordEnv: "DEMO_OWNER_PASSWORD",
    role: "producer",
    slug: "golden-organizer",
    kind: "organizer",
    walks:
      "organizer dashboard (no insights tab), markets, public organizer page, group buy refused",
  },
  g4: {
    key: "g4",
    email: "golden-rescue@example.com",
    passwordEnv: "DEMO_OWNER_PASSWORD",
    role: "producer",
    slug: "golden-rescue",
    kind: "producer",
    walks:
      "rescue bag: publish, a customer reserves and cancels, the business cancels the bag",
  },
  g5: {
    key: "g5",
    email: "golden-locations@example.com",
    passwordEnv: "DEMO_OWNER_PASSWORD",
    role: "producer",
    slug: "golden-locations",
    kind: "producer",
    walks:
      "several locations, approved kashrut badge with certificate, public page",
  },
  c1: {
    key: "c1",
    email: "golden-customer@example.com",
    passwordEnv: "DEMO_CONSUMER_PASSWORD",
    role: "consumer",
    walks:
      "favourite + alert settings, join and leave a group buy, review (admin hides/unhides)",
  },
  a1: {
    key: "a1",
    email: "golden-admin@example.com",
    passwordEnv: "DEMO_ADMIN_PASSWORD",
    role: "admin",
    walks:
      "admin home and queues, producers, group buys, kashrut, WhatsApp failures, reviews",
  },
};
