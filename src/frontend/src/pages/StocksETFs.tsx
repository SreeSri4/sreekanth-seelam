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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type StockHolding, usePortfolio } from "@/context/PortfolioContext";
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
import {
  BarChart2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

interface StockGroup {
  symbol: string;
  exchange: string;
  companyName: string;
  assetType: "stock" | "etf";
  currentPrice: number;
  totalQty: number;
  avgBuyPrice: number;
  totalInvested: number;
  currentValue: number;
  xirr: number;
  holdings: StockHolding[];
}

type SortField =
  | "company"
  | "currentPrice"
  | "qty"
  | "invested"
  | "value"
  | "gain"
  | "gainPct";
type SortDir = "asc" | "desc";

// ─── Group By Symbol ────────────────────────────────────────────────────────

function groupBySymbol(
  holdings: StockHolding[],
  assetType: "stock" | "etf",
): StockGroup[] {
  const filtered = holdings.filter((h) => h.assetType === assetType);
  const map = new Map<string, StockHolding[]>();
  for (const h of filtered) {
    const existing = map.get(h.symbol) ?? [];
    existing.push(h);
    map.set(h.symbol, existing);
  }

  const today = todayStr();
  const groups: StockGroup[] = [];

  for (const [symbol, list] of map.entries()) {
    const totalQty = list.reduce((s, h) => s + h.quantity, 0);
    const totalInvested = list.reduce((s, h) => s + h.quantity * h.buyPrice, 0);
    const avgBuyPrice = totalQty > 0 ? totalInvested / totalQty : 0;
    const currentPrice = list[list.length - 1].currentPrice;
    const currentValue = totalQty * currentPrice;

    const sortedByDate = [...list].sort(
      (a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime(),
    );

    const cashflows: { amount: number; date: string }[] = [
      ...sortedByDate.map((h) => ({
        amount: -(h.quantity * h.buyPrice),
        date: h.buyDate,
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
      symbol,
      exchange: list[0].exchange,
      companyName: list[0].companyName,
      assetType,
      currentPrice,
      totalQty,
      avgBuyPrice,
      totalInvested,
      currentValue,
      xirr,
      holdings: sortedByDate,
    });
  }

  return groups;
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────

interface StockFormData {
  symbol: string;
  exchange: string;
  companyName: string;
  quantity: string;
  buyPrice: string;
  buyDate: string;
}

const EMPTY_FORM = (_assetType: "stock" | "etf"): StockFormData => ({
  symbol: "",
  exchange: "NSE",
  companyName: "",
  quantity: "",
  buyPrice: "",
  buyDate: todayStr(),
});

interface StockModalProps {
  open: boolean;
  onClose: () => void;
  assetType: "stock" | "etf";
  editData?: StockHolding | null;
  /** When set, pre-fill symbol/company – "Add Buy" mode */
  addBuyData?: { symbol: string; exchange: string; companyName: string } | null;
}

function StockModal({
  open,
  onClose,
  assetType,
  editData,
  addBuyData,
}: StockModalProps) {
  const { addStock, updateStock, addTransaction } = usePortfolio();
  const [form, setForm] = useState<StockFormData>(() => EMPTY_FORM(assetType));

  const isBuyMode = !!addBuyData && !editData;

  // Reset on open
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      if (editData) {
        setForm({
          symbol: editData.symbol,
          exchange: editData.exchange,
          companyName: editData.companyName,
          quantity: String(editData.quantity),
          buyPrice: String(editData.buyPrice),
          buyDate: editData.buyDate,
        });
      } else if (addBuyData) {
        setForm({
          ...EMPTY_FORM(assetType),
          symbol: addBuyData.symbol,
          exchange: addBuyData.exchange,
          companyName: addBuyData.companyName,
        });
      } else {
        setForm(EMPTY_FORM(assetType));
      }
    }
  }

  function handleField(field: keyof StockFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number.parseFloat(form.quantity);
    const price = Number.parseFloat(form.buyPrice);
    if (
      !form.symbol ||
      !form.companyName ||
      Number.isNaN(qty) ||
      Number.isNaN(price)
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    const symbolFormatted = form.symbol.toUpperCase();

    if (editData) {
      updateStock(editData.id, {
        symbol: symbolFormatted,
        exchange: form.exchange,
        companyName: form.companyName,
        quantity: qty,
        buyPrice: price,
        buyDate: form.buyDate,
      });
      toast.success(`${assetType === "etf" ? "ETF" : "Stock"} updated.`);
    } else {
      addStock({
        symbol: symbolFormatted,
        exchange: form.exchange,
        companyName: form.companyName,
        quantity: qty,
        buyPrice: price,
        buyDate: form.buyDate,
        currentPrice: price,
        assetType,
      });
      addTransaction({
        assetType,
        assetName: form.companyName,
        transactionType: "buy",
        quantity: qty,
        price,
        date: form.buyDate,
        notes: isBuyMode
          ? `${assetType === "etf" ? "ETF" : "Stock"} buy`
          : `${assetType === "etf" ? "ETF" : "Stock"} purchase`,
      });
      toast.success(
        isBuyMode
          ? "Buy transaction added."
          : `${assetType === "etf" ? "ETF" : "Stock"} added to portfolio.`,
      );
    }
    onClose();
  }

  const typeLabel = assetType === "etf" ? "ETF" : "Stock";
  const modalTitle = editData
    ? `Edit ${typeLabel} Transaction`
    : isBuyMode
      ? `Add Buy – ${addBuyData?.companyName}`
      : `Add ${typeLabel}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="bg-card border-border text-foreground sm:max-w-md"
        data-ocid="stocks.dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {modalTitle}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Symbol + Exchange – only for new non-buy mode */}
          {!isBuyMode && !editData && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-symbol">Symbol</Label>
                <Input
                  id="s-symbol"
                  placeholder={
                    assetType === "etf" ? "NSE:NIFTYBEES" : "NSE:ICICIBANK"
                  }
                  className="bg-background border-border uppercase"
                  value={form.symbol}
                  onChange={(e) => handleField("symbol", e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Format: NSE:ICICIBANK or BSE:RELIANCE
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-exchange">Exchange</Label>
                <Select
                  value={form.exchange}
                  onValueChange={(v) => handleField("exchange", v)}
                >
                  <SelectTrigger
                    id="s-exchange"
                    className="bg-background border-border"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="NSE">NSE</SelectItem>
                    <SelectItem value="BSE">BSE</SelectItem>
                    <SelectItem value="US">US</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Symbol display for buy/edit mode */}
          {(isBuyMode || editData) && (
            <div className="space-y-1.5">
              <Label>Symbol</Label>
              <p className="text-sm text-muted-foreground bg-background rounded-lg px-3 py-2 border border-border font-mono">
                {form.symbol}
                <span className="text-xs ml-2 opacity-60 font-sans">
                  · {form.exchange}
                </span>
              </p>
            </div>
          )}

          {/* Company Name – only for new non-buy mode */}
          {!isBuyMode && (
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Company Name</Label>
              <Input
                id="s-name"
                placeholder="Reliance Industries"
                className="bg-background border-border"
                value={form.companyName}
                onChange={(e) => handleField("companyName", e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-qty">Quantity</Label>
              <Input
                id="s-qty"
                type="number"
                step="1"
                min="0"
                placeholder="25"
                className="bg-background border-border"
                value={form.quantity}
                onChange={(e) => handleField("quantity", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-price">Buy Price (₹)</Label>
              <Input
                id="s-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="2450.00"
                className="bg-background border-border"
                value={form.buyPrice}
                onChange={(e) => handleField("buyPrice", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-date">Buy Date</Label>
            <Input
              id="s-date"
              type="date"
              className="bg-background border-border"
              value={form.buyDate}
              max={todayStr()}
              onChange={(e) => handleField("buyDate", e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-ocid="stocks.cancel_button"
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-ocid={
                assetType === "etf"
                  ? "etfs.add.submit_button"
                  : "stocks.add.submit_button"
              }
              className="bg-primary text-primary-foreground"
            >
              {editData
                ? "Save Changes"
                : isBuyMode
                  ? "Add Buy"
                  : `Add ${typeLabel}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Holdings Table ─────────────────────────────────────────────────────────

interface HoldingsTableProps {
  groups: StockGroup[];
  assetType: "stock" | "etf";
  isLoading: boolean;
  onEdit: (h: StockHolding) => void;
  onDelete: (id: string, name: string) => void;
  onDeleteGroup: (group: StockGroup) => void;
  onAddBuy: (group: StockGroup) => void;
}

function HoldingsTable({
  groups,
  assetType,
  isLoading,
  onEdit,
  onDelete,
  onDeleteGroup,
  onAddBuy,
}: HoldingsTableProps) {
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function handleSort(f: SortField) {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("desc");
    }
  }

  function toggleExpand(symbol: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  }

  const sorted = [...groups].sort((a, b) => {
    const gainA = a.currentValue - a.totalInvested;
    const gainB = b.currentValue - b.totalInvested;
    const gainPctA = a.totalInvested > 0 ? (gainA / a.totalInvested) * 100 : 0;
    const gainPctB = b.totalInvested > 0 ? (gainB / b.totalInvested) * 100 : 0;

    const map: Record<SortField, number> = {
      company: a.companyName.localeCompare(b.companyName),
      currentPrice: a.currentPrice - b.currentPrice,
      qty: a.totalQty - b.totalQty,
      invested: a.totalInvested - b.totalInvested,
      value: a.currentValue - b.currentValue,
      gain: gainA - gainB,
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

  function Th({
    field,
    children,
    right,
  }: { field: SortField; children: React.ReactNode; right?: boolean }) {
    return (
      <th
        className={cn(
          "px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none whitespace-nowrap",
          right ? "text-right" : "text-left",
        )}
        onClick={() => handleSort(field)}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") && handleSort(field)
        }
      >
        <span className={cn("flex items-center gap-1", right && "justify-end")}>
          {children}
          <SortIcon field={field} />
        </span>
      </th>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {["r1", "r2", "r3"].map((k) => (
          <Skeleton key={k} className="h-12 w-full" />
        ))}
        <div data-ocid="stocks.loading_state" className="sr-only">
          Loading stock data
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        data-ocid={`${assetType === "etf" ? "etf" : "stock"}.empty_state`}
        className="py-12 flex flex-col items-center gap-3 text-muted-foreground"
      >
        <BarChart2 className="w-10 h-10 opacity-30" />
        <p className="text-sm">
          No {assetType === "etf" ? "ETFs" : "stocks"} added yet.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr>
            {/* Expand chevron column */}
            <th className="w-8 pl-2" />
            <Th field="company">Symbol / Company</Th>
            <Th field="currentPrice" right>
              Curr. Price
            </Th>
            <Th field="qty" right>
              Total Qty
            </Th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
              Avg Buy
            </th>
            <Th field="invested" right>
              Invested
            </Th>
            <Th field="value" right>
              Curr. Value
            </Th>
            <Th field="gain" right>
              Gain / Loss
            </Th>
            <Th field="gainPct" right>
              Returns
            </Th>
            <th className="px-3 py-2.5 text-right pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((group, gi) => {
            const gain = group.currentValue - group.totalInvested;
            const gainPct =
              group.totalInvested > 0 ? (gain / group.totalInvested) * 100 : 0;
            const isExpanded = expandedGroups.has(group.symbol);
            const idx = gi + 1;
            const showXIRR =
              group.xirr !== 0 &&
              Number.isFinite(group.xirr) &&
              !Number.isNaN(group.xirr);

            return (
              <>
                {/* ── Group Row ── */}
                <tr
                  key={`group-${group.symbol}`}
                  data-ocid={`${assetType === "etf" ? "etf" : "stock"}.item.${idx}`}
                  className="border-b border-border/50 hover:bg-accent/20 transition-colors"
                >
                  {/* Expand chevron */}
                  <td className="pl-2 py-3 w-8">
                    <button
                      type="button"
                      data-ocid={`${assetType}.group.expand_button.${idx}`}
                      onClick={() => toggleExpand(group.symbol)}
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

                  {/* Symbol / Company */}
                  <td className="px-3 py-3">
                    <p className="font-semibold text-foreground font-mono leading-snug">
                      {group.symbol}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {group.companyName} · {group.exchange} ·{" "}
                      {group.holdings.length} buy
                      {group.holdings.length !== 1 ? "s" : ""}
                    </p>
                  </td>

                  {/* Current Price */}
                  <td className="px-3 py-3 text-right number-tabular font-semibold">
                    {formatINR(group.currentPrice)}
                  </td>

                  {/* Total Qty */}
                  <td className="px-3 py-3 text-right number-tabular text-muted-foreground">
                    {group.totalQty}
                  </td>

                  {/* Avg Buy */}
                  <td className="px-3 py-3 text-right number-tabular text-muted-foreground">
                    {formatINR(group.avgBuyPrice)}
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
                        {showXIRR ? `${group.xirr.toFixed(1)}% XIRR` : "--"}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3 pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        data-ocid={`${assetType}.add_buy_button.${idx}`}
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-primary hover:bg-primary/10 gap-1"
                        onClick={() => onAddBuy(group)}
                      >
                        <Plus className="w-3 h-3" />
                        Buy
                      </Button>
                      <Button
                        data-ocid={`${assetType}.group.delete_button.${idx}`}
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 hover:bg-loss/20 hover:text-loss"
                        onClick={() => onDeleteGroup(group)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>

                {/* ── Expanded Sub-Rows ── */}
                {isExpanded &&
                  group.holdings.map((h, ti) => {
                    const txInvested = h.quantity * h.buyPrice;
                    const txValue = h.quantity * group.currentPrice;
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
                            <p className="text-xs text-muted-foreground font-medium">
                              {formatDate(h.buyDate)}
                            </p>
                          </div>
                        </td>

                        {/* curr price (alignment) */}
                        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground number-tabular" />

                        {/* Qty */}
                        <td className="px-3 py-2.5 text-right text-xs number-tabular text-muted-foreground">
                          {h.quantity}
                        </td>

                        {/* Buy Price */}
                        <td className="px-3 py-2.5 text-right text-xs number-tabular text-muted-foreground">
                          {formatINR(h.buyPrice)}
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
                              data-ocid={`${assetType}.txn.edit_button.${idx}.${txIdx}`}
                              variant="ghost"
                              size="icon"
                              className="w-6 h-6 hover:bg-accent"
                              onClick={() => onEdit(h)}
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </Button>
                            <Button
                              data-ocid={`${assetType}.txn.delete_button.${idx}.${txIdx}`}
                              variant="ghost"
                              size="icon"
                              className="w-6 h-6 hover:bg-loss/20 hover:text-loss"
                              onClick={() => onDelete(h.id, h.companyName)}
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
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function StocksETFs() {
  const {
    stocks,
    deleteStock,
    isRefreshingStocks,
    refreshStockPrices,
    totals,
  } = usePortfolio();
  const [activeTab, setActiveTab] = useState<"stock" | "etf">("etf");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockHolding | null>(null);
  const [addBuyTarget, setAddBuyTarget] = useState<{
    symbol: string;
    exchange: string;
    companyName: string;
  } | null>(null);

  const stockGroups = groupBySymbol(stocks, "stock");
  const etfGroups = groupBySymbol(stocks, "etf");
  const currentGroups = activeTab === "stock" ? stockGroups : etfGroups;

  const stocksList = stocks.filter((s) => s.assetType === "stock");
  const etfsList = stocks.filter((s) => s.assetType === "etf");

  const activeValue =
    activeTab === "stock" ? totals.stockValue : totals.etfValue;
  const activeInvested =
    activeTab === "stock" ? totals.stockInvested : totals.etfInvested;
  const activeGain = activeValue - activeInvested;
  const activeGainPct =
    activeInvested > 0 ? (activeGain / activeInvested) * 100 : 0;

  function handleDelete(id: string, name: string) {
    if (confirm(`Remove this transaction for "${name}"?`)) {
      deleteStock(id);
      toast.success("Transaction removed.");
    }
  }

  function handleDeleteGroup(group: StockGroup) {
    if (
      confirm(
        `Delete ALL ${group.holdings.length} transaction(s) for "${group.companyName}"? This cannot be undone.`,
      )
    ) {
      for (const h of group.holdings) {
        deleteStock(h.id);
      }
      toast.success(`${group.companyName} removed from portfolio.`);
    }
  }

  function handleEdit(h: StockHolding) {
    setEditTarget(h);
    setAddBuyTarget(null);
    setActiveTab(h.assetType);
    setModalOpen(true);
  }

  function handleAddBuy(group: StockGroup) {
    setEditTarget(null);
    setAddBuyTarget({
      symbol: group.symbol,
      exchange: group.exchange,
      companyName: group.companyName,
    });
    setActiveTab(group.assetType);
    setModalOpen(true);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">Stocks & ETFs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stockGroups.length} stocks ({stocksList.length} txns),{" "}
            {etfGroups.length} ETFs ({etfsList.length} txns) ·{" "}
            <span
              className={gainLossClass(
                totals.stockValue +
                  totals.etfValue -
                  totals.stockInvested -
                  totals.etfInvested,
              )}
            >
              {formatINRWithSign(
                totals.stockValue +
                  totals.etfValue -
                  totals.stockInvested -
                  totals.etfInvested,
              )}{" "}
              overall
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-ocid="stocks.refresh.button"
            variant="outline"
            size="sm"
            onClick={refreshStockPrices}
            disabled={isRefreshingStocks}
            className="border-border gap-2"
          >
            <RefreshCw
              className={cn(
                "w-3.5 h-3.5",
                isRefreshingStocks && "animate-spin",
              )}
            />
            {isRefreshingStocks ? "Updating…" : "Refresh Prices"}
          </Button>
          <Button
            data-ocid={
              activeTab === "etf"
                ? "etfs.add.open_modal_button"
                : "stocks.add.open_modal_button"
            }
            onClick={() => {
              setEditTarget(null);
              setAddBuyTarget(null);
              setModalOpen(true);
            }}
            className="bg-primary text-primary-foreground gap-2"
            size="sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add {activeTab === "etf" ? "ETF" : "Stock"}
          </Button>
        </div>
      </div>

      {/* Tab + Summary */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-secondary rounded-lg p-1">
          <button
            data-ocid="stocks.tab"
            type="button"
            onClick={() => setActiveTab("stock")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              activeTab === "stock"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Stocks ({stockGroups.length})
          </button>
          <button
            data-ocid="etfs.tab"
            type="button"
            onClick={() => setActiveTab("etf")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              activeTab === "etf"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            ETFs ({etfGroups.length})
          </button>
        </div>

        <div className="flex gap-3">
          {[
            { label: "Invested", value: formatINR(activeInvested) },
            { label: "Current", value: formatINR(activeValue) },
            {
              label: "Gain/Loss",
              value: `${formatINRWithSign(activeGain)} (${formatPercent(activeGainPct)})`,
              cls: gainLossClass(activeGain),
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-card border border-border rounded-lg px-3 py-1.5"
            >
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("text-sm font-semibold number-tabular", s.cls)}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card className="bg-card border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            {activeTab === "etf" ? "ETF" : "Stock"} Holdings{" "}
            <span className="text-xs font-normal text-muted-foreground ml-1">
              (consolidated by symbol)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <HoldingsTable
            groups={currentGroups}
            assetType={activeTab}
            isLoading={isRefreshingStocks}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDeleteGroup={handleDeleteGroup}
            onAddBuy={handleAddBuy}
          />
        </CardContent>
      </Card>

      <StockModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
          setAddBuyTarget(null);
        }}
        assetType={activeTab}
        editData={editTarget}
        addBuyData={addBuyTarget}
      />
    </div>
  );
}
