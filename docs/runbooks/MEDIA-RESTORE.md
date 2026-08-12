# Runbook — media restore (MEH-1976)

> **Audience:** Sapir, at a terminal, with the Cloudinary credentials.
> **Scope:** what to do with a completed `scripts/ops/cloudinary-export.py` export.
> **As-of 2026-08-11.** The account state below was measured; re-measure before acting.

---

## Read this first — the account is NOT disabled

Measured 2026-08-11 via the Admin API, which **responded normally**:

```
plan        Free
credits     111.4 used / 25 limit   ->  445.6%
bandwidth   119,097,014,346 B (119 GB)  = 110.92 credits   <-- 99.6% of the overage
storage        300,974,178 B (301 MB)   =   0.28 credits
resources   113   (109 image + 4 video)
derived     198
```

Three things follow, and getting any of them wrong sends you after the wrong fix:

1. **The account is over quota, not disabled.** Reads work. The export is unblocked.
2. **The overage is bandwidth, not storage.** Storage is 0.25% of the bill. **Deleting
   files will not bring the account back under quota** — it targets the wrong number.
   Whatever is serving 119 GB is the thing to find; the export is unrelated to it.
3. **125 MB — 42% of all storage — is Cloudinary's own demo content.** Four sample
   videos (`samples/dance-2`, `samples/cld-sample-video`, `samples/elephants`,
   `samples/sea-turtle`) uploaded 2026-04-08 with the account, plus several `samples/*`
   images. Not Mehamakor media. Deleting them is your call — the export script
   deliberately does **not** filter them out, because deciding what is ours is not a
   script's judgement to make.

---

## Step 0 — take the export (before any restore path)

```bash
export CLOUDINARY_CLOUD_NAME=...      # same three vars the app reads
export CLOUDINARY_API_KEY=...         # backend/app/config.py:46-48
export CLOUDINARY_API_SECRET=...

# Always plan first. Costs one listing call, no media bandwidth.
python scripts/ops/cloudinary-export.py --dry-run --out ./media-export

# Then the real pull. ~301 MB, rate-limited to 2 req/s by default.
python scripts/ops/cloudinary-export.py --out ./media-export
```

It is **resumable**, and the disk is what it trusts — a file present at the byte count
Cloudinary reports is skipped **whether or not a manifest exists yet**. That matters for
the first run specifically: the manifest is written at the end, so an interrupt before
then leaves none, and a manifest-keyed resume would re-pull everything it had just
fetched. Re-running a complete
export downloads nothing. If it exits `1`, some downloads failed; just run it again.

**Keep `manifest.json`.** It is the only thing that maps a local file back to its
`public_id`, and every restore path below is driven by it. An export without its
manifest is a pile of files nobody can put back.

### Verify the export before trusting it

```bash
python - <<'PY'
import json, pathlib
m = json.load(open('media-export/manifest.json'))
missing = [a for a in m['assets'] if not a['downloaded']]
bad = [a for a in m['assets']
       if a['downloaded'] and pathlib.Path('media-export', a['path']).stat().st_size != a['bytes']]
print(f"{m['count']} assets · {len(missing)} not downloaded · {len(bad)} size mismatch")
PY
```

Both counts must be zero. A manifest that says `downloaded: true` for a file whose size
disagrees with Cloudinary's is the one failure mode that looks like success.

---

## Path (a) — the account is restored

The happy case: quota resets or the plan is raised, and the same cloud name is live again.

1. **Do nothing to the media.** The assets never left; `public_id`s are unchanged, so
   every stored URL in the database still resolves. There is nothing to re-upload.
2. **Verify rather than assume** — spot-check a handful of `secure_url`s from the
   manifest with `curl -sI` and expect `200`.
3. **Keep the export.** It is now a backup, and its value is that it exists *before* the
   next incident, not after.
4. Address the **bandwidth** driver. 119 GB against a 301 MB library means each byte was
   served ~400 times; that is a delivery/caching question, not a media question.

**Cost: zero.** This is the path to hope for, and the export is what makes waiting for
it safe rather than a gamble.

---

## Path (b) — migrate to a new Cloudinary account

Used when the current cloud must be abandoned.

1. Create the new product environment. Note its **new cloud name** — this is the value
   that changes and the reason a migration is not free.
2. Re-upload **preserving `public_id` exactly**, driven by the manifest:

   ```bash
   python - <<'PY'
   import json, cloudinary, cloudinary.uploader
   # NOTE: 'media-export' below is the DEFAULT --out. If you exported to a
   # different directory, change it in BOTH places or this silently uploads
   # nothing (an empty/missing manifest is not an error here).
   cloudinary.config(cloud_name="NEW_CLOUD", api_key="...", api_secret="...")
   man = json.load(open('media-export/manifest.json'))
   for a in man['assets']:
       if not a['downloaded']:
           continue
       cloudinary.uploader.upload(
           f"media-export/{a['path']}",
           public_id=a['public_id'],          # <-- the whole point
           resource_type=a['resource_type'],
           overwrite=False,
           invalidate=False,
       )
   PY
   ```

   **Why `public_id` must be preserved:** stored URLs embed it. Keep it and only the
   cloud-name segment changes, which is one config value. Change it and every stored
   URL must be rewritten in the database — a migration instead of a config edit.

3. Update the three env vars in **Railway** (staging + production) and redeploy.
   `CLOUDINARY_CLOUD_NAME` is the one that actually differs.
4. **Version numbers will differ.** Re-uploaded assets get fresh `v<number>` segments.
   Stored URLs that pin an old version will 404. Check whether any stored URL carries a
   version segment before declaring this done — if they do, that is a data migration and
   it is a separate, larger job than this runbook covers.
5. Spot-check a producer page end to end before switching production.

**Cost: one config change if `public_id`s and versionless URLs hold; a data migration
if either assumption fails.** Establish which before you start.

---

## Path (c) — placeholder degradation

The stopgap when media is unavailable and the site must still be usable.

**Already shipped — do not rebuild it.** The frontend fallback landed in PR #2757
(part 3 of MEH-1976) and is out of scope here.

What the product does with no image:

- **Listing card** — `ProducerCard.jsx:306-308`: a `<Leaf>` glyph plus the Hebrew
  brand name (`BRAND_NAME`, `lib/constants.js:1`). Not a broken-image icon.
- **Detail hero** — the MEH-815 Tinted Masthead: tinted ground, recessive `מ·ה`
  monogram, producer name as the `<h1>`.

Both are **designed empty states, not error states**, which is what makes this a viable
degradation rather than a visible outage.

**The one thing to check before relying on it:** these fire when `images` is *empty*.
They do **not** fire when `images` holds a URL that 404s — that renders a broken image.
So degradation by *clearing* the field works; degradation by *letting the URLs rot* does
not. If you take this path, clear the field.

> **Known live example of the same class:** the MEH-999 test producer still carries
> `mehamakor/79cd766d534f4d3e96c8d8e8cb49441a` — the brand wordmark uploaded as a cover
> photo (confirmed still `active` on 2026-08-11). Because an image *exists*, the
> canonical fallback correctly never fires. Diagnosed in
> `docs/design-audit/PRODUCER-QA-FINDINGS.md` as test-data contamination, not a code
> defect, and it is still open.

---

## Credentials Sapir needs (one line each)

No new environment variables are introduced. These three already exist and are already
set in Railway — the export script reads exactly the same ones the app does
(`backend/app/config.py:46-48`):

| Variable | Where to get it |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary console → Dashboard → Product Environment → Cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary console → Settings → Access Keys → API Key |
| `CLOUDINARY_API_SECRET` | same page → API Secret (**never** paste into a Claude session — export it in your own shell) |

For path (b) only, a second set of the same three for the **new** account.

---

## What is deliberately not automated

- **No deletion, anywhere.** Not on Cloudinary, not on disk. Every destructive step in
  this runbook is a human running a command they typed.
- **No database writes.** The manifest is media-only; it cannot tell you which producer
  references which asset. Joining the two needs an authed data read, and that belongs in
  a ticket with its own review, not in a backup script.
- **No upload from the export script.** Export and restore stay independent failure
  modes — the same reasoning `scripts/backup_production_db.py` uses for keeping
  backup-creation separate from retention.
