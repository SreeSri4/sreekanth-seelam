import { usePortfolio, type MutualFundHolding } from "@/context/PortfolioContext";
import { formatINR, formatPercent } from "@/utils/format";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";

// ─── Cap Classification ────────────────────────────────────────────────────
// Classifies a fund by its scheme name keywords.
// Extend this list to match your fund names.

type CapType = "Large Cap" | "Mid Cap" | "Small Cap" | "Flexi/Multi Cap" | "Other";

function classifyFund(schemeName: string): CapType {
  const name = schemeName.toLowerCase();
  if (name.includes("small cap") || name.includes("smallcap")) return "Small Cap";
  if (name.includes("mid cap") || name.includes("midcap")) return "Mid Cap";
  if (
    name.includes("large cap") ||
    name.includes("largecap") ||
    name.includes("bluechip") ||
    name.includes("blue chip") ||
    name.includes("top 100") ||
    name.includes("nifty 50") ||
    name.includes("sensex")
  )
    return "Large Cap";
  if (
    name.includes("flexi") ||
    name.includes("multi cap") ||
    name.includes("multicap") ||
    name.includes("diversified")
  )
    return "Flexi/Multi Cap";
  return "Other";
}

// ─── Colors ────────────────────────────────────────────────────────────────

const CAP_CONFIG: Record<CapType, { color: string; bg: string; border: string; desc: string }> = {
  "Large Cap": {
    color: "oklch(0.62 0.18 162)",
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.25)",
    desc: "Stable, top 100 companies",
  },
  "Mid Cap": {
    color: "oklch(0.76 0.15 80)",
    bg: "rgba(234,179,8,0.10)",
    border: "rgba(234,179,8,0.25)",
    desc: "Growth-oriented, 101–250 rank",
  },
  "Small Cap": {
    color: "oklch(0.65 0.20 310)",
    bg: "rgba(168,85,247,0.10)",
    border: "rgba(168,85,247,0.25)",
    desc: "High risk, high potential",
  },
  "Flexi/Multi Cap": {
    color: "oklch(0.62 0.20 264)",
    bg: "rgba(59,130,246,0.10)",
    border: "rgba(59,130,246,0.25)",
    desc: "Across all market caps",
  },
  Other: {
    color: "oklch(0.55 0.05 240)",
    bg: "rgba(100,116,139,0.10)",
    border: "rgba(100,116,139,0.25)",
    desc: "Debt, hybrid, index, etc.",
  },
};

// ─── Custom Active Pie Shape ───────────────────────────────────────────────

const renderActiveShape = (props: any) => {
  const {
    cx, cy, innerRadius, outerRadius,
    startAngle, endAngle, fill, payload, percent, value,
  } = props;

  return (
    <g>
      {/* Center label */}
      <text x={cx} y={cy - 14} textAnchor="middle" className="fill-foreground" style={{ fontSize: 13, fontWeight: 600 }}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontSize: 12, fill: fill, fontWeight: 700 }}>
        {formatINR(value)}
      </text>
      <text x={cx} y={cy + 26} textAnchor="middle" style={{ fontSize: 11, fill: "oklch(0.55 0.03 240)" }}>
        {(percent * 100).toFixed(1)}%
      </text>

      {/* Outer ring */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.15}
      />
      {/* Main slice */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────

export default function MFCapAllocation() {
  const { mutualFunds } = usePortfolio();
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [hoveredCap, setHoveredCap] = useState<CapType | null>(null);

  // Group funds by cap type and compute values
  const { chartData, fundsByCap, totalValue } = useMemo(() => {
    const grouped: Record<CapType, { value: number; invested: number; funds: MutualFundHolding[] }> = {
      "Large Cap": { value: 0, invested: 0, funds: [] },
      "Mid Cap": { value: 0, invested: 0, funds: [] },
      "Small Cap": { value: 0, invested: 0, funds: [] },
      "Flexi/Multi Cap": { value: 0, invested: 0, funds: [] },
      "Other": { value: 0, invested: 0, funds: [] },
    };

    for (const fund of mutualFunds) {
      const cap = classifyFund(fund.schemeName);
      grouped[cap].value += fund.units * fund.currentNAV;
      grouped[cap].invested += fund.units * fund.purchaseNAV;
      grouped[cap].funds.push(fund);
    }

    const totalValue = Object.values(grouped).reduce((s, g) => s + g.value, 0);

    const chartData = (Object.entries(grouped) as [CapType, typeof grouped[CapType]][])
      .filter(([, g]) => g.value > 0)
      .map(([name, g]) => ({
        name,
        value: g.value,
        invested: g.invested,
        gain: g.value - g.invested,
        gainPercent: g.invested > 0 ? ((g.value - g.invested) / g.invested) * 100 : 0,
        color: CAP_CONFIG[name].color,
        funds: g.funds,
      }));

    return { chartData, fundsByCap: grouped, totalValue };
  }, [mutualFunds]);

  if (mutualFunds.length === 0) {
    return (
      <div className="rounded-xl border border-sidebar-border bg-sidebar p-6 flex flex-col items-center justify-center gap-2 min-h-[200px]">
        <p className="text-sm text-muted-foreground">No mutual funds added yet.</p>
      </div>
    );
  }

  const activeCap = hoveredCap ?? (chartData[activeIndex]?.name as CapType);

  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-sidebar-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">MF Cap Allocation</h3>
          <p className="text-xs text-muted-foreground mt-0.5">By market capitalisation</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total MF Value</p>
          <p className="text-sm font-bold text-foreground">{formatINR(totalValue)}</p>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-5">
        {/* Chart + Legend row */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          {/* Pie chart */}
          <div className="w-full sm:w-48 h-48 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={80}
                  dataKey="value"
                  activeIndex={activeIndex}
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, index) => {
                    setActiveIndex(index);
                    setHoveredCap(chartData[index].name as CapType);
                  }}
                  onMouseLeave={() => setHoveredCap(null)}
                  onClick={(_, index) => setActiveIndex(index)}
                  stroke="none"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} opacity={0.9} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatINR(value), "Value"]}
                  contentStyle={{
                    background: "var(--sidebar)",
                    border: "1px solid var(--sidebar-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend cards */}
          <div className="flex-1 w-full grid grid-cols-1 gap-2">
            {chartData.map((entry, index) => {
              const config = CAP_CONFIG[entry.name as CapType];
              const pct = totalValue > 0 ? (entry.value / totalValue) * 100 : 0;
              const isActive = activeIndex === index;

              return (
                <button
                  key={entry.name}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  onMouseEnter={() => { setActiveIndex(index); setHoveredCap(entry.name as CapType); }}
                  onMouseLeave={() => setHoveredCap(null)}
                  className="w-full text-left rounded-lg px-3 py-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    background: isActive ? config.bg : "transparent",
                    border: `1px solid ${isActive ? config.border : "transparent"}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: config.color }}
                      />
                      <span className="text-xs font-medium text-foreground truncate">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs font-bold" style={{ color: config.color }}>
                        {pct.toFixed(1)}%
                      </span>
                      <span className="text-xs text-muted-foreground w-20 text-right">
                        {formatINR(entry.value)}
                      </span>
                    </div>
                  </div>
                  {/* Allocation bar */}
                  <div className="mt-1.5 h-1 rounded-full bg-sidebar-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: config.color }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active cap detail — fund list */}
        {activeCap && fundsByCap[activeCap]?.funds.length > 0 && (
          <div
            className="rounded-lg p-3 transition-all duration-200"
            style={{
              background: CAP_CONFIG[activeCap].bg,
              border: `1px solid ${CAP_CONFIG[activeCap].border}`,
            }}
          >
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">
              {activeCap} · {CAP_CONFIG[activeCap].desc}
            </p>
            <div className="flex flex-col gap-1.5">
              {fundsByCap[activeCap].funds.map((fund) => {
                const value = fund.units * fund.currentNAV;
                const invested = fund.units * fund.purchaseNAV;
                const gain = value - invested;
                const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
                const isPositive = gain >= 0;

                return (
                  <div
                    key={fund.id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-sidebar-border last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{fund.schemeName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {fund.units} units · NAV {fund.currentNAV.toFixed(4)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-foreground">{formatINR(value)}</p>
                      <p
                        className="text-[10px] font-medium"
                        style={{ color: isPositive ? "oklch(0.62 0.18 162)" : "oklch(0.60 0.22 25)" }}
                      >
                        {isPositive ? "+" : ""}{formatPercent(gainPct)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
