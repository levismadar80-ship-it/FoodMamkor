# Access register — who and what can act on Mehamakor

> **Last reviewed: 2026-10-26** (after the Railway incident of 21–22/10).
> Next review: **2027-01-26** (quarterly; procedure in §6).

**The rule:** every grant gets a row here **in the same session it is granted**:
a GitHub App, a collaborator, a token, a third-party account. That includes grants
Sapir makes herself. In a security review, anything that appears in a log or
settings page but has no row here is a finding until someone explains it.

Why this file exists: on 26/10 the security-log review found `mehamakor-cc`
and `mehamakor-bot` with write access. Neither was mentioned anywhere in the
repo or in Linear. Both were Sapir's, but nothing on record said so, and the
review could not tell an owner's grant from an intruder's.

Secret **values** never go here. Names, scopes and owners only.

---

## 1. GitHub: accounts with access to `levismadar80-ship-it/FoodMamkor`

| Account | Role | Owner | Purpose | Added |
|---|---|---|---|---|
| `levismadar80-ship-it` | Owner | Sapir | Repo owner. Merges, settings, secrets | — |
| `sapirschnapp` | Collaborator | Sapir | The account Claude Code sessions open and merge PRs as. Author ≠ owner is a condition the review gate relies on (`docs/CHANGELOG.md`, search `sapirschnapp`) | — |
| `mehamakor-bot` | Collaborator (write) | Sapir (confirmed 26/10) | **Not recorded.** Empty profile, no activity in 10/2026 | Unknown: the security log doesn't record collaborator adds |

## 2. GitHub Apps installed on the account

| App | Owner | Repos | Permissions | Purpose |
|---|---|---|---|---|
| Claude | Anthropic | — | — | Claude Code cloud sessions + `claude-review.yml` |
| Claude Design Import | Anthropic | — | — | Design import |
| Linear, Linear Code | Linear | — | — | Issue ↔ PR linking, auto-close |
| Railway App | Railway | — | — | Auto-deploy on push |
| Vercel | Vercel | — | — | Frontend deploys |
| **`mehamakor-cc`** | Sapir (`levismadar80-ship-it`), created 2026-09-02 | **All repositories, current and future** | Contents RW · Pull requests RW · **Workflows RW** · Metadata R. No webhook | **Not recorded.** Sapir confirmed it is hers (26/10) |

## 3. OAuth apps and personal tokens (account `levismadar80-ship-it`)

| Item | Scope | Purpose | Expires |
|---|---|---|---|
| Classic token `git-bash` | (see settings) | git over HTTPS from Sapir's Windows machine | 2027-05-02 |
| ~~Classic token `git-bash-cleanup`~~ | — | Deleted 2026-10-26 (expired June) | — |
| GitHub iOS | includes `admin:org` | Mobile app, authorized 2026-10-23 | — |
| Copilot Chat, Copilot SWE Agent | GitHub-managed | Authorized 2026-10-21 | — |

No fine-grained tokens, no SSH/GPG keys, no deploy keys, no repo webhooks (26/10).

## 4. GitHub Actions secrets (names only)

Derived, not typed: `grep -rhoE "secrets\.[A-Z_0-9]+" .github/workflows | sort -u`.

| Secret | Used for | Rotated |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | CI adversarial reviewer (`claude-review.yml`) | 2026-10-26 |
| `RAILWAY_PRODUCTION_TOKEN`, `RAILWAY_STAGING_TOKEN` | `deploy.yml` redeploys | 2026-10-24 |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | E2E against protected staging | — |
| `DEMO_ADMIN_PASSWORD`, `DEMO_OWNER_PASSWORD`, `DEMO_CONSUMER_PASSWORD` | E2E logins (staging) | — |
| `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD` | `staging-smoke.yml` | — |
| `SMOKESHOW_AUTH_KEY` | Backend coverage upload (`pr-checks.yml`) | — |
| `LINEAR_API_KEY` | Weekly PR ↔ Linear sweep (`pr-reconcile.yml`) | — |

Backend runtime variables (Railway) are listed in `backend/app/config.py` and
`backend/.env.example`. This file does not repeat them.

## 5. External accounts: where each thing lives

| Service | Account / location | Holds | Trap |
|---|---|---|---|
| **Cloudflare** | Nameservers `ernest`/`gina.ns.cloudflare.com` | **DNS for mehamakor.co.il** (incl. DMARC `p=none`, rua `dmarc@mehamakor.co.il`) | Vercel also shows copies of the email records. They are **inert**; edit DNS in Cloudflare only |
| Vercel | team `levismadar80-ship-its-projects` | Frontend, staging protection | — |
| Railway | project `believable-tenderness` (staging + production) | Backend, Postgres, backup cron | Audit log only goes back to ~24/10 2026 |
| **Resend: two accounts** | `sapir000s` = **mehamakor.co.il verified, production key**; a second account has only `mehamakor.online` | Transactional email | A key made in the wrong account sends nothing from `.co.il`. That is what broke production email on 24/10 |
| Anthropic | the account that replaced the one deleted 24/10 | `ANTHROPIC_API_KEY` (Railway), CI reviewer token | — |
| Cloudflare R2 | token scoped to Object R/W on `mehamakor-backups` only | DB backups | — |
| Cloudinary | `Root` key disabled; app key rotated 24/10 | Images | — |
| Google Cloud | project "My First Project" | Places API key (rating line) | Needs 2-step verification on the Google account before the console opens |
| Meta (WhatsApp) | developers.facebook.com app | Webhook | Verify token is checked only on re-verification. Copy it from Railway if the webhook is ever edited |
| Linear, Sentry, PostHog, UptimeRobot | Sapir | Tasks, errors, analytics, uptime | — |

## 6. Quarterly review (≈15 minutes, Claude in Chrome)

Paste into Claude in Chrome on Sapir's browser:

> Read-only; change nothing; never display secret values. For each section of
> `docs/ACCESS.md` in github.com/levismadar80-ship-it/FoodMamkor, compare it with
> the live settings page: GitHub collaborators, installed GitHub Apps (and their
> repo scope), authorized OAuth apps, personal tokens, SSH keys, deploy keys,
> webhooks, Actions secret names; the GitHub security log and the Railway audit
> log for the last 3 months. Report every item that is live but missing from
> the file, every row that is no longer live, and any sign-in or action from an
> IP or device that is not Sapir's usual one.

Then Claude Code updates this file (a docs-only PR), including `Last reviewed:`.

## 7. Open items (26/10)

- [ ] `mehamakor-cc`: record its purpose. Reduce it from "all repositories" to
  FoodMamkor only, or uninstall it if nothing uses it. It holds **Workflows RW**,
  so it can edit `.github/workflows/**`, the path that convention reserves for
  Sapir (`.claude/rules/security.md`).
- [ ] `mehamakor-bot`: record its purpose, or remove it as a collaborator if unused.
- [ ] GitHub iOS holds `admin:org`. Fine if intentional; revoke if the app isn't used.
- [ ] Repo visibility keeps flipping to private (§8). Find the actor in the
  security log and decide what the repo should be (MEH-2365).

## 8. Repo visibility: who can flip it, and where to see who did

**Symptom.** The repo has gone private at least three times: 31/08, 25/10
(public again at 16:23Z), and 26/10 from about 15:44Z. Each time every Actions
job fails in about 2 seconds with no steps and the message "an Actions budget is
preventing further use". A private repo on Free has a minutes quota, and its
rulesets stop applying ([DEPLOYMENT.md](./DEPLOYMENT.md), search "Visibility").
Check `GET /repos/levismadar80-ship-it/FoodMamkor` → `"visibility"` first.

**Nothing in the repo does it.** `git grep -iE "visibility|private"` over
`.github/`, `scripts/` and `.claude/` finds only a comment in
`claude-review.yml` (26/10).

**Only the owner account can.** On a personal-account repo, collaborators
(`sapirschnapp`, `mehamakor-bot`) cannot change visibility, and `mehamakor-cc`
has no Administration permission (§2). So the change comes from
`levismadar80-ship-it` itself: the web UI, GitHub iOS, the `git-bash` token, or
a Claude in Chrome session running in Sapir's browser.

**Claude Code cannot see who did it.** The repo events API records only the
private → public direction (`PublicEvent`), and the account security log is
outside a session's repo-scoped access. The answer is in the security log,
filtered to visibility changes:
<https://github.com/settings/security-log?q=action%3Arepo.access>. Each entry
shows the time and where it came from.

**The conflict behind it (a guess, not verified).** The contact spreadsheets
that #3604 removed are still in git history, so a public repo still exposes
those phone numbers. That is a good reason to want the repo private, and it
conflicts with keeping CI alive. The ways out are Sapir's: purge the history
(a force-push to `staging` and `main`), pay for Actions minutes, or keep the
repo public and accept that the numbers stay in history.
