# Session log — sweep lane B (`l0qcl4`), 09/08 evening

**Resumed** mid-flight on `feature/meh-1996-orders-claim-timing` with PR #2749 already
merged. Ran the ORDERS §5 anti-stale ritual before touching anything, which is what
made the rest of the session cheap.

---

## Landed

| PR | Card | What |
|---|---|---|
| **#2749** | MEH-1996 | ORDERS §2 claim-at-intent-time + §4 one-check-in-per-PR. Merged `5468b8af`, verified off `origin/staging`. |
| **#2753** | MEH-1982 | SPF/DKIM/DMARC + DNS audit. `docs/audits/2026-08-email-dns-deliverability.md`, +260/−0. |

---

## 1 · The anti-stale gate paid on the first query, again

Lane A returned three `cc-queue` cards. **All three were already claimed**, and the
branch/PR check is what showed it — not the card status:

- **MEH-215** → PR #2747, pushed 30 min earlier (another session, chunk C of 4)
- **MEH-999** → PR #2732, pushed ~2 h earlier
- **MEH-1911** → PR #2661, and this one is the interesting case

**MEH-1911 was not adopted, deliberately.** It is past the 2-hour orphan threshold
(no push in ~24 h), so §2 permits adoption. But reading the PR first showed **two
prior sessions had already looked at it and both handed it back for the same
reason**: the diff edits `.github/workflows/pr-checks.yml`, which is CC-deny, so CC
can merge it but cannot repair it if the re-run goes red — and it changes how pytest
runs for *every future PR*. The ×5 stability evidence is already produced and posted.

Adopting it a third time to re-reach the same conclusion would have been motion, not
progress. **The orphan rule permits adoption; it does not oblige it.**

## 2 · MEH-1982 — the card's premise was wrong, and checking cost five minutes

The card assumed SPF/DKIM/DMARC were **missing** ("בלעדיהם... נוחתים בספאם").
Measured: all three are present and correct — Resend's standard subdomain pattern,
fully in place.

**Building what the card asked for would have added a second apex SPF record and
broken a working setup.** That is the fourth instance today of the ORDERS §5 class
(after MEH-1955, MEH-1956, MEH-160): a card asserting "X is missing" written by
someone who searched Linear for a duplicate card and never searched the *world* for
the capability.

The real finding was one level over, and invisible from the card's framing: the DMARC
record requests reports at `dmarc@mehamakor.online`, **the apex has no MX**, so
delivery falls back to Vercel edge IPs that do not speak SMTP. No aggregate report has
ever arrived. Combined with `p=none`, the record neither enforces nor observes — while
reading as "DMARC configured ✅" to every external checker.

## 3 · The probe caught its own defect before any result was read

No `dig`, no `nslookup`, no `dnspython` in the sandbox; `dns.google` proxy-blocked
(403, the documented egress class). So: a raw UDP/53 client in pure Python.

**Its self-test failed on the first run, correctly.** `google.com TXT` returned
**zero records** while `_dmarc.google.com` parsed fine — 512-byte UDP truncation with
no EDNS0. A truncated response parses as zero answers, which is **byte-identical to
"the record does not exist"**.

That is the whole lesson, and it is the `.claude/rules/testing.md` "green with two
causes" rule wearing its other face: **the failure mode of a DNS probe is a confident
false negative that looks exactly like a real finding.** Without the control I would
have reported "SPF missing" on a domain that has SPF, and recommended records that
break a working configuration — with the audit's authority behind it.

Fixed with EDNS0 + TCP fallback: **0 → 15 records**, demonstrated failing→passing.

**The negative control was itself wrong on the first pass** and had to be tightened
mid-run: it accepted `NOERROR with 0 answers`, which is *precisely* the broken state
it exists to detect. It now demands `NXDOMAIN` specifically, against an RFC 2606
`.invalid` name. A control that passes for the wrong reason is not a control.

That tightening also surfaced a genuine incidental: a bogus label under
`mehamakor.online` returns NOERROR, not NXDOMAIN — a **wildcard** record. Worth
knowing before reading any "absent" row.

## 4 · Scope decision, made rather than deferred

The DNS probe is genuinely reusable and the missing-`dig` wall will recur (MEH-1965 is
the next email card). **Not committed anyway** — the card's DoD says zero code changes
and a new script is not in its acceptance criteria. The *method* and the truncation
gotcha are written into the audit doc, so the next session learns it from the doc
instead of re-deriving it. A durable tool is its own card; a finding is not
self-authorised work.

---

## In-flight ledger

| PR | Card | pushed | gate state | next revisit |
|---|---|---|---|---|
| **#2753** | MEH-1982 | 09/08 22:04Z | **both required gates `success`**, jobs actually ran. Different-model review outstanding — **auto-merge deliberately NOT armed** | on review return |
| **#2745** | MEH-1872 | 09/08 19:40Z | **blocked on Sapir**, not on CC | on `EXPECTED_TABLES` bump |

**#2745 is not a CC-fixable red.** `CI gate` fails on the hardcoded table-count guard
(`Table count=40, expected 39`) — pytest never runs. The fix is one character at
`.github/workflows/pr-checks.yml:360`, CC-deny. Re-verified on `origin/staging` at
22:0xZ: **still 39**. Card labelled `needs-sapir`; nothing re-posted, per the
"post nothing, re-arm silently" rule.

**One check-in armed** covering both PRs (`trig_01WdGq9ZQcn27xMuG6xEgZfn`, 23:08Z) —
one, not two, per the §4 rule this session merged an hour earlier.

## Not done, and named

- **MEH-1976 / 1975 / 1977 / 1978 / 1980** — eligible Lane B, not started. In-flight
  cap of 2 was the binding constraint, not eligibility.
- **MEH-1959** — excluded by B2 (`HIGH-RISK` in title), not by judgement.
- **MEH-1925** (Cloudinary 401, Urgent) — still gate 2, still hers, untouched.
- **The `.online` HTTP layer** — `www`→apex redirect unverified; the sandbox proxy
  returns 403 for that domain on both the curl and WebFetch paths. Stated in the
  audit's Skeptic Mode table rather than inferred.
