import json
import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        # ── Parse query params ─────────────────────────────────────────
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        raw_symbol = (params.get("symbol", [""])[0]).strip().upper()

        if not raw_symbol:
            self._json(400, {"error": "Missing symbol parameter"})
            return

        # Normalise symbol — strip exchange prefixes and suffixes
        symbol = raw_symbol
        for prefix in ("@NSE:", "@BSE:", "NSE:", "BSE:", "@"):
            if symbol.startswith(prefix):
                symbol = symbol[len(prefix):]
                break
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            symbol = symbol[:-3]

        # ── Fetch price ────────────────────────────────────────────────
        price = fetch_nse_price(symbol)

        if price is None:
            self._json(404, {"error": f"Price not found for {symbol}"})
            return

        self._json(200, {"price": price, "symbol": symbol, "exchange": "NSE"})

    # ── Helpers ────────────────────────────────────────────────────────

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass  # suppress default request logging


# ─── NSE Fetch Logic ───────────────────────────────────────────────────────

HEADERS_BASE = {
    "User-Agent":      (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
}


def fetch_nse_price(symbol: str) -> float | None:
    cookie_jar = http.cookiejar.CookieJar()
    opener     = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar)
    )

    # Step 1: acquire session cookie
    home_req = urllib.request.Request(
        "https://www.nseindia.com",
        headers={
            **HEADERS_BASE,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        opener.open(home_req, timeout=10)
    except Exception:
        return None

    encoded = urllib.parse.quote(symbol)

    # Step 2a: quote-equity endpoint
    try:
        req = urllib.request.Request(
            f"https://www.nseindia.com/api/quote-equity?symbol={encoded}",
            headers={
                **HEADERS_BASE,
                "Accept":  "application/json",
                "Referer": "https://www.nseindia.com/",
            },
        )
        with opener.open(req, timeout=10) as resp:
            data  = json.loads(resp.read())
            price = (data.get("priceInfo") or {}).get("lastPrice")
            if isinstance(price, (int, float)) and price > 0:
                return float(price)
    except Exception:
        pass

    # Step 2b: getQuotes fallback
    try:
        req = urllib.request.Request(
            f"https://www.nseindia.com/api/getQuotes?symbol={encoded}&series=EQ",
            headers={
                **HEADERS_BASE,
                "Accept":  "application/json",
                "Referer": "https://www.nseindia.com/",
            },
        )
        with opener.open(req, timeout=10) as resp:
            data  = json.loads(resp.read())
            items = data.get("data") or []
            if items:
                raw = items[0].get("lastPrice") or items[0].get("ltp")
                if raw is not None:
                    price = float(str(raw).replace(",", ""))
                    if price > 0:
                        return price
    except Exception:
        pass

    return None
