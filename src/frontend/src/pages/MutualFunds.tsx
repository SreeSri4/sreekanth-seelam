import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type MutualFundHolding,
  usePortfolio,
} from "@/context/PortfolioContext";
import { cn } from "@/lib/utils";
import {
  calcXIRR,
  formatDate,
  formatINR,
  formatINRWithSign,
  formatPercent,
  gainLossClass,
  todayStr,
} from "@/utils/format";
import { type MFSearchResult, searchMutualFunds } from "@/utils/priceService";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import MFCapAllocation from "@/components/MFCapAllocation";

// ─── Types ────────────────────────────────────────────────────────────────

interface FundGroup {
  schemeCode: string;
  schemeName: string;
  currentNAV: number;
  totalUnits: number;
  avgNAV: number;
  totalInvested: number;
  currentValue: number;
  xirr: number;
  holdings: MutualFundHolding[];
}

type SortField =
  | "schemeName"
  | "currentNAV"
  | "totalUnits"
  | "invested"
  | "currentValue"
  | "gainLoss"
  | "gainPct";
type SortDir = "asc" | "desc";

// ─── Group By Scheme ──────────────────────────────────────────────────────

function groupByScheme(holdings: MutualFundHolding[]): FundGroup[] {
  const map = new Map<string, MutualFundHolding[]>();
  for (const h of holdings) {
    const existing = map.get(h.schemeCode) ?? [];
    existing.push(h);
    map.set(h.schemeCode, existing);
  }

  const today = todayStr();
  const groups: FundGroup[] = [];

  for (const [schemeCode, list] of map.entries()) {
    const totalUnits = list.reduce((s, h) => s + h.units, 0);
    const totalInvested = list.reduce((s, h) => s + h.units * h.purchaseNAV, 0);
    const avgNAV = totalUnits > 0 ? totalInvested / totalUnits : 0;
    const currentNAV = list[list.length - 1].currentNAV;
    const currentValue = totalUnits * currentNAV;

    // Sort by purchase date ascending for XIRR calculation
    const sortedByDate = [...list].sort(
      (a, b) =>
        new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime(),
    );

    const cashflows: { amount: number; date: string }[] = [
      ...sortedByDate.map((h) => ({
        amount: -(h.units * h.purchaseNAV),
        date: h.purchaseDate,
      })),
      { amount: currentValue, date: today },
    ];

    let xirr = 0;
    try {
      const raw = calcXIRR(cashflows);
      xirr = Number.isFinite(raw) && !Number.isNaN(raw) ? raw : 0;
    } catch {
      xirr = 0;
    }

    groups.push({
      schemeCode,
      schemeName: list[0].schemeName,
      currentNAV,
      totalUnits,
      avgNAV,
      totalInvested,
      currentValue,
      xirr,
      holdings: sortedByDate,
    });
  }

  return groups;
}

// ─── Add/Edit Fund Modal ──────────────────────────────────────────────────

interface FundFormData {
  schemeCode: string;
  schemeName: string;
  units: string;
  purchaseNAV: string;
  purchaseDate: string;
}

const EMPTY_FORM: FundFormData = {
  schemeCode: "",
  schemeName: "",
  units: "",
  purchaseNAV: "",
  purchaseDate: todayStr(),
};

interface FundModalProps {
  open: boolean;
  onClose: () => void;
  editData?: MutualFundHolding | null;
  /** When set, skip search and pre-fill scheme – "Add SIP" mode */
  addSipData?: { schemeCode: string; schemeName: string } | null;
}

function FundModal({ open, onClose, editData, addSipData }: FundModalProps) {
  const { addMutualFund, updateMutualFund, addTransaction } = usePortfolio();
  const [form, setForm] = useState<FundFormData>(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MFSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [fundSelected, setFundSelected] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isSipMode = !!addSipData && !editData;

  // Populate form when modal opens
  useEffect(() => {
    if (!open) return;
    if (editData) {
      setForm({
        schemeCode: editData.schemeCode,
        schemeName: editData.schemeName,
        units: String(editData.units),
        purchaseNAV: String(editData.purchaseNAV),
        purchaseDate: editData.purchaseDate,
      });
      setFundSelected(true);
      setSearchQuery(editData.schemeName);
    } else if (addSipData) {
      setForm({
        ...EMPTY_FORM,
        schemeCode: addSipData.schemeCode,
        schemeName: addSipData.schemeName,
      });
      setFundSelected(true);
      setSearchQuery(addSipData.schemeName);
      setSearchResults([]);
    } else {
      setForm(EMPTY_FORM);
      setFundSelected(false);
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [open, editData, addSipData]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchMutualFunds(q);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchQuery(val);
    setFundSelected(false);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(val), 400);
  }

  function selectFund(fund: MFSearchResult) {
    setForm((prev) => ({
      ...prev,
      schemeCode: fund.schemeCode,
      schemeName: fund.schemeName,
    }));
    setSearchQuery(fund.schemeName);
    setFundSelected(true);
    setSearchResults([]);
  }

  function handleField(field: keyof FundFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const units = Number.parseFloat(form.units);
    const nav = Number.parseFloat(form.purchaseNAV);
    if (
      !form.schemeCode ||
      !form.schemeName ||
      Number.isNaN(units) ||
      Number.isNaN(nav)
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    if (editData) {
      updateMutualFund(editData.id, {
        units,
        purchaseNAV: nav,
        purchaseDate: form.purchaseDate,
        schemeCode: form.schemeCode,
        schemeName: form.schemeName,
      });
      toast.success("Fund updated successfully.");
    } else {
      addMutualFund({
        schemeCode: form.schemeCode,
        schemeName: form.schemeName,
        units,
        purchaseNAV: nav,
        purchaseDate: form.purchaseDate,
        currentNAV: nav,
      });
      addTransaction({
        assetType: "mutualfund",
        assetName: form.schemeName,
        transactionType: "buy",
        quantity: units,
        price: nav,
        date: form.purchaseDate,
        notes: isSipMode ? "SIP transaction" : "Added to portfolio",
      });
      toast.success(
        isSipMode ? "SIP added successfully." : "Fund added successfully.",
      );
    }
    onClose();
  }

  const modalTitle = editData
    ? "Edit Transaction"
    : isSipMode
      ? `Add SIP – ${addSipData?.schemeName}`
      : "Add Mutual Fund";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="bg-card border-border text-foreground sm:max-w-lg"
        data-ocid="mf.dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {modalTitle}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Search – only for new fund (not edit, not SIP mode) */}
          {!editData && !isSipMode && (
            <div className="space-y-1.5">
              <Label>Search Fund</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  data-ocid="mf.search.input"
                  className="pl-9 bg-background border-border"
                  placeholder="Type fund name (min 3 chars)…"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setFundSelected(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search results */}
              {(isSearching || searchResults.length > 0) && !fundSelected && (
                <ScrollArea className="max-h-48 border border-border rounded-lg bg-background">
                  {isSearching ? (
                    <div className="p-3 space-y-2">
                      {["s1", "s2", "s3", "s4"].map((k) => (
                        <Skeleton key={k} className="h-9 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="p-1">
                      {searchResults.map((r) => (
                        <button
                          key={r.schemeCode}
                          type="button"
                          onClick={() => selectFund(r)}
                          className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                        >
                          <p className="font-medium text-foreground truncate">
                            {r.schemeName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Code: {r.schemeCode}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}

              {fundSelected && (
                <p className="text-xs text-gain flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gain inline-block" />
                  {form.schemeName} (Code: {form.schemeCode})
                </p>
              )}
            </div>
          )}

          {/* Fund name display for edit or SIP mode */}
          {(editData || isSipMode) && (
            <div className="space-y-1.5">
              <Label>Fund</Label>
              <p className="text-sm text-muted-foreground bg-background rounded-lg px-3 py-2 border border-border">
                {form.schemeName}
                <span className="text-xs ml-2 opacity-60">
                  ({form.schemeCode})
                </span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="modal-units">Units</Label>
              <Input
                id="modal-units"
                data-ocid="mf.units.input"
                type="number"
                step="0.001"
                placeholder="150.234"
                className="bg-background border-border"
                value={form.units}
                onChange={(e) => handleField("units", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modal-nav">NAV (₹)</Label>
              <Input
                id="modal-nav"
                data-ocid="mf.nav.input"
                type="number"
                step="0.01"
                placeholder="42.50"
                className="bg-background border-border"
                value={form.purchaseNAV}
                onChange={(e) => handleField("purchaseNAV", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-date">
              {isSipMode ? "SIP Date" : "Purchase Date"}
            </Label>
            <Input
              id="modal-date"
              data-ocid="mf.date.input"
              type="date"
              className="bg-background border-border"
              value={form.purchaseDate}
              max={todayStr()}
              onChange={(e) => handleField("purchaseDate", e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-ocid="mf.cancel_button"
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-ocid="mf.add.submit_button"
              className="bg-primary text-primary-foreground"
            >
              {editData ? "Save Changes" : isSipMode ? "Add SIP" : "Add Fund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mutual Funds Page ────────────────────────────────────────────────────

export default function MutualFunds() {
  const {
    mutualFunds,
    deleteMutualFund,
    isRefreshingMF,
    refreshMFPrices,
    totals,
  } = usePortfolio();

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MutualFundHolding | null>(null);
  const [addSipTarget, setAddSipTarget] = useState<{
    schemeCode: string;
    schemeName: string;
  } | null>(null);
  const [sortField, setSortField] = useState<SortField>("currentValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function toggleExpand(schemeCode: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(schemeCode)) {
        next.delete(schemeCode);
      } else {
        next.add(schemeCode);
      }
      return next;
    });
  }

  function handleDeleteTransaction(id: string, name: string) {
    if (confirm(`Delete this transaction for "${name}"?`)) {
      deleteMutualFund(id);
      toast.success("Transaction removed.");
    }
  }

  function handleDeleteGroup(group: FundGroup) {
    if (
      confirm(
        `Delete ALL ${group.holdings.length} transaction(s) for "${group.schemeName}"? This cannot be undone.`,
      )
    ) {
      for (const h of group.holdings) {
        deleteMutualFund(h.id);
      }
      toast.success(`${group.schemeName} removed from portfolio.`);
    }
  }

  const groups = groupByScheme(mutualFunds);

  const sorted = [...groups].sort((a, b) => {
    const gainA = a.currentValue - a.totalInvested;
    const gainB = b.currentValue - b.totalInvested;
    const gainPctA = a.totalInvested > 0 ? (gainA / a.totalInvested) * 100 : 0;
    const gainPctB = b.totalInvested > 0 ? (gainB / b.totalInvested) * 100 : 0;

    const map: Record<SortField, number> = {
      schemeName: a.schemeName.localeCompare(b.schemeName),
      currentNAV: a.currentNAV - b.currentNAV,
      totalUnits: a.totalUnits - b.totalUnits,
      invested: a.totalInvested - b.totalInvested,
      currentValue: a.currentValue - b.currentValue,
      gainLoss: gainA - gainB,
      gainPct: gainPctA - gainPctB,
    };

    const raw = map[sortField] ?? 0;
    return sortDir === "asc" ? raw : -raw;
  });

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <ChevronUp className="w-3 h-3 text-muted-foreground opacity-30" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-primary" />
    ) : (
      <ChevronDown className="w-3 h-3 text-primary" />
    );
  }

  function SortTh({
    field,
    children,
    className,
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <th
        className={cn(
          "px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none whitespace-nowrap",
          className,
        )}
        onClick={() => handleSort(field)}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") && handleSort(field)
        }
      >
        <span className="flex items-center gap-1">
          {children}
          <SortIcon field={field} />
        </span>
      </th>
    );
  }

  const totalInvested = totals.mfInvested;
  const totalValue = totals.mfValue;
  const totalGain = totalValue - totalInvested;
  const totalGainPct =
    totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  // Overall XIRR across all MF holdings
  const allCashflows: { amount: number; date: string }[] = [];
  for (const mf of mutualFunds) {
    allCashflows.push({
      amount: -(mf.units * mf.purchaseNAV),
      date: mf.purchaseDate,
    });
  }
  if (allCashflows.length > 0) {
    allCashflows.push({ amount: totalValue, date: todayStr() });
  }
  // Sort cashflows by date ascending for XIRR
  allCashflows.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  let portfolioXIRR = 0;
  try {
    const raw = calcXIRR(allCashflows);
    portfolioXIRR = Number.isFinite(raw) && !Number.isNaN(raw) ? raw : 0;
  } catch {
    portfolioXIRR = 0;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">Mutual Funds</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {groups.length} fund{groups.length !== 1 ? "s" : ""} ·{" "}
            {mutualFunds.length} transaction
            {mutualFunds.length !== 1 ? "s" : ""} · {formatINR(totalValue)} ·{" "}
            <span className={gainLossClass(totalGain)}>
              {formatINRWithSign(totalGain)} ({formatPercent(totalGainPct)})
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-ocid="mf.refresh.button"
            variant="outline"
            size="sm"
            onClick={refreshMFPrices}
            disabled={isRefreshingMF}
            className="border-border gap-2"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isRefreshingMF && "animate-spin")}
            />
            {isRefreshingMF ? "Updating…" : "Refresh NAV"}
          </Button>
          <Button
            data-ocid="mf.add.open_modal_button"
            onClick={() => {
              setEditTarget(null);
              setAddSipTarget(null);
              setModalOpen(true);
            }}
            className="bg-primary text-primary-foreground gap-2"
            size="sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Fund
          </Button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Invested", value: formatINR(totalInvested) },
          { label: "Current Value", value: formatINR(totalValue) },
          {
            label: "Total Gain",
            value: formatINRWithSign(totalGain),
            cls: gainLossClass(totalGain),
          },
          {
            label: "Portfolio XIRR",
            value: portfolioXIRR !== 0 ? formatPercent(portfolioXIRR, 1) : "--",
            cls: portfolioXIRR !== 0 ? gainLossClass(portfolioXIRR) : undefined,
          },
        ].map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p
                className={cn(
                  "text-lg font-display font-bold number-tabular mt-0.5",
                  s.cls,
                )}
              >
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <MFCapAllocation />
      {/* Holdings Table */}
      <Card className="bg-card border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Holdings{" "}
            <span className="text-xs font-normal text-muted-foreground ml-1">
              (consolidated by fund)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isRefreshingMF ? (
            <div className="p-4 space-y-3">
              {["r1", "r2", "r3", "r4"].map((k) => (
                <Skeleton key={k} className="h-12 w-full" />
              ))}
              <div data-ocid="mf.loading_state" className="sr-only">
                Loading mutual fund data
              </div>
            </div>
          ) : mutualFunds.length === 0 ? (
            <div
              data-ocid="mf.empty_state"
              className="py-16 flex flex-col items-center gap-3 text-muted-foreground"
            >
              <TrendingUp className="w-10 h-10 opacity-30" />
              <p className="text-sm">No funds added yet.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditTarget(null);
                  setAddSipTarget(null);
                  setModalOpen(true);
                }}
                className="border-border"
              >
                Add your first fund
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    {/* Expand chevron column */}
                    <th className="w-8 pl-2" />
                    <SortTh field="schemeName" className="text-left">
                      Fund Name
                    </SortTh>
                    <SortTh field="currentNAV" className="text-right">
                      Curr. NAV
                    </SortTh>
                    <SortTh field="totalUnits" className="text-right">
                      Total Units
                    </SortTh>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Avg NAV
                    </th>
                    <SortTh field="invested" className="text-right">
                      Invested
                    </SortTh>
                    <SortTh field="currentValue" className="text-right">
                      Curr. Value
                    </SortTh>
                    <SortTh field="gainLoss" className="text-right">
                      Gain / Loss
                    </SortTh>
                    <SortTh field="gainPct" className="text-right">
                      Returns
                    </SortTh>
                    <th className="px-3 py-2.5 text-right pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((group, gi) => {
                    const gain = group.currentValue - group.totalInvested;
                    const gainPct =
                      group.totalInvested > 0
                        ? (gain / group.totalInvested) * 100
                        : 0;
                    const isExpanded = expandedGroups.has(group.schemeCode);
                    const idx = gi + 1;
                    const showXIRR =
                      group.xirr !== 0 &&
                      Number.isFinite(group.xirr) &&
                      !Number.isNaN(group.xirr);

                    return (
                      <>
                        {/* ── Group Row ── */}
                        <tr
                          key={`group-${group.schemeCode}`}
                          data-ocid={`mf.item.${idx}`}
                          className="border-b border-border/50 hover:bg-accent/20 transition-colors"
                        >
                          {/* Expand chevron */}
                          <td className="pl-2 py-3 w-8">
                            <button
                              type="button"
                              data-ocid={`mf.group.expand_button.${idx}`}
                              onClick={() => toggleExpand(group.schemeCode)}
                              className="flex items-center justify-center w-6 h-6 rounded hover:bg-accent transition-colors text-muted-foreground"
                              aria-label={
                                isExpanded
                                  ? "Collapse transactions"
                                  : "Expand transactions"
                              }
                            >
                              <ChevronRight
                                className={cn(
                                  "w-4 h-4 transition-transform duration-200",
                                  isExpanded && "rotate-90",
                                )}
                              />
                            </button>
                          </td>

                          {/* Fund Name */}
                          <td className="px-3 py-3">
                            <p className="font-semibold text-foreground leading-snug max-w-[220px] truncate">
                              {group.schemeName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {group.schemeCode} · {group.holdings.length} SIP
                              {group.holdings.length !== 1 ? "s" : ""}
                            </p>
                          </td>

                          {/* Current NAV */}
                          <td className="px-3 py-3 text-right number-tabular font-semibold">
                            ₹{group.currentNAV.toFixed(4)}
                          </td>

                          {/* Total Units */}
                          <td className="px-3 py-3 text-right number-tabular text-muted-foreground">
                            {group.totalUnits.toFixed(3)}
                          </td>

                          {/* Avg NAV */}
                          <td className="px-3 py-3 text-right number-tabular text-muted-foreground">
                            ₹{group.avgNAV.toFixed(4)}
                          </td>

                          {/* Invested */}
                          <td className="px-3 py-3 text-right number-tabular text-muted-foreground">
                            {formatINR(group.totalInvested)}
                          </td>

                          {/* Current Value */}
                          <td className="px-3 py-3 text-right number-tabular font-semibold">
                            {formatINR(group.currentValue)}
                          </td>

                          {/* Gain / Loss */}
                          <td
                            className={cn(
                              "px-3 py-3 text-right number-tabular font-semibold",
                              gainLossClass(gain),
                            )}
                          >
                            {formatINRWithSign(gain)}
                          </td>

                          {/* Returns */}
                          <td
                            className={cn(
                              "px-3 py-3 text-right number-tabular",
                              gainLossClass(gain),
                            )}
                          >
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold">
                                {formatPercent(gainPct)}
                              </span>
                              <span
                                className={cn(
                                  "text-xs",
                                  showXIRR
                                    ? gainLossClass(group.xirr)
                                    : "text-muted-foreground",
                                )}
                              >
                                {showXIRR
                                  ? `${group.xirr.toFixed(1)}% XIRR`
                                  : "--"}
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-3 pr-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                data-ocid={`mf.add_sip_button.${idx}`}
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-primary hover:bg-primary/10 gap-1"
                                onClick={() => {
                                  setEditTarget(null);
                                  setAddSipTarget({
                                    schemeCode: group.schemeCode,
                                    schemeName: group.schemeName,
                                  });
                                  setModalOpen(true);
                                }}
                              >
                                <Plus className="w-3 h-3" />
                                SIP
                              </Button>
                              <Button
                                data-ocid={`mf.group.delete_button.${idx}`}
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 hover:bg-loss/20 hover:text-loss"
                                onClick={() => handleDeleteGroup(group)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded Sub-Rows ── */}
                        {isExpanded &&
                          group.holdings.map((h, ti) => {
                            const txInvested = h.units * h.purchaseNAV;
                            const txValue = h.units * group.currentNAV;
                            const txGain = txValue - txInvested;
                            const txGainPct =
                              txInvested > 0 ? (txGain / txInvested) * 100 : 0;
                            const txIdx = ti + 1;
                            const isLastSub = ti === group.holdings.length - 1;

                            return (
                              <tr
                                key={h.id}
                                className={cn(
                                  "bg-muted/30 transition-colors hover:bg-muted/50",
                                  !isLastSub && "border-b border-border/30",
                                )}
                              >
                                {/* indent spacer */}
                                <td className="w-8" />

                                {/* Date */}
                                <td className="px-3 py-2.5 pl-6">
                                  <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                                    <div>
                                      <p className="text-xs text-muted-foreground font-medium">
                                        {formatDate(h.purchaseDate)}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                {/* curr NAV (placeholder for column alignment) */}
                                <td className="px-3 py-2.5 text-right text-xs text-muted-foreground number-tabular" />

                                {/* Units */}
                                <td className="px-3 py-2.5 text-right text-xs number-tabular text-muted-foreground">
                                  {h.units.toFixed(3)}
                                </td>

                                {/* Purchase NAV */}
                                <td className="px-3 py-2.5 text-right text-xs number-tabular text-muted-foreground">
                                  ₹{h.purchaseNAV.toFixed(4)}
                                </td>

                                {/* Invested */}
                                <td className="px-3 py-2.5 text-right text-xs number-tabular text-muted-foreground">
                                  {formatINR(txInvested)}
                                </td>

                                {/* Current Value */}
                                <td className="px-3 py-2.5 text-right text-xs number-tabular">
                                  {formatINR(txValue)}
                                </td>

                                {/* Gain / Loss */}
                                <td
                                  className={cn(
                                    "px-3 py-2.5 text-right text-xs number-tabular font-medium",
                                    gainLossClass(txGain),
                                  )}
                                >
                                  {formatINRWithSign(txGain)}
                                </td>

                                {/* Returns % */}
                                <td
                                  className={cn(
                                    "px-3 py-2.5 text-right text-xs number-tabular",
                                    gainLossClass(txGain),
                                  )}
                                >
                                  {formatPercent(txGainPct)}
                                </td>

                                {/* Actions */}
                                <td className="px-3 py-2.5 pr-4">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      data-ocid={`mf.txn.edit_button.${idx}.${txIdx}`}
                                      variant="ghost"
                                      size="icon"
                                      className="w-6 h-6 hover:bg-accent"
                                      onClick={() => {
                                        setEditTarget(h);
                                        setAddSipTarget(null);
                                        setModalOpen(true);
                                      }}
                                    >
                                      <Pencil className="w-3 h-3 text-muted-foreground" />
                                    </Button>
                                    <Button
                                      data-ocid={`mf.txn.delete_button.${idx}.${txIdx}`}
                                      variant="ghost"
                                      size="icon"
                                      className="w-6 h-6 hover:bg-loss/20 hover:text-loss"
                                      onClick={() =>
                                        handleDeleteTransaction(
                                          h.id,
                                          h.schemeName,
                                        )
                                      }
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <FundModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
          setAddSipTarget(null);
        }}
        editData={editTarget}
        addSipData={addSipTarget}
      />
    </div>
  );
}
