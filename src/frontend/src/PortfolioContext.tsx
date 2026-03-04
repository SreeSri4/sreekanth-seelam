import React, { createContext, useContext, useEffect, useState } from "react";

interface Portfolio {
  version: number;
  exportedAt: string;
  mutualFunds: any[];
  stocks: any[];
  debtHoldings: any[];
  npsHoldings: any[];
  sgbHoldings: any[];
  transactions: any[];
}

interface PortfolioContextType {
  portfolio: Portfolio;
  setPortfolio: React.Dispatch<React.SetStateAction<Portfolio>>;
  loading: boolean;
}

const defaultPortfolio: Portfolio = {
  version: 1,
  exportedAt: new Date().toISOString(),
  mutualFunds: [],
  stocks: [],
  debtHoldings: [],
  npsHoldings: [],
  sgbHoldings: [],
  transactions: [],
};
const PortfolioContext = createContext<PortfolioContextType | undefined>(
  undefined
);

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [portfolio, setPortfolio] =
    useState<Portfolio>(defaultPortfolio);
  const [loading, setLoading] = useState(true);

  // ─── Load Portfolio from Blob ─────────────────────────────

  useEffect(() => {
    const loadPortfolio = async () => {
      try {
        const res = await fetch("./portfolio");
        const data = await res.json();

        if (data && data.version) {
          setPortfolio(data);
        } else {
          setPortfolio(defaultPortfolio);
        }
      } catch (err) {
        console.error("Failed to load portfolio:", err);
        setPortfolio(defaultPortfolio);
      } finally {
        setLoading(false);
      }
    };

    loadPortfolio();
  }, []);

  // ─── Auto Save to Blob ─────────────────────────────────────

  useEffect(() => {
    if (loading) return; // prevent saving before initial load

    const savePortfolio = async () => {
      try {
        const updated = {
          ...portfolio,
          exportedAt: new Date().toISOString(),
        };

        await fetch("./portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
      } catch (err) {
        console.error("Failed to save portfolio:", err);
      }
    };

    savePortfolio();
  }, [portfolio, loading]);

  return (
    <PortfolioContext.Provider
      value={{ portfolio, setPortfolio, loading }}
    >
      {children}
    </PortfolioContext.Provider>
  );
};

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error("usePortfolio must be used within PortfolioProvider");
  }
  return context;
};
