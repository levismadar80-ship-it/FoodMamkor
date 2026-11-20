/**
 * MEH-3485 — «המשלוח הבא»: the next delivery date.
 *
 * Examples pin the rule as posted; the property block checks it against a
 * brute-force oracle that walks real instants on a 15-minute grid and reads
 * the Israel calendar through its own Intl call — not through
 * israelNowParts / israelToday, so a shared bug cannot make both agree.
 * Hypothesis is backend-only (no fast-check here), so the property block is a
 * seeded random sweep: same seed, same cases, every run.
 */
import { describe, it, expect } from "vitest";
import { nextDeliveryDate } from "@/lib/nextDelivery";
import { DELIVERY_DAYS } from "@/lib/delivery-days";
import { ORDER_DAY_KEYS } from "@/lib/orderWindow";

// Israel 2026: summer time ends Sun 25/10 02:00, starts Fri 27/03 02:00.
const at = (iso) => new Date(iso);
const onlyDay = (dayIndex, close) => ({ [ORDER_DAY_KEYS[dayIndex]]: [{ open: "08:00", close }] });

describe("nextDeliveryDate — the rule", () => {
  it("no order window: the first delivery day from tomorrow, never today", () => {
    // Tue 24/11/2026 09:00 Israel; the business delivers Tuesday.
    const r = nextDeliveryDate({ days: ["שלישי"], now: at("2026-11-24T07:00:00Z") });
    expect(r).toEqual({ date: "2026-12-01", dayIndex: 2 });
  });

  it("no order window, several days: the nearest from tomorrow", () => {
    const r = nextDeliveryDate({ days: ["חמישי", "שני"], now: at("2026-11-24T07:00:00Z") });
    expect(r).toEqual({ date: "2026-11-26", dayIndex: 4 });
  });

  it("one cutoff, before it: the delivery after this week's cutoff", () => {
    // Orders until Monday 12:00, delivery Tuesday. Now Mon 23/11 11:59.
    const r = nextDeliveryDate({
      days: ["שלישי"],
      orderWindow: onlyDay(1, "12:00"),
      now: at("2026-11-23T09:59:00Z"),
    });
    expect(r?.date).toBe("2026-11-24");
  });

  it("one cutoff, at or after it: next week's run", () => {
    const shape = { days: ["שלישי"], orderWindow: onlyDay(1, "12:00") };
    expect(nextDeliveryDate({ ...shape, now: at("2026-11-23T10:00:00Z") })?.date).toBe("2026-12-01");
    expect(nextDeliveryDate({ ...shape, now: at("2026-11-23T15:00:00Z") })?.date).toBe("2026-12-01");
  });

  it("delivery on the cutoff day itself counts once orders close that day", () => {
    // Orders until Friday 10:00, delivery Friday. Thu 26/11 → Fri 27/11.
    const r = nextDeliveryDate({
      days: ["שישי"],
      orderWindow: onlyDay(5, "10:00"),
      now: at("2026-11-26T18:00:00Z"),
    });
    expect(r?.date).toBe("2026-11-27");
  });

  it("two order days: no single cutoff → the tomorrow rule", () => {
    const window = { ...onlyDay(1, "12:00"), ...onlyDay(3, "12:00") };
    // Sun 22/11 morning: a cutoff rule would say Tue 24/11 too; Monday-only
    // delivery splits them — tomorrow rule gives Mon 23/11.
    const r = nextDeliveryDate({ days: ["שני"], orderWindow: window, now: at("2026-11-22T07:00:00Z") });
    expect(r?.date).toBe("2026-11-23");
  });

  it("no date: on vacation, no day, or a day name the vocabulary doesn't hold", () => {
    const now = at("2026-11-24T07:00:00Z");
    expect(nextDeliveryDate({ days: ["שני"], onVacation: true, now })).toBeNull();
    expect(nextDeliveryDate({ days: [], now })).toBeNull();
    expect(nextDeliveryDate({ days: null, now })).toBeNull();
    expect(nextDeliveryDate({ days: ["Monday"], now })).toBeNull();
  });

  it("reads the Israel day, not UTC: 00:30 Tuesday in Israel is still Monday in UTC", () => {
    // 22:30 UTC Mon 23/11 = 00:30 Israel Tue 24/11. Tomorrow (Israel) = Wed.
    const r = nextDeliveryDate({ days: ["שלישי", "רביעי"], now: at("2026-11-23T22:30:00Z") });
    expect(r?.date).toBe("2026-11-25");
  });

  it("across the October switch: Sat 24/10 23:30 Israel (UTC+3) → Mon 26/10", () => {
    const r = nextDeliveryDate({ days: ["שני"], now: at("2026-10-24T20:30:00Z") });
    expect(r?.date).toBe("2026-10-26");
  });

  it("across the March switch, cutoff Thursday 22:00, delivery Sunday", () => {
    // Thu 26/03 21:30 Israel (UTC+2) is before close; switch is Fri 27/03.
    const r = nextDeliveryDate({
      days: ["ראשון"],
      orderWindow: onlyDay(4, "22:00"),
      now: at("2026-03-26T19:30:00Z"),
    });
    expect(r?.date).toBe("2026-03-29");
  });
});

// ── oracle ────────────────────────────────────────────────────────────────
const FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jerusalem",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
});
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function israel(t) {
  const p = Object.fromEntries(FMT.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    wd: WD.indexOf(p.weekday),
    min: Number(p.hour) * 60 + Number(p.minute),
  };
}
const QUARTER = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function oracle({ days, cutoff, now }) {
  const wanted = days.map((d) => DELIVERY_DAYS.indexOf(d));
  const here = israel(now);
  let fromDate;
  if (cutoff) {
    // The first grid instant strictly after now that IS the cutoff moment.
    let t = Math.floor(now / QUARTER) * QUARTER + QUARTER;
    for (; ; t += QUARTER) {
      const p = israel(t);
      if (p.wd === cutoff.dayIndex && p.min === cutoff.closeMin) break;
    }
    fromDate = israel(t).date;
  } else {
    // Tomorrow's Israel date: walk forward until the date changes.
    let t = now;
    while (israel(t).date === here.date) t += QUARTER;
    fromDate = israel(t).date;
  }
  // Walk calendar days from fromDate (noon steps never skip a date).
  let t = Date.parse(`${fromDate}T12:00:00+02:00`);
  for (let i = 0; i < 8; i += 1, t += DAY) {
    const p = israel(t);
    if (wanted.includes(p.wd)) return p.date;
  }
  return null;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe("nextDeliveryDate — property: agrees with the oracle", () => {
  const rand = mulberry32(3485);
  const START = Date.parse("2026-01-01T00:00:00Z");
  const SPAN = Date.parse("2028-01-01T00:00:00Z") - START;
  // Half the cases inside the four DST switch weeks of 2026–2027.
  const SWITCHES = ["2026-03-27", "2026-10-25", "2027-03-26", "2027-10-31"].map((d) => Date.parse(`${d}T00:00:00Z`));
  const cases = Array.from({ length: 240 }, (_, i) => {
    const now = i % 2
      ? START + Math.floor(rand() * SPAN)
      : SWITCHES[i % 4] - 3 * DAY + Math.floor(rand() * 6 * DAY);
    const days = DELIVERY_DAYS.filter(() => rand() < 0.35);
    const withCutoff = rand() < 0.6;
    const cutoff = withCutoff
      ? { dayIndex: Math.floor(rand() * 7), closeMin: 15 * (33 + Math.floor(rand() * 63)) } // 08:15–23:45, after open
      : null;
    return { now, days: days.length ? days : [DELIVERY_DAYS[i % 7]], cutoff };
  });

  it("240 seeded cases, half around a clock change", () => {
    const misses = [];
    for (const c of cases) {
      const close = c.cutoff
        ? `${String(Math.floor(c.cutoff.closeMin / 60)).padStart(2, "0")}:${String(c.cutoff.closeMin % 60).padStart(2, "0")}`
        : null;
      const got = nextDeliveryDate({
        days: c.days,
        orderWindow: c.cutoff ? onlyDay(c.cutoff.dayIndex, close) : null,
        now: new Date(c.now),
      })?.date ?? null;
      const want = oracle(c);
      if (got !== want) misses.push({ now: new Date(c.now).toISOString(), days: c.days, close, cutoffDay: c.cutoff?.dayIndex, got, want });
    }
    expect(misses).toEqual([]);
  });
});
