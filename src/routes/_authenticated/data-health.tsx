import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { CsvButton } from "@/components/CsvButton";
import { useGlobalFilters } from "@/lib/filters";
import { cad2, monthLabel } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/data-health")({
  head: () => ({
    meta: [
      { title: "Data Health — DermaSpa Insights" },
      { name: "description", content: "Data coverage by month, data quality checks and reconciliation totals." },
      { property: "og:title", content: "Data Health — DermaSpa Insights" },
      { property: "og:description", content: "Data coverage by month, data quality checks and reconciliation totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataHealthPage,
});

function DataHealthPage() {
  return (
    <>
      <PageHeader title="Data Health" subtitle="Check what data is loaded, spot gaps, and reconcile totals with Jane." />
      <div className="space-y-6">
        <Coverage />
        <Checks />
        <Reconciliation />
      </div>
    </>
  );
}

type Level = "ok" | "partial" | "none";
const DOT: Record<Level, string> = { ok: "bg-success", partial: "bg-caution", none: "bg-destructive" };

function Coverage() {
  const q = useQuery({
    queryKey: ["data_coverage", 24],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_data_coverage", { p_months: 24 });
      if (error) throw error;
      return data ?? [];
    },
  });
  // Amber = fewer than half the typical (median) monthly rows for that source.
  const median = (xs: number[]) => {
    const s = xs.filter((x) => x > 0).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)]! : 0;
  };
  const rows = q.data ?? [];
  const med = {
    appointments: median(rows.map((r) => Number(r.appointments))),
    sales: median(rows.map((r) => Number(r.sales))),
    shifts: median(rows.map((r) => Number(r.shifts))),
  };
  const lvl = (n: number, m: number): Level => (n === 0 ? "none" : n < m / 2 ? "partial" : "ok");
  const cell = (level: Level, text: string) => (
    <td className="px-2 py-2">
      <span className="inline-flex items-center gap-2 tabular-nums">
        <span className={cn("size-2.5 rounded-full", DOT[level])} />
        {text}
      </span>
    </td>
  );

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">Coverage — last 24 months</h2>
          <p className="text-sm text-muted-foreground">Green = loaded, amber = looks partial (under half a normal month), red = nothing loaded.</p>
        </div>
        <CsvButton name="data-coverage" headers={["Month", "Appointments", "Sales lines", "Shift days", "Monthly finance"]}
          rows={rows.map((r) => [r.month, r.appointments, r.sales, r.shifts, r.finance_complete ? "Complete" : r.finance_row ? "Partial" : "Missing"])} />
      </div>
      <div className="overflow-x-auto p-3">
        {!q.data ? <Skeleton className="h-64" /> : (
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground">
              <th className="px-2 py-2 font-medium">Month</th><th className="px-2 py-2 font-medium">Appointments</th>
              <th className="px-2 py-2 font-medium">Sales lines</th><th className="px-2 py-2 font-medium">Shift days</th>
              <th className="px-2 py-2 font-medium">Monthly finance</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.month}>
                  <td className="px-2 py-2 whitespace-nowrap">{monthLabel(r.month, true)}</td>
                  {cell(lvl(Number(r.appointments), med.appointments), Number(r.appointments).toLocaleString("en-CA"))}
                  {cell(lvl(Number(r.sales), med.sales), Number(r.sales).toLocaleString("en-CA"))}
                  {cell(lvl(Number(r.shifts), med.shifts), Number(r.shifts).toLocaleString("en-CA"))}
                  {cell(r.finance_complete ? "ok" : r.finance_row ? "partial" : "none", r.finance_complete ? "Complete" : r.finance_row ? "Partial" : "Missing")}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

const CHECKS: { code: string; title: string; hint: string; cols: [string, string, string]; money: boolean }[] = [
  { code: "staff_no_appts", title: "Sales staff with no appointments", hint: "Staff names on invoices that never appear as a practitioner. Often a spelling difference or front-desk staff.", cols: ["Staff member", "Lines", "Revenue"], money: true },
  { code: "category_other", title: "Income categories mapped to \"Other\"", hint: "Categorize these in Settings → Category mapping.", cols: ["Income category", "Lines", "Revenue"], money: true },
  { code: "maybe_internal", title: "Treatments that may be internal", hint: "Arrived treatments whose patients never had any revenue. Add real internal ones in Settings → Internal treatments.", cols: ["Treatment", "Appointments", "Count"], money: false },
  { code: "product_only", title: "Product-only buyers", hint: "Patients with sales but no visits. Usually retail customers; they're not counted as new patients.", cols: ["Patient", "Patient ID", "Revenue"], money: true },
  { code: "finance_missing", title: "Months missing marketing or expenses", hint: "Fill these in on Monthly Inputs so CAC and EBITDA can be calculated.", cols: ["Month", "Issue", ""], money: false },
  { code: "visits_no_shifts", title: "Providers with visits but no shift hours", hint: "Utilization can't be calculated for these months. Upload shifts or use a weekly template on Providers.", cols: ["Provider", "Month · visits", "Visits"], money: false },
];

function Checks() {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["data_health_details"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_data_health_details");
      if (error) throw error;
      return data ?? [];
    },
  });
  const def = CHECKS.find((c) => c.code === open);
  const items = (code: string) => (q.data ?? []).filter((r) => r.check_code === code);
  const fmtVal = (v: number | null, money: boolean) => (v === null ? "" : money ? cad2(Number(v)) : Number(v).toLocaleString("en-CA"));

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">Checks</h2>
        <p className="text-sm text-muted-foreground">Click a check to see the details.</p>
      </div>
      <div className="divide-y divide-border">
        {CHECKS.map((c) => {
          const n = q.data ? items(c.code).length : null;
          return (
            <button key={c.code} type="button" onClick={() => setOpen(c.code)}
              className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-muted/50">
              <span className={cn("size-2.5 shrink-0 rounded-full", n === null ? "bg-muted" : n === 0 ? "bg-success" : "bg-caution")} />
              <span className="flex-1">
                <span className="block text-sm font-medium">{c.title}</span>
                <span className="block text-xs text-muted-foreground">{c.hint}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{n === null ? "…" : n}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          );
        })}
      </div>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {def ? (
            <>
              <SheetHeader>
                <SheetTitle>{def.title}</SheetTitle>
                <SheetDescription>{def.hint}</SheetDescription>
              </SheetHeader>
              <div className="space-y-3 px-4 pb-6">
                <CsvButton name={`data-health-${def.code}`} headers={def.cols.filter(Boolean)}
                  rows={items(def.code).map((r) => [r.label, r.detail, ...(def.cols[2] ? [r.value === null ? "" : Number(r.value)] : [])])} />
                {!items(def.code).length ? <p className="text-sm text-muted-foreground">Nothing to fix here.</p> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{def.cols[0]}</TableHead><TableHead>{def.cols[1]}</TableHead>
                      {def.cols[2] ? <TableHead className="text-right">{def.cols[2]}</TableHead> : null}
                    </TableRow></TableHeader>
                    <TableBody>
                      {items(def.code).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.label}</TableCell>
                          <TableCell className="text-muted-foreground">{r.detail}</TableCell>
                          {def.cols[2] ? <TableCell className="text-right tabular-nums">{fmtVal(r.value, def.money)}</TableCell> : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function Reconciliation() {
  const f = useGlobalFilters();
  const [from, setFrom] = useState(f.start);
  const [to, setTo] = useState(f.end);
  const q = useQuery({
    queryKey: ["reconciliation", from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_reconciliation", { p_start: from, p_end: to });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const r = q.data;
  const items: [string, string][] = r ? [
    ["Revenue ex-tax", cad2(Number(r.revenue))], ["GST", cad2(Number(r.gst))], ["PST", cad2(Number(r.pst))],
    ["Collected", cad2(Number(r.collected))], ["Arrived visits", Number(r.arrived_visits).toLocaleString("en-CA")],
    ["First visits", Number(r.first_visits).toLocaleString("en-CA")],
  ] : [];
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold">Reconciliation</h2>
          <p className="text-sm text-muted-foreground">Compare with Jane's own report totals for the same dates. Visits exclude internal time; first visits use Jane's first-visit mark.</p>
        </div>
        <div className="flex gap-3">
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {!r ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />) : items.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-1 font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      {r ? <div className="mt-4"><CsvButton name={`reconciliation-${from}-to-${to}`} headers={["Metric", "Value"]} rows={items} /></div> : null}
    </section>
  );
}
