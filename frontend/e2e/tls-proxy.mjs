// MEH-3153 — HTTPS in front of `next start` for the WebKit (iPhone) run only.
// Started by playwright.config.ts `webServer` when e2e/webkit-tls.ts says so.
// Why it exists: see the header of e2e/webkit-tls.ts. Self-signed cert, made
// with openssl at start (present on GitHub's ubuntu runners); the browser side
// already runs with ignoreHTTPSErrors.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const LISTEN = 3443;
const TARGET_PORT = 3000;
const PUBLIC_ORIGIN = `https://localhost:${LISTEN}`;

// Plain HTTP/1.1 only: `next start` needs no websocket/HMR upgrade, so
// hop-by-hop headers are passed through untouched. Port 3443 is fixed and
// mirrored in e2e/webkit-tls.ts (WEBKIT_TLS_PORT); change both together.
function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tls-proxy-"));
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-subj", "/CN=localhost", "-keyout", key, "-out", cert,
  ], { stdio: "ignore" });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

// An absolute redirect built by Next from its own (plain-http) view of the
// request would throw the browser back to http and drop the Secure cookies
// again. Point any such Location back at the https origin.
const PLAIN_ORIGINS = [`http://localhost:${TARGET_PORT}`, `http://localhost:${LISTEN}`];
function rewriteLocation(location) {
  if (!location) return location;
  for (const o of PLAIN_ORIGINS) {
    if (location.startsWith(o)) return PUBLIC_ORIGIN + location.slice(o.length);
  }
  return location;
}

function forward(req, res) {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        "x-forwarded-proto": "https",
        "x-forwarded-host": req.headers.host || `localhost:${LISTEN}`,
      },
    },
    (up) => {
      const headers = { ...up.headers };
      if (headers.location) headers.location = rewriteLocation(headers.location);
      res.writeHead(up.statusCode || 502, headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (res.headersSent) return res.destroy(err);
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`tls-proxy: upstream error: ${err.message}`);
  });
  // A browser that drops the connection must not leave the upstream open.
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

if (process.argv[1] && process.argv[1].endsWith("tls-proxy.mjs")) {
  https
    .createServer(makeCert(), forward)
    .listen(LISTEN, () => console.log(`[tls-proxy] ${PUBLIC_ORIGIN} -> http://localhost:${TARGET_PORT}`));
}
