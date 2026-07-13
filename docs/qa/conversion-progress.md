# MEH-1171 — Conversion progress (checkpoint file)

> Updated after EVERY converted section (checkpoint-and-continue, per ticket).
> Conversion has NOT started — blocked on the wait gate below.

## Status: 🔒 WAIT GATE — matrix awaiting Sapir approval

- [x] Phase 0 report + full triage matrix (`docs/qa/manual-testing-matrix.md`, 1,068 rows)
- [ ] **Sapir approves matrix (incl. STALE deletions)** ← blocking everything below
- [ ] `scripts/local-backend.sh` (uvicorn + ephemeral Postgres + alembic upgrade head + seed)
- [ ] Conversion, section by section (CONVERT-PW → `frontend/e2e/flows/manual/`, CONVERT-PYTEST → `tests/test_manual_*.py`)
- [ ] MANUAL_TESTING.md rewrite: pointer stubs (MEH-671 pattern) + unified Tier-3 checklist + STALE sections deleted
- [ ] New suite green ×2 consecutive runs (anti-flake), output pasted here
- [ ] FINDINGS handed to Ticket B

## Per-section log

_(populated during conversion; one line per section: section name · items converted · spec file · run result)_

| Section | Items | Target file | Status |
|---|---|---|---|
| — | — | — | not started |
