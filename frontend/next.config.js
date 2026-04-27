const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // MEH-54: custom service worker code (push event handlers).
  // next-pwa bundles worker/index.js and importScripts it in the generated sw.js.
  customWorkerDir: "worker",
});

// When deployed to a Vercel preview URL (not production, not local dev),
// Vercel injects its "live feedback" widget at
// https://vercel.live/_next-live/feedback/feedback.js which lets reviewers
// leave comments directly on the preview. The widget also opens a
// WebSocket to Pusher for realtime updates. None of this runs in prod
// (where `VERCEL_ENV === "production"`) or in local `next dev`, so we
// only expand the CSP when `VERCEL_ENV === "preview"` — keeping the
// production CSP strict. See the Vercel Live docs for the canonical
// list of required CSP sources (script/style/frame/connect/img/font).
const isVercelPreview = process.env.VERCEL_ENV === "preview";
const vercelLiveScript = isVercelPreview ? " https://vercel.live" : "";
const vercelLiveStyle = isVercelPreview ? " https://vercel.live" : "";
const vercelLiveFrame = isVercelPreview ? " https://vercel.live" : "";
const vercelLiveConnect = isVercelPreview
  ? " https://vercel.live wss://ws-us3.pusher.com https://pusher.com"
  : "";
const vercelLiveImg = isVercelPreview
  ? " https://vercel.live https://vercel.com"
  : "";
const vercelLiveFont = isVercelPreview ? " https://vercel.live" : "";

// SECURITY FIX #8 (SECURITY.md): HTTP security headers applied by Next.js
// on every HTML/asset response. Paired with backend/app/main.py which sets
// the same family of headers on API responses. HSTS is included here for
// the front-end origin because it's served over HTTPS in production.
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Allow Google OAuth popups (GSI / One Tap / FedCM) to post credentials
  // back via postMessage. Without same-origin-allow-popups the browser
  // isolates the Google auth popup and it can't communicate back to our tab.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  {
    // CSP is intentionally permissive on 'unsafe-inline' for script/style
    // because Next.js inlines runtime code and Tailwind injects styles.
    // Cloudinary + Unsplash whitelisted for images; Google fonts + GSI
    // for scripts (OAuth); Leaflet tiles from openstreetmap.
    //
    // Vercel Live feedback widget is conditionally whitelisted via the
    // `vercelLive*` consts above — only when `VERCEL_ENV === "preview"`.
    // Production CSP stays strict.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `img-src 'self' https://res.cloudinary.com https://images.unsplash.com https://*.tile.openstreetmap.org https://unpkg.com https://*.googleusercontent.com data: blob:${vercelLiveImg}`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://appleid.cdn-apple.com${vercelLiveScript}`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com${vercelLiveStyle}`,
      `font-src 'self' https://fonts.gstatic.com data:${vercelLiveFont}`,
      `connect-src 'self' https://accounts.google.com https://appleid.apple.com https://nominatim.openstreetmap.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io${vercelLiveConnect}`,
      `frame-src 'self' https://accounts.google.com https://appleid.apple.com${vercelLiveFrame}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    // Server-side proxy target. Read at server boot from process.env.
    //
    // BACKEND_URL is the canonical name and is set ONLY by docker-compose
    // (and CI). It deliberately does NOT live in any .env* file, so a
    // stray frontend/.env.local cannot shadow it inside the container.
    //
    // NEXT_PUBLIC_API_URL is kept as a fallback for older configs.
    const target =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8000";
    // Print so any future "Failed to proxy" log can be cross-referenced.
    // eslint-disable-next-line no-console
    console.log(`[next.config] /api/* → ${target}`);
    return [
      {
        source: "/api/:path*",
        destination: `${target}/:path*`,
      },
    ];
  },
};

let finalConfig = withPWA(nextConfig);

// Wrap with Sentry only when @sentry/nextjs is installed AND a DSN is
// configured. This keeps dev/CI builds working without the package.
if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
  try {
    const { withSentryConfig } = require("@sentry/nextjs");
    finalConfig = withSentryConfig(finalConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      disableLogger: true,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[next.config] Sentry DSN set but @sentry/nextjs not installed — skipping wrap.");
  }
}

module.exports = finalConfig;
