/**
 * Fetch latest NAV for a mutual fund scheme from mfapi.in
 */
export async function fetchMFNAV(schemeCode: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    // Response: { data: [{ nav: "58.75", date: "..." }, ...] }
    const navStr = json?.data?.[0]?.nav;
    if (!navStr) return null;
    const nav = Number.parseFloat(navStr);
    return Number.isNaN(nav) ? null : nav;
  } catch {
    return null;
  }
}

export interface MFSearchResult {
  schemeCode: string;
  schemeName: string;
}

/**
 * Search mutual funds by query from mfapi.in
 */
export async function searchMutualFunds(
  query: string,
): Promise<MFSearchResult[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    return json
      .slice(0, 20)
      .map((item: { schemeCode?: string | number; schemeName?: string }) => ({
        schemeCode: String(item.schemeCode ?? ""),
        schemeName: String(item.schemeName ?? ""),
      }))
      .filter((r) => r.schemeCode && r.schemeName);
  } catch {
    return [];
  }
}

/**
 * Fetch latest NAV for an NPS scheme directly from npsnav.in via a CORS proxy.
 */
export async function fetchNPSNav(pfmId: string): Promise<number | null> {
  const targetUrl = `https://npsnav.in/api/${encodeURIComponent(pfmId)}`;

  // Strategy 1: allorigins /get endpoint
  try {
    const res = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (res.ok) {
      const json = (await res.json()) as { contents?: string };
      const text = (json?.contents ?? "").trim();
      if (text) {
        const nav = Number.parseFloat(text);
        if (!Number.isNaN(nav) && nav > 0) return nav;
      }
    }
  } catch { /* fall through */ }

  // Strategy 2: allorigins /raw endpoint
  try {
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text) {
        const nav = Number.parseFloat(text);
        if (!Number.isNaN(nav) && nav > 0) return nav;
      }
    }
  } catch { /* fall through */ }

  // Strategy 3: corsproxy.io
  try {
    const res = await fetch(
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text) {
        const nav = Number.parseFloat(text);
        if (!Number.isNaN(nav) && nav > 0) return nav;
      }
    }
  } catch { /* fall through */ }

  // Strategy 4: direct fetch
  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text) {
        const nav = Number.parseFloat(text);
        if (!Number.isNaN(nav) && nav > 0) return nav;
      }
    }
  } catch { /* exhausted */ }

  return null;
}

/**
 * Fetch current price for an SGB symbol from the CloudFront SGB JSON.
 */
export async function fetchSGBPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch("https://d1rkri6jugbbi2.cloudfront.net/sgb.json", {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const issues: Record<string, unknown>[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.issues)
        ? json.issues
        : [];
    const entry = issues.find(
      (item) =>
        typeof item.symbol === "string" &&
        item.symbol.toLowerCase() === symbol.toLowerCase(),
    );
    if (!entry) return null;
    const rawPrice =
      entry.ltp ?? entry.nav ?? entry.price ?? entry.currentPrice ?? entry.lastPrice;
    if (rawPrice === undefined || rawPrice === null) return null;
    const price = Number.parseFloat(String(rawPrice));
    return Number.isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

// ─── Stock Price ───────────────────────────────────────────────────────────
//
// Strategy 1: our own Vercel Python serverless function at /api/stock-price
//             which runs server-side and handles NSE session cookies without CORS issues.
// Strategy 2: stockanalysis.com API as fallback (CORS-friendly, no proxy needed)
//
// Accepted symbol formats (all normalised server-side):
//   NSE:ICICIBANK   ICICIBANK.NS   ICICIBANK   @NSE:ICICIBANK

function toStockAnalysisSymbol(symbol: string): string {
  const trimmed = symbol.trim();

  // Already has @ prefix
  if (trimmed.startsWith("@")) return trimmed.toUpperCase();

  const upper = trimmed.toUpperCase();

  // EXCHANGE:TICKER format → @EXCHANGE:TICKER
  if (upper.includes(":")) return `@${upper}`;

  // Legacy Yahoo .NS / .BO suffixes
  if (upper.endsWith(".NS")) return `@NSE:${upper.slice(0, -3)}`;
  if (upper.endsWith(".BO")) return `@BSE:${upper.slice(0, -3)}`;

  // US or plain symbol – pass through as-is
  return upper;
}

/**
 * Fetch current stock price via our Python serverless function /api/stock-price.
 * Falls back to stockanalysis.com if the serverless function is unavailable.
 */
export async function fetchStockPrice(symbol: string): Promise<number | null> {
  // Strategy 1: our own Python serverless function (NSE server-side, no CORS)
  try {
    const res = await fetch(
      `/api/stock-price?symbol=${encodeURIComponent(symbol)}`,
      {
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/json" },
      },
    );
    if (res.ok) {
      const json = (await res.json()) as { price?: number };
      if (typeof json.price === "number" && json.price > 0) return json.price;
    }
  } catch { /* fall through to stockanalysis fallback */ }

  // Strategy 2: stockanalysis.com fallback (browser fetch, no proxy)
  try {
    const saSymbol = toStockAnalysisSymbol(symbol);
    const url = `https://stockanalysis.com/api/quotes/prices?s=${encodeURIComponent(saSymbol)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const json = await res.json();
      const price = (json as { data?: Array<{ price?: number }> })?.data?.[0]?.price;
      if (typeof price === "number" && price > 0) return price;
    }
  } catch { /* exhausted all strategies */ }

  return null;
}
