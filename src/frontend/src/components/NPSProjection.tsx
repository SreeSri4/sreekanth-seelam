import { type NpsHolding } from "@/context/PortfolioContext";
import { formatINR } from "@/utils/format";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// ─── Config ────────────────────────────────────────────────────────────────

const TARGET_YEAR = 2036;
const RATES = [
  { label: "10%", rate: 0.10, color: "oklch(0.62 0.18 162)", bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.25)"  },
  { label: "15%", rate: 0.15, color: "oklch(0.76 0.15 80)",  bg: "rgba(234,179,8,0.10)",  border: "rgba(234,179,8,0.25)"  },
  { label: "20%", rate: 0.20, color: "oklch(0.65 0.20 310)", bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.25)" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function yearsToTarget(): number {
  const now    = new Date();
  const target = new Date(`${TARGET_YEAR}-01-01`);
  return Math.max((target.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000), 0);
}

function project(currentValue: number, rate: number, years: number): number {
  return currentValue * Math.pow(1 + rate, years);
}

function shortINR(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000)    return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (value >= 1_000)       return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar p-3 shadow-lg text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-semibold text-foreground">{formatINR(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Props ─────────────────────────────────────────────────────────────────

interface Props {
  holdings: NpsHolding[];
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function NPSProjection({ holdings }: Props) {
  const [activeRate, setActiveRate] = useState<number>(1); // default 15%

  const years = yearsToTarget();

  const { totalCurrentValue, totalInvested, schemeGroups, chartData } = useMemo(() => {
    // Consolidate by pfmId + tier
    const map = new Map<string, { units: number; invested: number; currentNAV: number; name: string; tier: string }>();
    for (const h of holdings) {
      const key = `${h.pfmId}__${h.tier}`;
      const existing = map.get(key);
      if (existing) {
        existing.units    += h.units;
        existing.invested += h.units * h.purchaseNAV;
      } else {
        map.set(key, { units: h.units, invested: h.units * h.purchaseNAV, currentNAV: h.currentNAV, name: h.schemeName, tier: h.tier });
      }
    }

    const totalCurrentValue = Array.from(map.values()).reduce((s, f) => s + f.units * f.currentNAV, 0);
    const totalInvested     = Array.from(map.values()).reduce((s, f) => s + f.invested, 0);

    const schemeGroups = Array.from(map.entries()).map(([key, f]) => {
      const currentValue = f.units * f.currentNAV;
      return {
        key,
        name:   f.name,
        tier:   f.tier,
        currentValue,
        invested: f.invested,
        projections: RATES.map(({ rate, label }) => ({ label, value: project(currentValue, rate, years) })),
      };
    }).sort((a, b) => b.currentValue - a.currentValue);

    const chartData = schemeGroups.map((f) => {
      const label = f.name.length > 20 ? f.name.slice(0, 20) + "…" : f.name;
      return {
        name:    `${label} (Tier ${f.tier})`,
        current: f.currentValue,
        "10%":   project(f.currentValue, 0.10, years),
        "15%":   project(f.currentValue, 0.15, years),
        "20%":   project(f.currentValue, 0.20, years),
      };
    });

    return { totalCurrentValue, totalInvested, schemeGroups, chartData };
  }, [holdings, years]);

  if (holdings.length === 0) return null;

  const selectedRate   = RATES[activeRate];
  const totalProjected = project(totalCurrentValue, selectedRate.rate, years);
  const totalGain      = totalProjected - totalInvested;

  return (
    <div className="p-5 flex flex-col gap-5">
      {/* Rate selector + subtitle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">
          {years.toFixed(1)} years remaining · based on current value
        </p>
        <div className="flex items-center gap-1.5 bg-background border border-sidebar-border rounded-lg p-1">
          {RATES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setActiveRate(i)}
              className="px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={activeRate === i ? { background: r.color, color: "#fff" } : { color: "var(--muted-foreground)" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Current Value",              value: totalCurrentValue, highlight: false },
          { label: `At ${selectedRate.label} XIRR`, value: totalProjected,    highlight: true  },
          { label: "Projected Gain",             value: totalGain,         highlight: false, sub: `on ${shortINR(totalInvested)} invested` },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg p-3 border transition-all"
            style={
              card.highlight
                ? { background: selectedRate.bg, border: `1px solid ${selectedRate.border}` }
                : { background: "var(--background)", border: "1px solid var(--sidebar-border)" }
            }
          >
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{card.label}</p>
            <p className="text-sm font-bold mt-1 number-tabular" style={card.highlight ? { color: selectedRate.color } : undefined}>
              {formatINR(card.value)}
            </p>
            {card.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* All 3 rates comparison */}
      <div className="grid grid-cols-3 gap-2">
        {RATES.map((r, i) => {
          const projected = project(totalCurrentValue, r.rate, years);
          const isActive  = activeRate === i;
          return (
            <button
              key={r.label}
              type="button"
              onClick={() => setActiveRate(i)}
              className="rounded-lg p-3 text-left transition-all duration-150 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ background: isActive ? r.bg : "transparent", border: `1px solid ${isActive ? r.border : "var(--sidebar-border)"}` }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: r.color }}>
                  {r.label} XIRR
                </span>
              </div>
              <p className="text-sm font-bold text-foreground number-tabular">{shortINR(projected)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {((projected / totalCurrentValue - 1) * 100).toFixed(0)}% total growth
              </p>
            </button>
          );
        })}
      </div>

      {/* Bar chart — scheme-wise */}
      {chartData.length > 1 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-3">
            Scheme-wise projections at {selectedRate.label} XIRR
          </p>
          <div style={{ height: Math.max(180, chartData.length * 52) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--sidebar-border)" />
                <XAxis
                  type="number"
                  tickFormatter={shortINR}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="current" name="Current" radius={[0, 3, 3, 0]} fill="oklch(0.55 0.05 240)" opacity={0.5} />
                <Bar dataKey={selectedRate.label} name={`At ${selectedRate.label}`} radius={[0, 3, 3, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={selectedRate.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-scheme table */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">
          Scheme-wise breakdown
        </p>
        <div className="rounded-lg border border-sidebar-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-sidebar-border bg-background/50">
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Scheme</th>
                <th className="px-3 py-2 text-right text-muted-foreground font-medium">Current</th>
                {RATES.map((r) => (
                  <th key={r.label} className="px-3 py-2 text-right font-medium" style={{ color: r.color }}>
                    @ {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schemeGroups.map((scheme) => (
                <tr key={scheme.key} className="border-b border-sidebar-border/50 last:border-0 hover:bg-accent/10 transition-colors">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground truncate max-w-[160px]">{scheme.name}</p>
                    <p className="text-[10px] text-muted-foreground">Tier {scheme.tier} · Invested {formatINR(scheme.invested)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right number-tabular text-muted-foreground">
                    {formatINR(scheme.currentValue)}
                  </td>
                  {scheme.projections.map((p) => (
                    <td key={p.label} className="px-3 py-2.5 text-right number-tabular font-semibold">
                      {shortINR(p.value)}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-background/50 border-t border-sidebar-border font-semibold">
                <td className="px-3 py-2.5 text-foreground">Total</td>
                <td className="px-3 py-2.5 text-right number-tabular text-foreground">{formatINR(totalCurrentValue)}</td>
                {RATES.map((r) => (
                  <td key={r.label} className="px-3 py-2.5 text-right number-tabular" style={{ color: r.color }}>
                    {shortINR(project(totalCurrentValue, r.rate, years))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Projections assume current value compounds at selected XIRR. NPS withdrawals are subject to annuity rules. Not financial advice.
      </p>
    </div>
  );
}
