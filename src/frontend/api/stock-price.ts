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

// ─── NextApi quote (works for SGBs, series GB; also equities, series EQ) ──

async function fetchNextApiPrice(
  symbol: string,
  series: string,
  headers: Record<string, string>,
  trace: string[],
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=${series}&symbol=${encodeURIComponent(symbol)}`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    trace.push(`nextapi-${series}:${res.status}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      equityResponse?: Array<{
        orderBook?: { lastPrice?: number };
        tradeInfo?: { lastPrice?: number };
      }>;
    };
    const item = data?.equityResponse?.[0];
    const price = item?.orderBook?.lastPrice ?? item?.tradeInfo?.lastPrice;
    return typeof price === "number" && price > 0 ? price : null;
  } catch (e) {
    trace.push(`nextapi-${series}:error ${(e as Error).message}`);
    return null;
  }
}

// ─── NSE Fetch (server-side — no CORS) ───────────────────────────────────

async function fetchNSEPrice(
  symbol: string,
  trace: string[] = [],
): Promise<number | null> {
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
    const h = homeRes.headers as Headers & { getSetCookie?: () => string[] };
    const list =
      typeof h.getSetCookie === "function"
        ? h.getSetCookie()
        : (homeRes.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/g);
    cookies = list
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    trace.push(`home:${homeRes.status} cookies:${list.length}`);
  } catch (e) {
    trace.push(`home:error ${(e as Error).message}`);
    return null;
  }

  const apiHeaders = {
    ...NSE_HEADERS,
    Accept: "application/json",
    Referer: "https://www.nseindia.com/",
    Cookie: cookies,
  };

  // Step 1b: visit the quote page to pick up extra session cookies
  try {
    const pageRes = await fetch(
      `https://www.nseindia.com/get-quotes/equity?symbol=${encoded}`,
      { headers: apiHeaders, signal: AbortSignal.timeout(10_000) },
    );
    const h = pageRes.headers as Headers & { getSetCookie?: () => string[] };
    const extra = (h.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean);
    if (extra.length) apiHeaders.Cookie = `${cookies}; ${extra.join("; ")}`;
    trace.push(`page:${pageRes.status} extra:${extra.length}`);
  } catch (e) {
    trace.push(`page:error ${(e as Error).message}`);
  }

  // Step 2-SGB: Sovereign Gold Bonds (series GB) use NextApi
  if (symbol.startsWith("SGB")) {
    const p = await fetchNextApiPrice(symbol, "GB", apiHeaders, trace);
    if (p !== null) return p;
  }

  // Step 2a: quote-equity endpoint
  try {
    const res = await fetch(
      `https://www.nseindia.com/api/quote-equity?symbol=${encoded}`,
      { headers: apiHeaders, signal: AbortSignal.timeout(10_000) },
    );
    trace.push(`quote-equity:${res.status}`);
    if (res.ok) {
      const data = (await res.json()) as {
        priceInfo?: { lastPrice?: number };
      };
      const price = data?.priceInfo?.lastPrice;
      if (typeof price === "number" && price > 0) return price;
    }
  } catch (e) {
    trace.push(`quote-equity:error ${(e as Error).message}`);
  }

  // Step 2b: getQuotes fallback
  try {
    const res = await fetch(
      `https://www.nseindia.com/api/getQuotes?symbol=${encoded}&series=EQ`,
      { headers: apiHeaders, signal: AbortSignal.timeout(10_000) },
    );
    trace.push(`getQuotes:${res.status}`);
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
  } catch (e) {
    trace.push(`getQuotes:error ${(e as Error).message}`);
  }

  // Step 2c: NextApi fallback for non-SGB symbols (series EQ)
  if (!symbol.startsWith("SGB")) {
    return fetchNextApiPrice(symbol, "EQ", apiHeaders, trace);
  }

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
  const trace: string[] = [];
  const price  = await fetchNSEPrice(symbol, trace);
  const debug  = url.searchParams.get("debug") === "1";

  res.setHeader("Content-Type", "application/json");

  if (price === null) {
    res.statusCode = 404;
    res.end(
      JSON.stringify({
        error: `Price not found for ${symbol}`,
        ...(debug ? { trace } : {}),
      }),
    );
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ price, symbol, exchange: "NSE" }));
}
