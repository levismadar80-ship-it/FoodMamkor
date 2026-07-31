"""MEH-1772 chunk 3 self-QA: minimal stand-in for the backend.

The producer page fetches SERVER-side (page.js -> serverFetch -> API_URL), so a
Playwright page.route() mock cannot reach it — the request never leaves Node.
This serves the one payload the delivery block needs, on the port
NEXT_PUBLIC_API_URL defaults to.

The fixture mirrors the seed change exactly: a business rate of 35 with two
area overrides (20 / 40) and one row that states none (inherits 35).
"""

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

PRODUCER = {
    "id": "11111111-1111-1111-1111-111111111111",
    "slug": "qa-variance",
    "name": "גבינות הגולן",
    "description": "בדיקת עלות משלוח פר-אזור",
    "city": "קצרין",
    "lat": 32.994,
    "lng": 35.691,
    "phone": "0529876543",
    "status": "approved",
    "offers_delivery": True,
    "delivery_nationwide": False,
    "pickup_points": False,
    "delivery_excluded_cities": [],
    # MEH-1577 business-wide rate — ירושלים below inherits this.
    "delivery_fee": 35,
    "free_delivery_above": None,
    "delivery_areas": [
        {
            "id": "a1",
            "city": "תל אביב",
            "min_order": 300,
            "delivery_day": "חמישי",
            "delivery_fee": 20,
        },
        {
            "id": "a2",
            "city": "חיפה",
            "min_order": 250,
            "delivery_day": "חמישי",
            "delivery_fee": 40,
        },
        # no delivery_fee key at all -> NULL -> inherits 35
        {"id": "a3", "city": "ירושלים", "min_order": 300, "delivery_day": "חמישי"},
    ],
    "categories": [],
    "products": [],
    "locations": [],
    "images": [],
}

# Same producer with every area on the same fee — the "uniform" control.
UNIFORM = json.loads(json.dumps(PRODUCER))
UNIFORM["id"] = "22222222-2222-2222-2222-222222222222"
UNIFORM["slug"] = "qa-uniform"
for a in UNIFORM["delivery_areas"]:
    a["delivery_fee"] = 35


class H(BaseHTTPRequestHandler):
    def _send(self, payload, code=200):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.endswith(UNIFORM["id"]) or path.endswith(UNIFORM["slug"]):
            return self._send(UNIFORM)
        if "/producers/" in path:
            return self._send(PRODUCER)
        if path.rstrip("/").endswith("/producers"):
            return self._send([PRODUCER, UNIFORM])
        # Everything else the page may poke at: an empty list is harmless.
        return self._send([])

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8000), H).serve_forever()
