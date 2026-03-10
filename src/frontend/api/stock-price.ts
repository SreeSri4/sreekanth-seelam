import { type IncomingMessage, type ServerResponse } from "http";

// ─── NSE Headers ──────────────────────────────────────────────────────────

const NSE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
  Connection: "keep-alive",
};

// ─── Normalise Symbol ─────────────────────────────────────────────────────

function normaliseSymbol(raw: string): string {
  let s = raw.trim().toUpperCase();
  for (const prefix of ["@NSE:", "@BSE:", "NSE:", "BSE:", "@"]) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  if (s.endsWith(".NS") || s.endsWith(".BO")) s = s.slice(0, -3);
  return s;
}

// ─── NSE Fetch (server-side — no CORS) ───────────────────────────────────

async function fetchNSEPrice(symbol: string): Promise<number | null> {
  const encoded = encodeURIComponent(symbol);

  // Step 1: hit homepage to get session cookies
  let cookies = "";
  try {
    const homeRes = await fetch("https://www.nseindia.com", {
      headers: {
        ...NSE_HEADERS,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const raw = homeRes.headers.get("set-cookie") ?? "";
    // Extract individual cookie names/values (strip attributes)
    cookies = raw
      .split(/,(?=[^ ])/g)
      .map((c) => c.split(";")[0].trim())
      .join("; ");
  } catch {
    return null;
  }

  const apiHeaders = {
    ...NSE_HEADERS,
    Accept: "application/json",
    Referer: "https://www.nseindia.com/",
    Cookie: cookies,
  };

  // Step 2a: quote-equity endpoint
  try {
    const res = await fetch(
      `https://www.nseindia.com/api/quote-equity?symbol=${encoded}`,
      { headers: apiHeaders, signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        priceInfo?: { lastPrice?: number };
      };
      const price = data?.priceInfo?.lastPrice;
      if (typeof price === "number" && price > 0) return price;
    }
  } catch { /* fall through */ }

  // Step 2b: getQuotes fallback
  try {
    const res = await fetch(
      `https://www.nseindia.com/api/getQuotes?symbol=${encoded}&series=EQ`,
      { headers: apiHeaders, signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{ lastPrice?: string | number; ltp?: string | number }>;
      };
      const item = data?.data?.[0];
      if (item) {
        const raw = item.lastPrice ?? item.ltp;
        if (raw !== undefined) {
          const price = parseFloat(String(raw).replace(/,/g, ""));
          if (!isNaN(price) && price > 0) return price;
        }
      }
    }
  } catch { /* exhausted */ }

  return null;
}

// ─── Handler ──────────────────────────────────────────────────────────────

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Parse symbol from query string
  const url      = new URL(req.url ?? "/", "http://localhost");
  const rawSymbol = url.searchParams.get("symbol") ?? "";

  if (!rawSymbol.trim()) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing symbol parameter" }));
    return;
  }

  const symbol = normaliseSymbol(rawSymbol);
  const price  = await fetchNSEPrice(symbol);

  res.setHeader("Content-Type", "application/json");

  if (price === null) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Price not found for ${symbol}` }));
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ price, symbol, exchange: "NSE" }));
}
