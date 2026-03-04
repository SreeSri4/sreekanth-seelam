export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [portfolio, setPortfolio] = useState<Portfolio>(defaultPortfolio);
  const [loading, setLoading] = useState(true);
  // Track if initial load is finished to prevent immediate auto-save
  const isInitialLoad = React.useRef(true);

    // 1. Initial Load (GET)
  useEffect(() => {
    const loadPortfolio = async () => {
      try {
        const res = await fetch(`/api/portfolio`);
        console.log("Fetched data:", data);          // ← see what came back
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        if (data && data.version) {
          setPortfolio(data);
        }
      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoading(false);
        // Mark loading as complete after a short delay to be safe
        setTimeout(() => { isInitialLoad.current = false; }, 100);
      }
    };
    loadPortfolio();
  }, []);

  // 2. Auto Save (POST) with Guard
  useEffect(() => {
    // Only save if loading is done AND it's not the initial data mount
    if (loading || isInitialLoad.current) return;

    const timeoutId = setTimeout(async () => {
      try {
        await fetch(`/api/portfolio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(portfolio),
        });
        console.log("Portfolio auto-saved");
      } catch (err) {
        console.error("Save error:", err);
      }
    }, 2000); // 2-second debounce

    return () => clearTimeout(timeoutId);
  }, [portfolio, loading]);

  return (
    <PortfolioContext.Provider value={{ portfolio, setPortfolio, loading }}>
      {children}
    </PortfolioContext.Provider>
  );
};
