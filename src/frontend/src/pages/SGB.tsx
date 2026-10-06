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
import { Skeleton } from "@/components/ui/skeleton";
import { type SgbHolding, usePortfolio } from "@/context/PortfolioContext";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatINR,
  formatINRWithSign,
  formatPercent,
  gainLossClass,
  todayStr,
} from "@/utils/format";
import { Gem, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Add/Edit Modal ───────────────────────────────────────────────────────

interface SgbFormData {
  symbol: string;
  name: string;
  units: string;
  issuePricePerGram: string;
  purchaseDate: string;
  maturityDate: string;
}

function emptySgbForm(): SgbFormData {
  return {
    symbol: "",
    name: "",
    units: "",
    issuePricePerGram: "",
    purchaseDate: todayStr(),
    maturityDate: "",
  };
}

interface SgbModalProps {
  open: boolean;
  onClose: () => void;
  editData?: SgbHolding | null;
}

function SgbModal({ open, onClose, editData }: SgbModalProps) {
  const { addSgb, updateSgb, addTransaction } = usePortfolio();
  const [form, setForm] = useState<SgbFormData>(() => emptySgbForm());

  // Reset on open
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      if (editData) {
        setForm({
          symbol: editData.symbol,
          name: editData.name,
          units: String(editData.units),
          issuePricePerGram: String(editData.issuePricePerGram),
          purchaseDate: editData.purchaseDate,
          maturityDate: editData.maturityDate,
        });
      } else {
        setForm(emptySgbForm());
      }
    }
  }

  function setField<K extends keyof SgbFormData>(key: K, val: SgbFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const units = Number.parseFloat(form.units);
    const issuePricePerGram = Number.parseFloat(form.issuePricePerGram);

    if (
      !form.symbol ||
      !form.name ||
      Number.isNaN(units) ||
      Number.isNaN(issuePricePerGram)
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    if (editData) {
      updateSgb(editData.id, {
        symbol: form.symbol.toUpperCase(),
        name: form.name,
        units,
        issuePricePerGram,
        purchaseDate: form.purchaseDate,
        maturityDate: form.maturityDate,
      });
      toast.success("SGB holding updated.");
    } else {
      addSgb({
        symbol: form.symbol.toUpperCase(),
        name: form.name,
        units,
        issuePricePerGram,
        purchaseDate: form.purchaseDate,
        maturityDate: form.maturityDate,
        currentPricePerGram: issuePricePerGram,
      });
      addTransaction({
        assetType: "debt",
        assetName: form.name,
        transactionType: "buy",
        quantity: units,
        price: issuePricePerGram * units,
        date: form.purchaseDate,
        notes: "SGB investment",
      });
      toast.success("SGB holding added.");
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="bg-card border-border text-foreground sm:max-w-lg"
        data-ocid="sgb.dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {editData ? "Edit SGB Holding" : "Add SGB Holding"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sgb-symbol">Symbol</Label>
              <Input
                id="sgb-symbol"
                placeholder="SGBMAR29"
                className="bg-background border-border font-mono uppercase"
                value={form.symbol}
                onChange={(e) => setField("symbol", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                e.g. SGBMAR29 — used to fetch live price
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sgb-name">Name / Description</Label>
              <Input
                id="sgb-name"
                placeholder="SGB 2021-22 Series X"
                className="bg-background border-border"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sgb-units">Units (grams)</Label>
              <Input
                id="sgb-units"
                type="number"
                step="1"
                min="1"
                placeholder="10"
                className="bg-background border-border"
                value={form.units}
                onChange={(e) => setField("units", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sgb-issue">Issue Price / gram (₹)</Label>
              <Input
                id="sgb-issue"
                type="number"
                step="1"
                min="0"
                placeholder="4791"
                className="bg-background border-border"
                value={form.issuePricePerGram}
                onChange={(e) => setField("issuePricePerGram", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sgb-purchase">Purchase Date</Label>
              <Input
                id="sgb-purchase"
                type="date"
                className="bg-background border-border"
                value={form.purchaseDate}
                max={todayStr()}
                onChange={(e) => setField("purchaseDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sgb-maturity">Maturity Date</Label>
              <Input
                id="sgb-maturity"
                type="date"
                className="bg-background border-border"
                value={form.maturityDate}
                onChange={(e) => setField("maturityDate", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-ocid="sgb.cancel_button"
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-ocid="sgb.add.submit_button"
              className="bg-primary text-primary-foreground"
            >
              {editData ? "Save Changes" : "Add Holding"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── SGB Table ────────────────────────────────────────────────────────────

interface SgbTableProps {
  holdings: SgbHolding[];
  onEdit: (h: SgbHolding) => void;
  onDelete: (id: string, name: string) => void;
  isLoading: boolean;
}

function SgbTable({ holdings, onEdit, onDelete, isLoading }: SgbTableProps) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {["r1", "r2", "r3"].map((k) => (
          <Skeleton key={k} className="h-12 w-full" />
        ))}
        <div data-ocid="sgb.loading_state" className="sr-only">
          Loading SGB data
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div
        data-ocid="sgb.empty_state"
        className="py-12 flex flex-col items-center gap-3 text-muted-foreground"
      >
        <Gem className="w-10 h-10 opacity-30" />
        <p className="text-sm">No SGB holdings added yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Name
            </th>
            <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Symbol
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Units (g)
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Issue ₹/g
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Current ₹/g
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Current Value
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Gain / Loss
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Maturity
            </th>
            <th className="px-3 py-2.5 text-right pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => {
            const invested = h.units * h.issuePricePerGram;
            const value = h.units * h.currentPricePerGram;
            const gain = value - invested;
            const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
            const idx = i + 1;

            return (
              <tr
                key={h.id}
                data-ocid={`sgb.item.${idx}`}
                className="border-b border-border/50 hover:bg-accent/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{h.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Purchased: {formatDate(h.purchaseDate)}
                  </p>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 font-mono">
                    {h.symbol}
                  </span>
                </td>
                <td className="px-3 py-3 text-right number-tabular text-muted-foreground">
                  {h.units}g
                </td>
                <td className="px-3 py-3 text-right number-tabular text-muted-foreground">
                  {formatINR(h.issuePricePerGram)}
                </td>
                <td className="px-3 py-3 text-right number-tabular font-semibold">
                  {formatINR(h.currentPricePerGram)}
                </td>
                <td className="px-3 py-3 text-right number-tabular font-semibold">
                  {formatINR(value)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right number-tabular font-semibold",
                    gainLossClass(gain),
                  )}
                >
                  {formatINRWithSign(gain)}
                  <span className="text-xs ml-1 opacity-70">
                    ({formatPercent(gainPct)})
                  </span>
                </td>
                <td className="px-3 py-3 text-right number-tabular text-muted-foreground">
                  {h.maturityDate ? formatDate(h.maturityDate) : "—"}
                </td>
                <td className="px-3 py-3 pr-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      data-ocid={`sgb.edit_button.${idx}`}
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 hover:bg-accent"
                      onClick={() => onEdit(h)}
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      data-ocid={`sgb.delete_button.${idx}`}
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 hover:bg-loss/20 hover:text-loss"
                      onClick={() => onDelete(h.id, h.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── SGB Page ──────────────────────────────────────────────────────────────

export default function SGB() {
  const { sgbHoldings, deleteSgb, isRefreshingSGB, refreshSGBPrices, totals } =
    usePortfolio();

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SgbHolding | null>(null);

  const totalGain = totals.sgbValue - totals.sgbInvested;
  const totalGainPct =
    totals.sgbInvested > 0 ? (totalGain / totals.sgbInvested) * 100 : 0;

  function handleDelete(id: string, name: string) {
    if (confirm(`Remove "${name}" from portfolio?`)) {
      deleteSgb(id);
      toast.success("SGB holding removed.");
    }
  }

  function handleEdit(h: SgbHolding) {
    setEditTarget(h);
    setModalOpen(true);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">SGB Holdings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sgbHoldings.length} holdings · {formatINR(totals.sgbValue)} ·{" "}
            <span className={gainLossClass(totalGain)}>
              {formatINRWithSign(totalGain)} ({formatPercent(totalGainPct)})
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-ocid="sgb.refresh_button"
            variant="outline"
            size="sm"
            onClick={refreshSGBPrices}
            disabled={isRefreshingSGB}
            className="border-border gap-2"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isRefreshingSGB && "animate-spin")}
            />
            {isRefreshingSGB ? "Updating…" : "Refresh Price"}
          </Button>
          <Button
            data-ocid="sgb.add.open_modal_button"
            onClick={() => {
              setEditTarget(null);
              setModalOpen(true);
            }}
            className="bg-primary text-primary-foreground gap-2"
            size="sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Holding
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Invested", value: formatINR(totals.sgbInvested) },
          { label: "Current Value", value: formatINR(totals.sgbValue) },
          {
            label: "Overall Gain / Loss",
            value: `${formatINRWithSign(totalGain)} (${formatPercent(totalGainPct)})`,
            cls: gainLossClass(totalGain),
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

      {/* Info note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-3">
        <Gem className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
        <span>
          Live prices are fetched from NSE via{" "}
          <span className="font-mono text-primary">
            /api/stock-price
          </span>{" "}
          using the SGB Symbol. Click <strong>Refresh Price</strong> to pull the
          latest gold bond prices.
        </span>
      </div>

      {/* Table */}
      <Card className="bg-card border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Sovereign Gold Bond Holdings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SgbTable
            holdings={sgbHoldings}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isLoading={isRefreshingSGB}
          />
        </CardContent>
      </Card>

      <SgbModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
        }}
        editData={editTarget}
      />
    </div>
  );
}
