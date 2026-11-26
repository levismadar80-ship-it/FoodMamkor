// MEH-3845: the WebKit run's TLS proxy (e2e/tls-proxy.mjs) must not reuse an
// upstream socket, and must end the browser's response when the upstream
// dies mid-body. Runs `forward` against real local servers.
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { forward } from "../e2e/tls-proxy.mjs";

const servers = [];
function listen(server) {
  servers.push(server);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); })));
});

function get(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", agent: false, headers: { connection: "keep-alive" } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body, ended: true }));
      res.on("error", () => resolve({ status: res.statusCode, body, ended: false }));
      res.on("close", () => resolve({ status: res.statusCode, body, ended: res.complete }));
    });
    req.on("error", reject);
  });
}

describe("tls-proxy forward (MEH-3845)", () => {
  // The browser asks for keep-alive (as WebKit does), so only the proxy's own
  // agent decides whether an upstream socket is pooled.
  it("opens a new upstream connection for every request instead of reusing an idle one", async () => {
    let connections = 0;
    const upstream = http.createServer((req, res) => res.end("ok"));
    upstream.on("connection", () => (connections += 1));
    const upPort = await listen(upstream);
    const proxyPort = await listen(http.createServer((req, res) => forward(req, res, upPort)));

    for (let i = 0; i < 3; i += 1) {
      const r = await get(proxyPort);
      expect(r.status).toBe(200);
      expect(r.body).toBe("ok");
    }
    expect(connections).toBe(3);
  });

  it("ends the browser's response when the upstream dies after the headers", async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("partial");
      setTimeout(() => res.socket.destroy(), 20);
    });
    const upPort = await listen(upstream);
    const proxyPort = await listen(http.createServer((req, res) => forward(req, res, upPort)));

    const started = Date.now();
    const r = await get(proxyPort);
    expect(r.ended).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
