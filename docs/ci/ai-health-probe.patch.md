# Patch: uptime probe checks /api/health/ai (MEH-3724)

**Target:** `.github/workflows/uptime.yml` — `.github/**` is denied to CC edits (security.md), so the change is prepared here and committed through the web editor.

**Why:** the AI features fail open. When the Anthropic client cannot be built or cannot answer, chat, moderation, bio writing, menu reading and risk scoring go "offline" with no 5xx. The anthropic 2.x bump (#5154) would have done exactly that in production with every test green. `GET /api/health/ai` (this PR) builds the client the way the product does and makes one token-free call; this patch makes the 30-minute uptime tick read it, exactly as it reads `/api/health/places`.

**Expected file sha256 after applying:** `def06b894bcb70cbc709cd42335b0b3e8cd2115dec0cb65d9cf42cd2d1e98874`

**Apply after** this PR is merged and deployed to production (until then the URL 404s and the uptime run would warn).

```diff
--- a/.github/workflows/uptime.yml	2026-11-23 00:13:09.391210138 +0200
+++ b/.github/workflows/uptime.yml	2026-11-23 00:14:47.038365423 +0200
@@ -35,6 +35,10 @@
       # outage issue needs two consecutive failing ticks, so a URL probed on
       # every other tick could never open one.
       PLACES_URL: https://mehamakor.co.il/api/health/places
+      # MEH-3724: the Anthropic client, built as the product builds it, plus
+      # one token-free call (list models). AI fails open, so this is the only
+      # signal that chat/moderation/bio/menu/risk went quietly "offline".
+      AI_URL: https://mehamakor.co.il/api/health/ai
       GH_TOKEN: ${{ github.token }}
       GH_REPO: ${{ github.repository }}
     steps:
@@ -66,6 +70,13 @@
             echo "::warning::Google Places check not ok: $(printf '%s\n' "$pbody" | head -n 1 | cut -c1-200)"
             fail=1
           fi
+          abody=$(curl -sS --max-time 20 --retry 2 --retry-delay 5 -w '\n%{http_code}' "$AI_URL" || printf '\n000')
+          acode=$(printf '%s\n' "$abody" | tail -n 1)
+          echo "$AI_URL -> HTTP $acode"
+          if [ "$acode" != "200" ] || ! printf '%s\n' "$abody" | grep -q '"status":"ok"'; then
+            echo "::warning::AI check not ok: $(printf '%s\n' "$abody" | head -n 1 | cut -c1-200)"
+            fail=1
+          fi
           hdr=$(curl -sS -o /dev/null -D - --max-time 20 --retry 2 --retry-delay 5 \
                   -e "$TILE_REFERER" -A "mehamakor-uptime-probe/1.0 (+https://mehamakor.co.il)" \
                   "$TILE_URL" 2>/dev/null | tr -d '\r' || true)
```
