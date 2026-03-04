import Layout, { type Page } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import { PortfolioProvider } from "@/context/PortfolioContext";
import Dashboard from "@/pages/Dashboard";
import DebtInvestments from "@/pages/DebtInvestments";
import MutualFunds from "@/pages/MutualFunds";
import NPS from "@/pages/NPS";
import SGB from "@/pages/SGB";
import StocksETFs from "@/pages/StocksETFs";
import Transactions from "@/pages/Transactions";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

// ─── App Content ─────────────────────────────────────────────

function AppContent({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

  function renderPage() {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard />;
      case "mutualfunds":
        return <MutualFunds />;
      case "stocks":
        return <StocksETFs />;
      case "debt":
        return <DebtInvestments />;
      case "nps":
        return <NPS />;
      case "sgb":
        return <SGB />;
      case "transactions":
        return <Transactions />;
      default:
        return <Dashboard />;
    }
  }

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      theme={theme}
      onToggleTheme={onToggleTheme}
      userName=""
    >
      {renderPage()}
    </Layout>
  );
}

// ─── Root App ─────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("portfolio-theme");
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }

    localStorage.setItem("portfolio-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <PortfolioProvider>
      <AppContent theme={theme} onToggleTheme={toggleTheme} />
      <Toaster position="bottom-right" />
    </PortfolioProvider>
  );
}
