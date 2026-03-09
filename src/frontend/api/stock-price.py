import json
import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar

def handler(request, response):
    """
    GET /api/stock-price?symbol=ICICIBANK
    Returns: { "price": 1234.56, "symbol": "ICICIBANK", "exchange": "NSE" }
    """
    # ── CORS headers ──────────────────────────────────────────────────────
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"

    if request.method == "OPTIONS":
        response.status_code = 204
        return

    if request.method != "GET":
        response.status_code = 405
        response.write(json.dumps({"error": "Method not allowed"}))
        return

    # ── Parse symbol ──────────────────────────────────────────────────────
    raw_symbol = (request.query.get("symbol") or "").strip().upper()
    if not raw_symbol:
        response.status_code = 400
        response.write(json.dumps({"error": "Missing symbol parameter"}))
        return

    # Normalise: strip NSE: prefix and .NS suffix
    symbol = raw_symbol
    for prefix in ("NSE:", "@NSE:", "BSE:", "@BSE:", "@"):
        if symbol.startswith(prefix):
            symbol = symbol[len(prefix):]
            break
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        symbol = symbol[:-3]

    # ── Fetch from NSE ────────────────────────────────────────────────────
    price = fetch_nse_price(symbol)

    if price is None:
        response.status_code = 404
        response.write(json.dumps({"error": f"Price not found for {symbol}"}))
        return

    response.status_code = 200
    response.headers["Content-Type"] = "application/json"
    response.write(json.dumps({
        "price":    price,
        "symbol":   symbol,
        "exchange": "NSE",
    }))


def fetch_nse_price(symbol: str) -> float | None:
    """
    Fetches live price from NSE India using a two-step approach:
    1. Hit NSE homepage to obtain session cookies
    2. Call the quote-equity API with those cookies
    """
    headers_base = {
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection":      "keep-alive",
    }

    # Step 1: get session cookie from NSE homepage
    cookie_jar = http.cookiejar.CookieJar()
    opener     = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar)
    )

    home_req = urllib.request.Request(
        "https://www.nseindia.com",
        headers={
            **headers_base,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        opener.open(home_req, timeout=10)
    except Exception:
        return None  # can't reach NSE at all

    # Step 2: fetch stock quote
    encoded = urllib.parse.quote(symbol)
    api_url  = f"https://www.nseindia.com/api/quote-equity?symbol={encoded}"

    api_req = urllib.request.Request(
        api_url,
        headers={
            **headers_base,
            "Accept":  "application/json",
            "Referer": "https://www.nseindia.com/",
        },
    )
    try:
        with opener.open(api_req, timeout=10) as resp:
            body = resp.read()
            data = json.loads(body)
            price = (data.get("priceInfo") or {}).get("lastPrice")
            if isinstance(price, (int, float)) and price > 0:
                return float(price)
    except Exception:
        pass

    # Fallback: try the getQuotes endpoint
    api_url2 = f"https://www.nseindia.com/api/getQuotes?symbol={encoded}&series=EQ"
    api_req2  = urllib.request.Request(
        api_url2,
        headers={
            **headers_base,
            "Accept":  "application/json",
            "Referer": "https://www.nseindia.com/",
        },
    )
    try:
        with opener.open(api_req2, timeout=10) as resp:
            body = resp.read()
            data = json.loads(body)
            # Response: { "data": [{ "lastPrice": "1234.56", ... }] }
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
