# מהמקור (Mehamekor)

> Israeli directory of local food producers and home cooks.
> Live: **[mehamekor.online](https://mehamekor.online)** · Instagram: [@mehamekor](https://www.instagram.com/mehamekor)

A "Google Maps for real food in Israel" — grass-fed meat, sourdough, raw dairy,
organic veg, natural skincare. Surface the small producers and home cooks who
were previously stuck in scattered WhatsApp groups, and let them sell directly
to people who care. Hebrew RTL, feminine voice (`-י`), warm farmers-market
aesthetic — never tech-startup.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind + Framer Motion + Leaflet |
| Backend | FastAPI + SQLAlchemy + Pydantic v2 |
| DB | PostgreSQL on Railway — stock, no PostGIS (Haversine in SQL) |
| Hosting | Vercel (frontend) + Railway (backend + DB) |
| AI | Anthropic SDK — Opus for moderation, Haiku for the support chat widget |

## Where to start

- **[CLAUDE.md](./CLAUDE.md)** — one-page entry point for contributors and Claude Code sessions
- **[docs/FEATURES.md](./docs/FEATURES.md)** — what's shipped vs. what's planned, with code paths
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — branch strategy, Railway/Vercel setup, cold-start guide
- **[docs/](./docs/)** — full docs index

## Branch strategy

```
feature/your-thing  ──PR──▶  staging  ──PR──▶  main
                              │                 │
                              ▼                 ▼
                   staging.mehamekor.online   mehamekor.online
```

Always branch from `staging`, never from `main`. Both `staging` and `main` are
PR-only — no direct pushes. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for
the full setup.

## Local dev

See [docs/DEPLOYMENT.md → Dev workflow](./docs/DEPLOYMENT.md). TL;DR:

```bash
cp .env.example .env       # then fill in JWT_SECRET_KEY + ANTHROPIC_API_KEY
docker-compose up --build  # frontend on :3000, backend on :8000
```

## License

Private. © 2026 מהמקור.
