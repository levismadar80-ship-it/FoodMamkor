# MEH-3153 — install WebKit's OS libraries on a cache hit too

**Who applies it:** Claude in Chrome, in GitHub's web editor, on the PR branch
(`.github/**` is denied to Claude Code, security.md). The whole change is the
diff below. The patched `.github/workflows/e2e.yml` has sha256
`ad68750b48a8c6d2fd730ff0320b6340d4ec756646b6fa0b27f15b40bc2afdc2`.

## The failure

The first `e2e-webkit-core` run (run 44841099730, job 136661390074, PR #4982)
failed every test in about 2 ms:

```
MiniBrowser: error while loading shared libraries: libevent-2.1.so.7: cannot open shared object file
```

The job restored `playwright-Linux-webkit-<lockfile hash>` from the cache, so
`Install Playwright (WebKit only)` was skipped (`if: cache-hit != 'true'`).
The cache holds the browser binaries in `~/.cache/ms-playwright`, not the apt
packages they link against, and a fresh `ubuntu-latest` runner does not
carry them. The nightly shadow job of 20/11 (job 136017521254) missed the
cache, ran the install, and so got `libevent-2.1-7t64` from apt; it is the
run that saved the cache. The next nightly with a cache hit would fail the same
way, so both WebKit jobs need the fix.

## The change

In both WebKit jobs (`e2e-webkit`, the shadow job, and `e2e-webkit-core`),
the install step loses its `if:` and runs on every run. On a cache hit
`playwright install` finds the browser in place and downloads nothing; only
the apt step does work. The Chromium job is not changed: its run on the same
head passed (418 executed, the one failure was this PR's own spec, since
fixed), so its runner has the libraries Chromium needs.

In private CI mode these jobs run on the self-hosted runner, which already ran
`--with-deps` on every cache miss before this change. Nothing new is asked of
it.

## Diff

```diff
--- /tmp/claude-0/-home-user/37af4ebf-c8bb-52d3-86a6-c48c084de3b9/scratchpad/wf2/e2e.orig.yml	2026-11-21 00:50:03.075460603 +0000
+++ /tmp/claude-0/-home-user/37af4ebf-c8bb-52d3-86a6-c48c084de3b9/scratchpad/wf2/e2e.yml	2026-11-21 00:50:03.116167869 +0000
@@ -953,10 +953,15 @@
         run: npm ci
         working-directory: frontend
 
+      # MEH-3153 webkit deps: runs on a cache hit too. The cache holds the
+      # browser in ~/.cache/ms-playwright, not the apt libraries it links
+      # (libevent-2.1-7 & co.), and every runner starts without them. Gated on
+      # a miss, a cache hit launched MiniBrowser with no libevent and every
+      # test failed in 2 ms (run 44841099730). On a hit `install` finds the
+      # browser present and only the apt step does work.
       - name: Install Playwright (WebKit only)
         run: npx playwright install --with-deps webkit
         working-directory: frontend
-        if: steps.playwright-cache-webkit.outputs.cache-hit != 'true'
 
       - name: Build frontend
         run: npm run build
@@ -1154,10 +1159,15 @@
         run: npm ci
         working-directory: frontend
 
+      # MEH-3153 webkit deps: runs on a cache hit too. The cache holds the
+      # browser in ~/.cache/ms-playwright, not the apt libraries it links
+      # (libevent-2.1-7 & co.), and every runner starts without them. Gated on
+      # a miss, a cache hit launched MiniBrowser with no libevent and every
+      # test failed in 2 ms (run 44841099730). On a hit `install` finds the
+      # browser present and only the apt step does work.
       - name: Install Playwright (WebKit only)
         run: npx playwright install --with-deps webkit
         working-directory: frontend
-        if: steps.playwright-cache-webkit.outputs.cache-hit != 'true'
 
       - name: Build frontend
         run: npm run build
```
