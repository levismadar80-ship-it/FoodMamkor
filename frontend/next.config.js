const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
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

module.exports = withPWA(nextConfig);
