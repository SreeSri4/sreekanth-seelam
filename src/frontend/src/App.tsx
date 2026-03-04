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

import {
  initGoogleAuth,
  login,
  readJsonFile,
} from "./googleDriveService";

export type Theme = "light" | "dark";

// ─── App Content ───────────────────────────────────────────────────────────

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

// ─── Root App ──────────────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("portfolio-theme");
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  });

  // Apply theme to DOM
  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "#0f172a");
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "#ffffff");
    }

    localStorage.setItem("portfolio-theme", theme);
  }, [theme]);

  // Initialize Google Auth ONCE (not on theme change)
  useEffect(() => {
    const initAuth = async () => {
      try {
        await initGoogleAuth();
        console.log("Google API Ready");
      } catch (err) {
        console.error("Google Init Failed:", err);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
  fetch("/api/portfolio")
    .then(res => res.json())
    .then(setPortfolio);
   }, []);
  await fetch("/api/portfolio", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(updatedPortfolio), 
  });
  const handleLogin = async () => {
    try {
      await login();
      const data = await readJsonFile("1k6P09jh3MQcNCxuEATfi-G7RhS3uICcM");
      console.log("Drive Data:", data);
    } catch (err) {
      console.error("Drive Error:", err);
    }
  };

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <PortfolioProvider>
      {/* Temporary Test Button */}
      <button
        onClick={handleLogin}
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 9999,
          padding: "8px 12px",
          borderRadius: "6px",
          background: "#2563eb",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
      >
        Connect Google Drive
      </button>

      <AppContent theme={theme} onToggleTheme={toggleTheme} />

      <Toaster
        position="bottom-right"
        toastOptions={{
          style:
            theme === "dark"
              ? {
                  background: "oklch(0.20 0.025 255)",
                  border: "1px solid oklch(0.28 0.025 255)",
                  color: "oklch(0.96 0.005 255)",
                }
              : {
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  color: "#0f172a",
                },
        }}
      />
    </PortfolioProvider>
  );
}
