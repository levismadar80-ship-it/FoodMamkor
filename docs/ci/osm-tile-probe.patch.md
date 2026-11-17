# Patch — `uptime.yml`: also probe one OpenStreetMap map tile (MEH-3356)

> **Status: ⏳ NOT APPLIED — written 17/11/2026.** `.github/workflows/**` is
> CC-deny, so CC prepared and checked this patch and Sapir (or Claude in
> Chrome) commits it. See [§5](#5--how-to-apply).

## 1 · Why

On 16/11 every map on mehamakor.co.il showed OSM's «403 Access blocked» tile
(MEH-3077, fixed in release 1.5.5). Nothing caught it: every E2E spec stubs
`tile.openstreetmap.org` (`map.spec.ts:337`, `home.spec.ts:481`,
`43-minimap-buttons-over-tiles.spec.ts:157`), so a real block can never show
there. OSM tightened enforcement three times in 2026 (Referer, User-Agent,
a/b/c shard hosts), and a site learns about the next one when its map breaks.

## 2 · What it changes (`.github/workflows/uptime.yml`)

| where | change |
|---|---|
| job `name` (line 22) | mentions the tile probe |
| job `env` (after line 27) | `TILE_URL`, `TILE_REFERER` + a 3-line comment |
| step `Probe both endpoints` (before line 42) | one tile request; `fail=1` when the status is not 200 **or** the response carries `x-blocked` |

Everything else is byte-identical: the 30-minute schedule, the two site URLs,
the exact-200 rule, retries, and the ×2-consecutive issue logic. A blocked tile
opens the same `uptime` issue; the run log names the tile and prints the
`x-blocked` line.

**Why the header check:** a blocked tile can come back as `200` with
`x-blocked: Access denied…` (seen on the OSM forum, March 2026), so a status
check alone would stay green.

**Why the Referer and User-Agent:** without a Referer OSM blocks the request
itself (the 16/11 failure), and a default `curl/…` User-Agent can be blocked by
the policy. The probe identifies itself and sends our origin, which is what a
visitor's browser sends. Load: 48 tile requests a day, served from OSM's CDN.

## 3 · The diff

```diff
--- a/.github/workflows/uptime.yml
+++ b/.github/workflows/uptime.yml
@@ -19,12 +19,17 @@
 
 jobs:
   probe:
-    name: Probe / and /api/health/readiness
+    name: Probe /, /api/health/readiness and the OSM map tiles
     runs-on: ubuntu-latest
     timeout-minutes: 5
     env:
       HOME_URL: https://mehamakor.co.il/
       READY_URL: https://mehamakor.co.il/api/health/readiness
+      # MEH-3356: one OSM tile, sent the way a visitor's browser sends it
+      # (Referer = our origin). OSM can answer a block with 200 + `x-blocked`,
+      # so the header is checked, not just the status code.
+      TILE_URL: https://tile.openstreetmap.org/8/153/104.png
+      TILE_REFERER: https://mehamakor.co.il/
       GH_TOKEN: ${{ github.token }}
       GH_REPO: ${{ github.repository }}
     steps:
@@ -39,6 +44,16 @@
             echo "$url -> HTTP $code"
             if [ "$code" != "200" ]; then fail=1; fi
           done
+          hdr=$(curl -sS -o /dev/null -D - --max-time 20 --retry 2 --retry-delay 5 \
+                  -e "$TILE_REFERER" -A "mehamakor-uptime-probe/1.0 (+https://mehamakor.co.il)" \
+                  "$TILE_URL" 2>/dev/null | tr -d '\r' || true)
+          tcode=$(printf '%s\n' "$hdr" | awk 'toupper($1) ~ /^HTTP\// {c=$2} END {print c+0}')
+          echo "$TILE_URL -> HTTP $tcode"
+          if [ "$tcode" != "200" ] || printf '%s\n' "$hdr" | grep -qi '^x-blocked:'; then
+            printf '%s\n' "$hdr" | grep -i '^x-blocked:' || true
+            echo "::warning::OSM tile blocked or unreachable — map tiles on the site may show «Access blocked»"
+            fail=1
+          fi
           echo "fail=$fail" >> "$GITHUB_OUTPUT"
 
       # One issue carries the outage state. Title is fixed so `gh issue list`
```

## 4 · Verified (CC, 17/11)

- `git apply --check` against staging `1762d52d`: OK.
- YAML parses (`yaml.safe_load`).
- The step's script, run with a stub `curl` for each case:

| case | output | `fail` |
|---|---|---|
| `HTTP/2 200`, no `x-blocked` | `…/8/153/104.png -> HTTP 200` | 0 |
| `HTTP/2 200` + `x-blocked: Access denied…` | prints the header + `::warning::` | 1 |
| `HTTP/2 403` | `-> HTTP 403` + `::warning::` | 1 |
| no answer (DNS failure) | `-> HTTP 0` + `::warning::` | 1 |

- **Not verified:** a real request from a GitHub runner to OSM (the CC sandbox
  cannot reach it). The first manual run after applying is that check.

## 5 · How to apply

1. Open `github.com/levismadar80-ship-it/FoodMamkor/edit/staging/.github/workflows/uptime.yml`.
2. Make the three changes in §3.
3. Commit to a new branch `feature/meh-3356-osm-tile-probe-apply`, open a PR to
   staging ending in `Closes MEH-3356`.
4. CC checks the PR diff equals §3 byte for byte, and merges.
5. After merge: Actions → «Uptime probe» → Run workflow. The log must show
   `https://tile.openstreetmap.org/8/153/104.png -> HTTP 200`.
