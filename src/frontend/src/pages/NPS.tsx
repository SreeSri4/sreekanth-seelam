import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { type NpsHolding, usePortfolio } from "@/context/PortfolioContext";
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
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import CollapsibleSection from "@/components/CollapsibleSection";
import NPSProjection from "@/components/NPSProjection";

// ─── Types ─────────────────────────────────────────────────────────────────

interface NpsGroup {
  pfmId: string;
  schemeName: string;
  tier: "I" | "II";
  currentNAV: number;
  totalUnits: number;
  avgNAV: number;
  totalInvested: number;
  currentValue: number;
  xirr: number;
  holdings: NpsHolding[];
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

// ─── Group By PFM ───────────────────────────────────────────────────────────

function groupByPfm(holdings: NpsHolding[]): NpsGroup[] {
  const map = new Map<string, NpsHolding[]>();
  for (const h of holdings) {
    const key = `${h.pfmId}__${h.tier}`;
    const existing = map.get(key) ?? [];
    existing.push(h);
    map.set(key, existing);
  }

  const today = todayStr();
  const groups: NpsGroup[] = [];

  for (const [, list] of map.entries()) {
    const totalUnits    = list.reduce((s, h) => s + h.units, 0);
    const totalInvested = list.reduce((s, h) => s + h.units * h.purchaseNAV, 0);
    const avgNAV        = totalUnits > 0 ? totalInvested / totalUnits : 0;
    const currentNAV    = list[list.length - 1].currentNAV;
    const currentValue  = totalUnits * currentNAV;

    const sortedByDate = [...list].sort(
      (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime(),
    );

    const cashflows: { amount: number; date: string }[] = [
      ...sortedByDate.map((h) => ({ amount: -(h.units * h.purchaseNAV), date: h.purchaseDate })),
      { amount: currentValue, date: today },
    ];

    let xirr = 0;
    try {
      const raw = calcXIRR(cashflows);
      xirr = Number.isFinite(raw) && !Number.isNaN(raw) ? raw : 0;
    } catch { xirr = 0; }

    groups.push({
      pfmId: list[0].pfmId,
      schemeName: list[0].schemeName,
      tier: list[0].tier,
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

// ─── Add/Edit Modal ───────────────────────────────────────────────────────

interface NpsFormData {
  schemeName: string;
  pfmId: string;
  tier: "I" | "II";
  units: string;
  purchaseNAV: string;
  purchaseDate: string;
}

function emptyNpsForm(): NpsFormData {
  return { schemeName: "", pfmId: "", tier: "I", units: "", purchaseNAV: "", purchaseDate: todayStr() };
}

interface NpsModalProps {
  open: boolean;
  onClose: () => void;
  editData?: NpsHolding | null;
  addContribData?: { pfmId: string; schemeName: string; tier: "I" | "II" } | null;
}

function NpsModal({ open, onClose, editData, addContribData }: NpsModalProps) {
  const { addNps, updateNps } = usePortfolio();
  const [form, setForm] = useState<NpsFormData>(() => emptyNpsForm());
  const isContribMode   = !!addContribData && !editData;

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      if (editData) {
        setForm({ schemeName: editData.schemeName, pfmId: editData.pfmId, tier: editData.tier, units: String(editData.units), purchaseNAV: String(editData.purchaseNAV), purchaseDate: editData.purchaseDate });
      } else if (addContribData) {
        setForm({ ...emptyNpsForm(), pfmId: addContribData.pfmId, schemeName: addContribData.schemeName, tier: addContribData.tier });
      } else {
        setForm(emptyNpsForm());
      }
    }
  }

  function setField<K extends keyof NpsFormData>(key: K, val: NpsFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const units       = Number.parseFloat(form.units);
    const purchaseNAV = Number.parseFloat(form.purchaseNAV);
    if (!form.schemeName || !form.pfmId || Number.isNaN(units) || Number.isNaN(purchaseNAV)) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (editData) {
      updateNps(editData.id, { schemeName: form.schemeName, pfmId: form.pfmId, tier: form.tier, units, purchaseNAV, purchaseDate: form.purchaseDate });
      toast.success("NPS transaction updated.");
    } else {
      addNps({ schemeName: form.schemeName, pfmId: form.pfmId, tier: form.tier, units, purchaseNAV, purchaseDate: form.purchaseDate, currentNAV: purchaseNAV });
      toast.success(isContribMode ? "Contribution added." : "NPS holding added.");
    }
    onClose();
  }

  const modalTitle = editData ? "Edit NPS Transaction" : isContribMode ? `Add Contribution – ${addContribData?.schemeName}` : "Add NPS Holding";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-lg" data-ocid="nps.dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{modalTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isContribMode && !editData && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="nps-scheme">Scheme Name</Label>
                <Input id="nps-scheme" placeholder="SBI Pension Fund - Scheme E - Tier I" className="bg-background border-border" value={form.schemeName} onChange={(e) => setField("schemeName", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="nps-pfm">PFM Code</Label>
                  <Input id="nps-pfm" placeholder="SM008001" className="bg-background border-border font-mono" value={form.pfmId} onChange={(e) => setField("pfmId", e.target.value)} />
                  <p className="text-[10px] text-muted-foreground">Used to fetch live NAV from npsnav.in</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Tier</Label>
                  <Select value={form.tier} onValueChange={(v) => setField("tier", v as "I" | "II")}>
                    <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="I">Tier I</SelectItem>
                      <SelectItem value="II">Tier II</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {(isContribMode || editData) && (
            <div className="space-y-1.5">
              <Label>Scheme</Label>
              <p className="text-sm text-muted-foreground bg-background rounded-lg px-3 py-2 border border-border">
                {form.schemeName}
                <span className="text-xs ml-2 opacity-60 font-mono">({form.pfmId}) · Tier {form.tier}</span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nps-units">Units</Label>
              <Input id="nps-units" type="number" step="0.0001" min="0" placeholder="1250.5" className="bg-background border-border" value={form.units} onChange={(e) => setField("units", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nps-nav">{isContribMode ? "NAV at Contribution (₹)" : "Purchase NAV (₹)"}</Label>
              <Input id="nps-nav" type="number" step="0.0001" min="0" placeholder="28.4500" className="bg-background border-border" value={form.purchaseNAV} onChange={(e) => setField("purchaseNAV", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nps-date">{isContribMode ? "Contribution Date" : "Purchase Date"}</Label>
            <Input id="nps-date" type="date" className="bg-background border-border" value={form.purchaseDate} max={todayStr()} onChange={(e) => setField("purchaseDate", e.target.value)} />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} data-ocid="nps.cancel_button" className="border-border">Cancel</Button>
            <Button type="submit" data-ocid="nps.add.submit_button" className="bg-primary text-primary-foreground">
              {editData ? "Save Changes" : isContribMode ? "Add Contribution" : "Add Holding"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── NPS Table ────────────────────────────────────────────────────────────

interface NpsTableProps {
  groups: NpsGroup[];
  isLoading: boolean;
  onEdit: (h: NpsHolding) => void;
  onDelete: (id: string, name: string) => void;
  onDeleteGroup: (group: NpsGroup) => void;
  onAddContrib: (group: NpsGroup) => void;
}

function NpsTable({ groups, isLoading, onEdit, onDelete, onDeleteGroup, onAddContrib }: NpsTableProps) {
  const [sortField, setSortField]       = useState<SortField>("currentValue");
  const [sortDir, setSortDir]           = useState<SortDir>("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function handleSort(f: SortField) {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir("desc"); }
  }

  function toggleExpand(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const sorted = [...groups].sort((a, b) => {
    const gainA    = a.currentValue - a.totalInvested;
    const gainB    = b.currentValue - b.totalInvested;
    const gainPctA = a.totalInvested > 0 ? (gainA / a.totalInvested) * 100 : 0;
    const gainPctB = b.totalInvested > 0 ? (gainB / b.totalInvested) * 100 : 0;
    const map: Record<SortField, number> = {
      schemeName:   a.schemeName.localeCompare(b.schemeName),
      currentNAV:   a.currentNAV - b.currentNAV,
      totalUnits:   a.totalUnits - b.totalUnits,
      invested:     a.totalInvested - b.totalInvested,
      currentValue: a.currentValue - b.currentValue,
      gainLoss:     gainA - gainB,
      gainPct:      gainPctA - gainPctB,
    };
    const raw = map[sortField] ?? 0;
    return sortDir === "asc" ? raw : -raw;
  });

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-muted-foreground opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
  }

  function SortTh({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) {
    return (
      <th
        className={cn("px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none whitespace-nowrap", className)}
        onClick={() => handleSort(field)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSort(field)}
      >
        <span className="flex items-center gap-1">{children}<SortIcon field={field} /></span>
      </th>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {["r1","r2","r3"].map((k) => <Skeleton key={k} className="h-12 w-full" />)}
        <div data-ocid="nps.loading_state" className="sr-only">Loading NPS data</div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div data-ocid="nps.empty_state" className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
        <ShieldCheck className="w-10 h-10 opacity-30" />
        <p className="text-sm">No NPS holdings added yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr>
            <th className="w-8 pl-2" />
            <SortTh field="schemeName" className="text-left">Scheme Name</SortTh>
            <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Tier</th>
            <SortTh field="currentNAV"   className="text-right">Curr. NAV</SortTh>
            <SortTh field="totalUnits"   className="text-right">Total Units</SortTh>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Avg NAV</th>
            <SortTh field="invested"     className="text-right">Invested</SortTh>
            <SortTh field="currentValue" className="text-right">Curr. Value</SortTh>
            <SortTh field="gainLoss"     className="text-right">Gain / Loss</SortTh>
            <SortTh field="gainPct"      className="text-right">Returns</SortTh>
            <th className="px-3 py-2.5 text-right pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((group, gi) => {
            const gain     = group.currentValue - group.totalInvested;
            const gainPct  = group.totalInvested > 0 ? (gain / group.totalInvested) * 100 : 0;
            const groupKey = `${group.pfmId}__${group.tier}`;
            const isExpanded = expandedGroups.has(groupKey);
            const idx      = gi + 1;
            const showXIRR = group.xirr !== 0 && Number.isFinite(group.xirr) && !Number.isNaN(group.xirr);

            return (
              <>
                {/* ── Group Row ── */}
                <tr key={`group-${groupKey}`} data-ocid={`nps.item.${idx}`} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                  <td className="pl-2 py-3 w-8">
                    <button
                      type="button"
                      data-ocid={`nps.group.expand_button.${idx}`}
                      onClick={() => toggleExpand(groupKey)}
                      className="flex items-center justify-center w-6 h-6 rounded hover:bg-accent transition-colors text-muted-foreground"
                      aria-label={isExpanded ? "Collapse contributions" : "Expand contributions"}
                    >
                      <ChevronRight className={cn("w-4 h-4 transition-transform duration-200", isExpanded && "rotate-90")} />
                    </button>
                  </td>

                  <td className="px-3 py-3">
                    <p className="font-semibold text-foreground leading-snug max-w-[240px] truncate">{group.schemeName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {group.pfmId} · {group.holdings.length} contribution{group.holdings.length !== 1 ? "s" : ""}
                    </p>
                  </td>

                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/15 text-primary border border-primary/25">
                      Tier {group.tier}
                    </span>
                  </td>

                  <td className="px-3 py-3 text-right number-tabular font-semibold">₹{group.currentNAV.toFixed(4)}</td>
                  <td className="px-3 py-3 text-right number-tabular text-muted-foreground">{group.totalUnits.toFixed(4)}</td>
                  <td className="px-3 py-3 text-right number-tabular text-muted-foreground">₹{group.avgNAV.toFixed(4)}</td>
                  <td className="px-3 py-3 text-right number-tabular text-muted-foreground">{formatINR(group.totalInvested)}</td>
                  <td className="px-3 py-3 text-right number-tabular font-semibold">{formatINR(group.currentValue)}</td>
                  <td className={cn("px-3 py-3 text-right number-tabular font-semibold", gainLossClass(gain))}>{formatINRWithSign(gain)}</td>

                  {/* Returns + XIRR */}
                  <td className={cn("px-3 py-3 text-right number-tabular", gainLossClass(gain))}>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-semibold">{formatPercent(gainPct)}</span>
                      <span className={cn("text-xs", showXIRR ? gainLossClass(group.xirr) : "text-muted-foreground")}>
                        {showXIRR ? `${group.xirr.toFixed(1)}% XIRR` : "--"}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-3 pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        data-ocid={`nps.add_contrib_button.${idx}`}
                        variant="ghost" size="sm"
                        className="h-7 px-2 text-xs text-primary hover:bg-primary/10 gap-1"
                        onClick={() => onAddContrib(group)}
                      >
                        <Plus className="w-3 h-3" />Contrib
                      </Button>
                      <Button
                        data-ocid={`nps.group.delete_button.${idx}`}
                        variant="ghost" size="icon"
                        className="w-7 h-7 hover:bg-loss/20 hover:text-loss"
                        onClick={() => onDeleteGroup(group)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>

                {/* ── Expanded Sub-Rows ── */}
                {isExpanded && group.holdings.map((h, ti) => {
                  const txInvested = h.units * h.purchaseNAV;
                  const txValue    = h.units * group.currentNAV;
                  const txGain     = txValue - txInvested;
                  const txGainPct  = txInvested > 0 ? (txGain / txInvested) * 100 : 0;
                  const txIdx      = ti + 1;
                  const isLastSub  = ti === group.holdings.length - 1;

                  return (
                    <tr key={h.id} className={cn("bg-muted/30 transition-colors hover:bg-muted/50", !isLastSub && "border-b border-border/30")}>
                      <td className="w-8" />
                      <td className="px-3 py-2.5 pl-6" colSpan={2}>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground font-medium">{formatDate(h.purchaseDate)}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground number-tabular" />
                      <td className="px-3 py-2.5 text-right text-xs number-tabular text-muted-foreground">{h.units.toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-right text-xs number-tabular text-muted-foreground">₹{h.purchaseNAV.toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-right text-xs number-tabular text-muted-foreground">{formatINR(txInvested)}</td>
                      <td className="px-3 py-2.5 text-right text-xs number-tabular">{formatINR(txValue)}</td>
                      <td className={cn("px-3 py-2.5 text-right text-xs number-tabular font-medium", gainLossClass(txGain))}>{formatINRWithSign(txGain)}</td>
                      <td className={cn("px-3 py-2.5 text-right text-xs number-tabular", gainLossClass(txGain))}>{formatPercent(txGainPct)}</td>
                      <td className="px-3 py-2.5 pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button data-ocid={`nps.txn.edit_button.${idx}.${txIdx}`} variant="ghost" size="icon" className="w-6 h-6 hover:bg-accent" onClick={() => onEdit(h)}>
                            <Pencil className="w-3 h-3 text-muted-foreground" />
                          </Button>
                          <Button data-ocid={`nps.txn.delete_button.${idx}.${txIdx}`} variant="ghost" size="icon" className="w-6 h-6 hover:bg-loss/20 hover:text-loss" onClick={() => onDelete(h.id, h.schemeName)}>
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

// ─── NPS Page ─────────────────────────────────────────────────────────────

export default function NPS() {
  const { npsHoldings, deleteNps, isRefreshingNPS, refreshNPSPrices, totals } = usePortfolio();

  const [modalOpen, setModalOpen]           = useState(false);
  const [editTarget, setEditTarget]         = useState<NpsHolding | null>(null);
  const [addContribTarget, setAddContribTarget] = useState<{ pfmId: string; schemeName: string; tier: "I" | "II" } | null>(null);

  const groups      = groupByPfm(npsHoldings);
  const totalGain   = totals.npsValue - totals.npsInvested;
  const totalGainPct = totals.npsInvested > 0 ? (totalGain / totals.npsInvested) * 100 : 0;

  // Portfolio-level XIRR across all NPS holdings
  const allCashflows: { amount: number; date: string }[] = [];
  for (const h of npsHoldings) {
    allCashflows.push({ amount: -(h.units * h.purchaseNAV), date: h.purchaseDate });
  }
  if (allCashflows.length > 0) allCashflows.push({ amount: totals.npsValue, date: todayStr() });
  allCashflows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let portfolioXIRR = 0;
  try {
    const raw = calcXIRR(allCashflows);
    portfolioXIRR = Number.isFinite(raw) && !Number.isNaN(raw) ? raw : 0;
  } catch { portfolioXIRR = 0; }

  function handleDelete(id: string, name: string) {
    if (confirm(`Remove this contribution for "${name}"?`)) {
      deleteNps(id);
      toast.success("Contribution removed.");
    }
  }

  function handleDeleteGroup(group: NpsGroup) {
    if (confirm(`Delete ALL ${group.holdings.length} contribution(s) for "${group.schemeName}"? This cannot be undone.`)) {
      for (const h of group.holdings) deleteNps(h.id);
      toast.success(`${group.schemeName} removed from portfolio.`);
    }
  }

  function handleEdit(h: NpsHolding) {
    setEditTarget(h);
    setAddContribTarget(null);
    setModalOpen(true);
  }

  function handleAddContrib(group: NpsGroup) {
    setEditTarget(null);
    setAddContribTarget({ pfmId: group.pfmId, schemeName: group.schemeName, tier: group.tier });
    setModalOpen(true);
  }

  function openAddHolding() {
    setEditTarget(null);
    setAddContribTarget(null);
    setModalOpen(true);
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">NPS Holdings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {groups.length} scheme{groups.length !== 1 ? "s" : ""} ·{" "}
            {npsHoldings.length} contribution{npsHoldings.length !== 1 ? "s" : ""} ·{" "}
            {formatINR(totals.npsValue)} ·{" "}
            <span className={gainLossClass(totalGain)}>
              {formatINRWithSign(totalGain)} ({formatPercent(totalGainPct)})
            </span>
          </p>
        </div>
      </div>

      {/* ── Summary Strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Invested",  value: formatINR(totals.npsInvested) },
          { label: "Current Value",   value: formatINR(totals.npsValue) },
          { label: "Total Gain",      value: formatINRWithSign(totalGain),                                           cls: gainLossClass(totalGain) },
          { label: "Portfolio XIRR",  value: portfolioXIRR !== 0 ? formatPercent(portfolioXIRR, 1) : "--",           cls: portfolioXIRR !== 0 ? gainLossClass(portfolioXIRR) : undefined },
        ].map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("text-lg font-display font-bold number-tabular mt-0.5", s.cls)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Info Note ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-3">
        <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
        <span>
          Live NAV is fetched from{" "}
          <span className="font-mono text-primary">npsnav.in/api</span> using
          the PFM Code. Click <strong>Refresh NAV</strong> to pull the latest values.
        </span>
      </div>

      {/* ── Projection ──────────────────────────────────────────────────── */}
      <CollapsibleSection
        title="Projected Value by 2050"
        subtitle="At 10%, 15% and 20% XIRR"
      >
        <NPSProjection holdings={npsHoldings} />
      </CollapsibleSection>

      {/* ── Holdings ────────────────────────────────────────────────────── */}
      <CollapsibleSection
        title="NPS Scheme Holdings"
        subtitle={`${groups.length} scheme${groups.length !== 1 ? "s" : ""} · consolidated by scheme`}
        defaultOpen={true}
        headerRight={
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={refreshNPSPrices} disabled={isRefreshingNPS}
              className="border-border gap-1.5 h-7 text-xs"
            >
              <RefreshCw className={cn("w-3 h-3", isRefreshingNPS && "animate-spin")} />
              {isRefreshingNPS ? "Updating…" : "Refresh NAV"}
            </Button>
            <Button
              size="sm" onClick={openAddHolding}
              className="bg-primary text-primary-foreground gap-1.5 h-7 text-xs"
            >
              <Plus className="w-3 h-3" />
              Add Holding
            </Button>
          </div>
        }
      >
        <NpsTable
          groups={groups}
          isLoading={isRefreshingNPS}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDeleteGroup={handleDeleteGroup}
          onAddContrib={handleAddContrib}
        />
      </CollapsibleSection>

      <NpsModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); setAddContribTarget(null); }}
        editData={editTarget}
        addContribData={addContribTarget}
      />
    </div>
  );
}
