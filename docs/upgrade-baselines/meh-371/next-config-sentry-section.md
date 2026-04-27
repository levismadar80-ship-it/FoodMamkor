# MEH-371 — next.config.js Sentry section (pre-upgrade)

Captured: 2026-04-27
Branch: feature/meh-371-sentry-10-upgrade
Staging tip: 82d697d

## frontend/next.config.js (lines 122–137)

```js
    const { withSentryConfig } = require("@sentry/nextjs");
    finalConfig = withSentryConfig(finalConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[next.config] Sentry DSN set but @sentry/nextjs not installed — skipping wrap.");
  }
}

module.exports = finalConfig;
```

## Notes

- Wrap is inside `try/catch` — fail-soft; missing module logs a warning but does not crash.
- Conditional execution: the try block is gated above (look at lines preceding line 122 in the original file).
- v8 → v10 migration: same `withSentryConfig` API name; option keys to verify in v10 migration guide.
