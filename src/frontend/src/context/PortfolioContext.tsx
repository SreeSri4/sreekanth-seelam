import {
  calcCompoundInterest,
  calcSimpleInterest,
  freqToTimesPerYear,
  todayStr,
  yearsBetween,
} from "@/utils/format";
import {
  fetchMFNAV,
  fetchNPSNav,
  fetchSGBPrice,
  fetchStockPrice,
} from "@/utils/priceService";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MutualFundHolding {
  id: string;
  schemeCode: string;
  schemeName: string;
  units: number;
  purchaseNAV: number;
  purchaseDate: string;
  currentNAV: number;
  lastUpdated: number;
}

export interface StockHolding {
  id: string;
  symbol: string;
  exchange: string;
  companyName: string;
  quantity: number;
  buyPrice: number;
  buyDate: string;
  currentPrice: number;
  assetType: "stock" | "etf";
  lastUpdated: number;
}

export interface DebtHolding {
  id: string;
  debtType: "epf" | "ppf" | "fd" | "other";
  name: string;
  principal: number;
  interestRate: number;
  startDate: string;
  maturityDate: string;
  currentValue: number;
  metadata: Record<string, string | number | boolean>;
  lastUpdated: number;
}

export interface NpsHolding {
  id: string;
  pfmId: string;
  schemeName: string;
  tier: "I" | "II";
  units: number;
  purchaseNAV: number;
  purchaseDate: string;
  currentNAV: number;
  lastUpdated: number;
}

export interface SgbHolding {
  id: string;
  symbol: string;
  name: string;
  units: number;
  issuePricePerGram: number;
  purchaseDate: string;
  maturityDate: string;
  currentPricePerGram: number;
  lastUpdated: number;
}

export interface Transaction {
  id: string;
  assetType: "mutualfund" | "stock" | "etf" | "debt";
  assetName: string;
  transactionType: "buy" | "sell";
  quantity: number;
  price: number;
  date: string;
  notes: string;
}

// ─── Computed Totals ───────────────────────────────────────────────────────

export interface PortfolioTotals {
  mfValue: number;
  mfInvested: number;
  stockValue: number;
  stockInvested: number;
  etfValue: number;
  etfInvested: number;
  debtValue: number;
  debtInvested: number;
  npsValue: number;
  npsInvested: number;
  sgbValue: number;
  sgbInvested: number;
  totalValue: number;
  totalInvested: number;
  totalGain: number;
  totalGainPercent: number;
}

// ─── Context Interface ─────────────────────────────────────────────────────

interface PortfolioContextValue {
  mutualFunds: MutualFundHolding[];
  stocks: StockHolding[];
  debtHoldings: DebtHolding[];
  npsHoldings: NpsHolding[];
  sgbHoldings: SgbHolding[];
  transactions: Transaction[];
  totals: PortfolioTotals;
  isRefreshingMF: boolean;
  isRefreshingStocks: boolean;
  isRefreshingNPS: boolean;
  isRefreshingSGB: boolean;
  lastRefreshed: number | null;
  isLoadingData: boolean;

  addMutualFund: (
    holding: Omit<MutualFundHolding, "id" | "lastUpdated">,
  ) => Promise<void>;
  updateMutualFund: (
    id: string,
    updates: Partial<MutualFundHolding>,
  ) => Promise<void>;
  deleteMutualFund: (id: string) => Promise<void>;

  addStock: (
    holding: Omit<StockHolding, "id" | "lastUpdated">,
  ) => Promise<void>;
  updateStock: (id: string, updates: Partial<StockHolding>) => Promise<void>;
  deleteStock: (id: string) => Promise<void>;

  addDebt: (holding: Omit<DebtHolding, "id" | "lastUpdated">) => Promise<void>;
  updateDebt: (id: string, updates: Partial<DebtHolding>) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;

  addNps: (holding: Omit<NpsHolding, "id" | "lastUpdated">) => Promise<void>;
  updateNps: (id: string, updates: Partial<NpsHolding>) => Promise<void>;
  deleteNps: (id: string) => Promise<void>;

  addSgb: (holding: Omit<SgbHolding, "id" | "lastUpdated">) => Promise<void>;
  updateSgb: (id: string, updates: Partial<SgbHolding>) => Promise<void>;
  deleteSgb: (id: string) => Promise<void>;

  addTransaction: (tx: Omit<Transaction, "id">) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  refreshMFPrices: () => Promise<void>;
  refreshStockPrices: () => Promise<void>;
  refreshNPSPrices: () => Promise<void>;
  refreshSGBPrices: () => Promise<void>;

  clearAllData: () => void;
  exportData: () => void;
  importData: (jsonString: string) => boolean;
}

// ─── SessionStorage helpers ────────────────────────────────────────────────

const SESSION_KEYS = {
  mutualFunds: "portfolio_mf",
  stocks: "portfolio_stocks",
  debt: "portfolio_debt",
  nps: "portfolio_nps",
  sgb: "portfolio_sgb",
  transactions: "portfolio_txs",
} as const;

function loadFromSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

// ─── Debt current value helper ─────────────────────────────────────────────

function calcDebtCurrentValueForTotals(h: DebtHolding): number {
  const today = todayStr();
  const years = yearsBetween(h.startDate, today);
  switch (h.debtType) {
    case "fd": {
      const freq = freqToTimesPerYear(
        String(h.metadata.compoundingFrequency || "quarterly"),
      );
      return calcCompoundInterest(h.principal, h.interestRate, years, freq);
    }
    case "ppf":
    case "epf":
      return h.currentValue;
    default:
      return calcSimpleInterest(h.principal, h.interestRate, years);
  }
}

// ─── Compute Totals ────────────────────────────────────────────────────────

function computeTotals(
  mfs: MutualFundHolding[],
  stocks: StockHolding[],
  debt: DebtHolding[],
  nps: NpsHolding[],
  sgb: SgbHolding[],
): PortfolioTotals {
  const mfValue = mfs.reduce((s, h) => s + h.units * h.currentNAV, 0);
  const mfInvested = mfs.reduce((s, h) => s + h.units * h.purchaseNAV, 0);

  const allStocks = stocks.filter((s) => s.assetType === "stock");
  const allEtfs = stocks.filter((s) => s.assetType === "etf");

  const stockValue = allStocks.reduce(
    (s, h) => s + h.quantity * h.currentPrice,
    0,
  );
  const stockInvested = allStocks.reduce(
    (s, h) => s + h.quantity * h.buyPrice,
    0,
  );
  const etfValue = allEtfs.reduce(
    (s, h) => s + h.quantity * h.currentPrice,
    0,
  );
  const etfInvested = allEtfs.reduce((s, h) => s + h.quantity * h.buyPrice, 0);

  const debtValue = debt.reduce(
    (s, h) => s + calcDebtCurrentValueForTotals(h),
    0,
  );
  const debtInvested = debt.reduce((s, h) => s + h.principal, 0);

  const npsValue = nps.reduce((s, h) => s + h.units * h.currentNAV, 0);
  const npsInvested = nps.reduce((s, h) => s + h.units * h.purchaseNAV, 0);

  const sgbValue = sgb.reduce(
    (s, h) => s + h.units * h.currentPricePerGram,
    0,
  );
  const sgbInvested = sgb.reduce(
    (s, h) => s + h.units * h.issuePricePerGram,
    0,
  );

  const totalValue =
    mfValue + stockValue + etfValue + debtValue + npsValue + sgbValue;
  const totalInvested =
    mfInvested +
    stockInvested +
    etfInvested +
    debtInvested +
    npsInvested +
    sgbInvested;
  const totalGain = totalValue - totalInvested;
  const totalGainPercent =
    totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  return {
    mfValue,
    mfInvested,
    stockValue,
    stockInvested,
    etfValue,
    etfInvested,
    debtValue,
    debtInvested,
    npsValue,
    npsInvested,
    sgbValue,
    sgbInvested,
    totalValue,
    totalInvested,
    totalGain,
    totalGainPercent,
  };
}

// ─── Context ───────────────────────────────────────────────────────────────

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface PortfolioProviderProps {
  children: ReactNode;
}

export function PortfolioProvider({ children }: PortfolioProviderProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [mutualFunds, setMutualFunds] = useState<MutualFundHolding[]>(() =>
    loadFromSession(SESSION_KEYS.mutualFunds, []),
  );
  const [stocks, setStocks] = useState<StockHolding[]>(() =>
    loadFromSession(SESSION_KEYS.stocks, []),
  );
  const [debtHoldings, setDebt] = useState<DebtHolding[]>(() =>
    loadFromSession(SESSION_KEYS.debt, []),
  );
  const [npsHoldings, setNps] = useState<NpsHolding[]>(() =>
    loadFromSession(SESSION_KEYS.nps, []),
  );
  const [sgbHoldings, setSgb] = useState<SgbHolding[]>(() =>
    loadFromSession(SESSION_KEYS.sgb, []),
  );
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    loadFromSession(SESSION_KEYS.transactions, []),
  );
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [isRefreshingMF, setRefreshingMF] = useState(false);
  const [isRefreshingStocks, setRefreshingStocks] = useState(false);
  const [isRefreshingNPS, setRefreshingNPS] = useState(false);
  const [isRefreshingSGB, setRefreshingSGB] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

  // ── Blob fetch on mount (only if sessionStorage is empty) ──────────────
  const hasFetchedBlob = useRef(false);

  useEffect(() => {
    if (hasFetchedBlob.current) return;
    hasFetchedBlob.current = true;

    // Skip blob fetch if we already have data in this session
    const hasSession = sessionStorage.getItem(SESSION_KEYS.mutualFunds);
    if (hasSession) {
      console.log("📦 Using sessionStorage data");
      return;
    }

    void (async () => {
      setIsLoadingData(true);
      try {
        console.log("🌐 Fetching from blob...");
        const res = await fetch("/api/portfolio");
        if (!res.ok) {
          console.warn("Blob fetch failed:", res.status);
          return;
        }
        const payload = await res.json();
        console.log("✅ Blob data loaded:", payload);

        if (!payload?.version) return;

        const mfs: MutualFundHolding[] = Array.isArray(payload.mutualFunds)
          ? payload.mutualFunds
          : [];
        const sts: StockHolding[] = Array.isArray(payload.stocks)
          ? payload.stocks
          : [];
        const dbt: DebtHolding[] = Array.isArray(payload.debtHoldings)
          ? payload.debtHoldings
          : [];
        const nps: NpsHolding[] = Array.isArray(payload.npsHoldings)
          ? payload.npsHoldings
          : [];
        const sgb: SgbHolding[] = Array.isArray(payload.sgbHoldings)
          ? payload.sgbHoldings
          : [];
        const txs: Transaction[] = Array.isArray(payload.transactions)
          ? payload.transactions
          : [];

        setMutualFunds(mfs);
        setStocks(sts);
        setDebt(dbt);
        setNps(nps);
        setSgb(sgb);
        setTransactions(txs);

        // Persist to session so refresh doesn't re-fetch
        saveToSession(SESSION_KEYS.mutualFunds, mfs);
        saveToSession(SESSION_KEYS.stocks, sts);
        saveToSession(SESSION_KEYS.debt, dbt);
        saveToSession(SESSION_KEYS.nps, nps);
        saveToSession(SESSION_KEYS.sgb, sgb);
        saveToSession(SESSION_KEYS.transactions, txs);
      } catch (err) {
        console.error("❌ Blob load error:", err);
      } finally {
        setIsLoadingData(false);
      }
    })();
  }, []);

  // ── Auto-save to blob on data changes (debounced 2s) ──────────────────
  const isMounted = useRef(false);
  useEffect(() => {
    // Skip the very first render to avoid overwriting blob with empty state
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    // Don't save while we're still loading from blob
    if (isLoadingData) return;

    const timeoutId = setTimeout(async () => {
      try {
        await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            mutualFunds,
            stocks,
            debtHoldings,
            npsHoldings,
            sgbHoldings,
            transactions,
          }),
        });
        console.log("💾 Auto-saved to blob");
      } catch (err) {
        console.error("❌ Blob save error:", err);
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [
    mutualFunds,
    stocks,
    debtHoldings,
    npsHoldings,
    sgbHoldings,
    transactions,
    isLoadingData,
  ]);

  // ── Persist to sessionStorage on state changes ─────────────────────────
  useEffect(() => {
    saveToSession(SESSION_KEYS.mutualFunds, mutualFunds);
  }, [mutualFunds]);

  useEffect(() => {
    saveToSession(SESSION_KEYS.stocks, stocks);
  }, [stocks]);

  useEffect(() => {
    saveToSession(SESSION_KEYS.debt, debtHoldings);
  }, [debtHoldings]);

  useEffect(() => {
    saveToSession(SESSION_KEYS.nps, npsHoldings);
  }, [npsHoldings]);

  useEffect(() => {
    saveToSession(SESSION_KEYS.sgb, sgbHoldings);
  }, [sgbHoldings]);

  useEffect(() => {
    saveToSession(SESSION_KEYS.transactions, transactions);
  }, [transactions]);

  // ── Computed totals ────────────────────────────────────────────────────
  const totals = computeTotals(
    mutualFunds,
    stocks,
    debtHoldings,
    npsHoldings,
    sgbHoldings,
  );

  // ── CRUD: Mutual Funds ─────────────────────────────────────────────────
  const addMutualFund = useCallback(
    async (holding: Omit<MutualFundHolding, "id" | "lastUpdated">) => {
      const h: MutualFundHolding = {
        ...holding,
        id: uid(),
        lastUpdated: Date.now(),
      };
      setMutualFunds((prev) => [...prev, h]);
    },
    [],
  );

  const updateMutualFund = useCallback(
    async (id: string, updates: Partial<MutualFundHolding>) => {
      setMutualFunds((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, ...updates, lastUpdated: Date.now() } : h,
        ),
      );
    },
    [],
  );

  const deleteMutualFund = useCallback(async (id: string) => {
    setMutualFunds((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // ── CRUD: Stocks ───────────────────────────────────────────────────────
  const addStock = useCallback(
    async (holding: Omit<StockHolding, "id" | "lastUpdated">) => {
      const h: StockHolding = {
        ...holding,
        id: uid(),
        lastUpdated: Date.now(),
      };
      setStocks((prev) => [...prev, h]);
    },
    [],
  );

  const updateStock = useCallback(
    async (id: string, updates: Partial<StockHolding>) => {
      setStocks((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, ...updates, lastUpdated: Date.now() } : h,
        ),
      );
    },
    [],
  );

  const deleteStock = useCallback(async (id: string) => {
    setStocks((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // ── CRUD: Debt ─────────────────────────────────────────────────────────
  const addDebt = useCallback(
    async (holding: Omit<DebtHolding, "id" | "lastUpdated">) => {
      const h: DebtHolding = {
        ...holding,
        id: uid(),
        lastUpdated: Date.now(),
      };
      setDebt((prev) => [...prev, h]);
    },
    [],
  );

  const updateDebt = useCallback(
    async (id: string, updates: Partial<DebtHolding>) => {
      setDebt((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, ...updates, lastUpdated: Date.now() } : h,
        ),
      );
    },
    [],
  );

  const deleteDebt = useCallback(async (id: string) => {
    setDebt((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // ── CRUD: NPS ──────────────────────────────────────────────────────────
  const addNps = useCallback(
    async (holding: Omit<NpsHolding, "id" | "lastUpdated">) => {
      const h: NpsHolding = {
        ...holding,
        id: uid(),
        lastUpdated: Date.now(),
      };
      setNps((prev) => [...prev, h]);
    },
    [],
  );

  const updateNps = useCallback(
    async (id: string, updates: Partial<NpsHolding>) => {
      setNps((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, ...updates, lastUpdated: Date.now() } : h,
        ),
      );
    },
    [],
  );

  const deleteNps = useCallback(async (id: string) => {
    setNps((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // ── CRUD: SGB ──────────────────────────────────────────────────────────
  const addSgb = useCallback(
    async (holding: Omit<SgbHolding, "id" | "lastUpdated">) => {
      const h: SgbHolding = {
        ...holding,
        id: uid(),
        lastUpdated: Date.now(),
      };
      setSgb((prev) => [...prev, h]);
    },
    [],
  );

  const updateSgb = useCallback(
    async (id: string, updates: Partial<SgbHolding>) => {
      setSgb((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, ...updates, lastUpdated: Date.now() } : h,
        ),
      );
    },
    [],
  );

  const deleteSgb = useCallback(async (id: string) => {
    setSgb((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // ── CRUD: Transactions ─────────────────────────────────────────────────
  const addTransaction = useCallback(async (tx: Omit<Transaction, "id">) => {
    const t: Transaction = { ...tx, id: uid() };
    setTransactions((prev) => [t, ...prev]);
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Price Refresh ──────────────────────────────────────────────────────
  const mfRef = useRef(mutualFunds);
  const stocksRef = useRef(stocks);
  const npsRef = useRef(npsHoldings);
  const sgbRef = useRef(sgbHoldings);

  useEffect(() => { mfRef.current = mutualFunds; }, [mutualFunds]);
  useEffect(() => { stocksRef.current = stocks; }, [stocks]);
  useEffect(() => { npsRef.current = npsHoldings; }, [npsHoldings]);
  useEffect(() => { sgbRef.current = sgbHoldings; }, [sgbHoldings]);

  const refreshMFPrices = useCallback(async () => {
    setRefreshingMF(true);
    try {
      const uniqueSchemeCodes = [
        ...new Set(mfRef.current.map((h) => h.schemeCode)),
      ];
      const navMap = new Map<string, number>();
      for (const schemeCode of uniqueSchemeCodes) {
        const nav = await fetchMFNAV(schemeCode);
        if (nav !== null) navMap.set(schemeCode, nav);
      }
      const updated = mfRef.current.map((mf) => {
        const nav = navMap.get(mf.schemeCode);
        return nav !== undefined
          ? { ...mf, currentNAV: nav, lastUpdated: Date.now() }
          : mf;
      });
      setMutualFunds(updated);
      const updatedCount = updated.filter(
        (u, i) => u.currentNAV !== mfRef.current[i]?.currentNAV,
      ).length;
      if (updatedCount > 0) {
        toast.success(`Updated NAV for ${updatedCount} fund(s).`);
      }
    } finally {
      setRefreshingMF(false);
      setLastRefreshed(Date.now());
    }
  }, []);

  const refreshStockPrices = useCallback(async () => {
    setRefreshingStocks(true);
    try {
      const updated = await Promise.all(
        stocksRef.current.map(async (s) => {
          const price = await fetchStockPrice(s.symbol);
          return price !== null
            ? { ...s, currentPrice: price, lastUpdated: Date.now() }
            : s;
        }),
      );
      setStocks(updated);
    } finally {
      setRefreshingStocks(false);
      setLastRefreshed(Date.now());
    }
  }, []);

  const refreshNPSPrices = useCallback(async () => {
    setRefreshingNPS(true);
    try {
      const uniquePfmIds = [...new Set(npsRef.current.map((h) => h.pfmId))];
      const navMap = new Map<string, number>();
      for (const pfmId of uniquePfmIds) {
        const nav = await fetchNPSNav(pfmId);
        if (nav !== null) navMap.set(pfmId, nav);
      }
      const updated = npsRef.current.map((h) => {
        const nav = navMap.get(h.pfmId);
        return nav !== undefined
          ? { ...h, currentNAV: nav, lastUpdated: Date.now() }
          : h;
      });
      setNps(updated);
      const updatedCount = updated.filter(
        (u, i) => u.currentNAV !== npsRef.current[i]?.currentNAV,
      ).length;
      if (updatedCount > 0) {
        toast.success(`Updated NAV for ${updatedCount} NPS holding(s).`);
      }
    } finally {
      setRefreshingNPS(false);
      setLastRefreshed(Date.now());
    }
  }, []);

  const refreshSGBPrices = useCallback(async () => {
    setRefreshingSGB(true);
    try {
      const updated = await Promise.all(
        sgbRef.current.map(async (h) => {
          const price = await fetchSGBPrice(h.symbol);
          return price !== null
            ? { ...h, currentPricePerGram: price, lastUpdated: Date.now() }
            : h;
        }),
      );
      setSgb(updated);
    } finally {
      setRefreshingSGB(false);
      setLastRefreshed(Date.now());
    }
  }, []);

  // ── Auto-refresh on mount and every 5 minutes ──────────────────────────
  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;

    void refreshMFPrices();
    void refreshStockPrices();
    void refreshNPSPrices();
    void refreshSGBPrices();

    const intervalId = setInterval(
      () => {
        void refreshMFPrices();
        void refreshStockPrices();
        void refreshNPSPrices();
        void refreshSGBPrices();
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(intervalId);
  }, [refreshMFPrices, refreshStockPrices, refreshNPSPrices, refreshSGBPrices]);

  // ── Export all data as JSON download ───────────────────────────────────
  const exportData = useCallback(() => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      mutualFunds,
      stocks,
      debtHoldings,
      npsHoldings,
      sgbHoldings,
      transactions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Portfolio data exported successfully.");
  }, [mutualFunds, stocks, debtHoldings, npsHoldings, sgbHoldings, transactions]);

  // ── Import data from JSON string ───────────────────────────────────────
  const importData = useCallback((jsonString: string): boolean => {
    try {
      const payload = JSON.parse(jsonString);
      if (!payload || typeof payload !== "object")
        throw new Error("Invalid format");

      const mfs: MutualFundHolding[] = Array.isArray(payload.mutualFunds)
        ? payload.mutualFunds : [];
      const sts: StockHolding[] = Array.isArray(payload.stocks)
        ? payload.stocks : [];
      const dbt: DebtHolding[] = Array.isArray(payload.debtHoldings)
        ? payload.debtHoldings : [];
      const nps: NpsHolding[] = Array.isArray(payload.npsHoldings)
        ? payload.npsHoldings : [];
      const sgb: SgbHolding[] = Array.isArray(payload.sgbHoldings)
        ? payload.sgbHoldings : [];
      const txs: Transaction[] = Array.isArray(payload.transactions)
        ? payload.transactions : [];

      setMutualFunds(mfs);
      setStocks(sts);
      setDebt(dbt);
      setNps(nps);
      setSgb(sgb);
      setTransactions(txs);

      saveToSession(SESSION_KEYS.mutualFunds, mfs);
      saveToSession(SESSION_KEYS.stocks, sts);
      saveToSession(SESSION_KEYS.debt, dbt);
      saveToSession(SESSION_KEYS.nps, nps);
      saveToSession(SESSION_KEYS.sgb, sgb);
      saveToSession(SESSION_KEYS.transactions, txs);

      toast.success("Portfolio data imported successfully.");
      return true;
    } catch {
      toast.error("Failed to import: invalid or corrupted backup file.");
      return false;
    }
  }, []);

  // ── Clear all session data ─────────────────────────────────────────────
  const clearAllData = useCallback(() => {
    setMutualFunds([]);
    setStocks([]);
    setDebt([]);
    setNps([]);
    setSgb([]);
    setTransactions([]);
    for (const key of Object.values(SESSION_KEYS)) {
      sessionStorage.removeItem(key);
    }
    hasFetchedBlob.current = false;
    didMount.current = false;
  }, []);

  return (
    <PortfolioContext.Provider
      value={{
        mutualFunds,
        stocks,
        debtHoldings,
        npsHoldings,
        sgbHoldings,
        transactions,
        totals,
        isRefreshingMF,
        isRefreshingStocks,
        isRefreshingNPS,
        isRefreshingSGB,
        lastRefreshed,
        isLoadingData,
        addMutualFund,
        updateMutualFund,
        deleteMutualFund,
        addStock,
        updateStock,
        deleteStock,
        addDebt,
        updateDebt,
        deleteDebt,
        addNps,
        updateNps,
        deleteNps,
        addSgb,
        updateSgb,
        deleteSgb,
        addTransaction,
        deleteTransaction,
        refreshMFPrices,
        refreshStockPrices,
        refreshNPSPrices,
        refreshSGBPrices,
        clearAllData,
        exportData,
        importData,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx)
    throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
