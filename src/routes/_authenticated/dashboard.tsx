import { useRef, useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CsvButton } from "@/components/CsvButton";
import { exportElementToPdf } from "@/lib/pdf-export";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Info, Minus } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { KPI_CODES } from "@/components/settings/ReferenceSections";
import { LOCATIONS, PRESETS, useGlobalFilters } from "@/lib/filters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RevenueSections } from "@/components/dashboard/RevenueSections";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — DermaSpa Insights" },
      { name: "description", content: "Clinic scorecard: revenue, new patients, EBITDA, LTV:CAC and more." },
      { property: "og:title", content: "Dashboard — DermaSpa Insights" },
      { property: "og:description", content: "Clinic scorecard: revenue, new patients, EBITDA, LTV:CAC and more." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

type Fmt = "money" | "pct" | "num" | "ratio" | "dec";
type KpiDef = { code: string; label: string; why?: string; formula: string; fmt: Fmt };

const SCORECARD: KpiDef[] = [
  { code: "revenue", label: "Revenue", why: "Overall growth", fmt: "money", formula: "Sum of invoice line subtotals (excl. GST/PST) by invoice date. Refunds net out." },
  { code: "adjusted_ebitda_pct", label: "Adjusted EBITDA %", why: "Are we actually making more money?", fmt: "pct", formula: "(Revenue − operating expenses + add-backs) ÷ Revenue. Company-wide; monthly inputs prorated by days." },
  { code: "new_patients", label: "New Patients", why: "Growth of patient base", fmt: "num", formula: "Patients whose first-ever Visit (arrived, non-internal) falls in the period." },
  { code: "cac", label: "CAC", why: "Cost of growth", fmt: "money", formula: "Marketing spend in period ÷ new patients. Company-wide." },
  { code: "ltv_12m", label: "12-month LTV", why: "Value of growth", fmt: "money", formula: "Average revenue per patient in the 365 days after first Visit, for patients first seen 12–24 months before period end." },
  { code: "ltv_cac", label: "LTV:CAC", why: "Economics of acquiring patients", fmt: "ratio", formula: "12-month LTV ÷ CAC. Company-wide." },
  { code: "second_visit_rate_90d", label: "2nd Visit Rate", why: "Are new patients sticking?", fmt: "pct", formula: "% of new patients in the period with a 2nd Visit within 90 days of their first." },
  { code: "retention_12m", label: "12-month Retention", why: "Long-term health of clinic", fmt: "pct", formula: "Of patients with a Visit in the prior 12-month window, % who also visited in the 12 months ending at period end." },
  { code: "revenue_per_provider_hour", label: "Revenue / Provider Hour", why: "Provider productivity", fmt: "money", formula: "Provider revenue (by invoice staff member) ÷ provider Visit hours. Only providers included in KPIs." },
  { code: "provider_utilization_pct", label: "Provider Utilization %", why: "Capacity available for growth", fmt: "pct", formula: "Booked non-internal hours (arrived + no-show) ÷ available shift hours." },
];

const MORE: KpiDef[] = [
  { code: "collected_revenue", label: "Collected revenue", fmt: "money", formula: "Sum of amounts collected on invoice lines in the period." },
  { code: "visits", label: "Visits", fmt: "num", formula: "Arrived, non-internal appointments." },
  { code: "unique_patients", label: "Unique patients", fmt: "num", formula: "Distinct patients with a Visit in the period." },
  { code: "avg_revenue_per_visit", label: "Avg revenue / visit", fmt: "money", formula: "Revenue ÷ Visits." },
  { code: "no_show_rate", label: "No-show rate", fmt: "pct", formula: "No-shows ÷ (arrived + no-shows)." },
  { code: "late_cancel_rate", label: "Late-cancel rate", fmt: "pct", formula: "Appointments cancelled within 24h of start ÷ all non-internal booked appointments." },
  { code: "neuromodulator_units_per_visit", label: "Neuromodulator units / visit", fmt: "dec", formula: "Neuromodulator units sold ÷ neuromodulator Visits." },
];

const HEADLINE = ["revenue", "new_patients", "adjusted_ebitda_pct", "ltv_cac"];
const ALL_DEFS = [...SCORECARD, ...MORE];
const defOf = (code: string) => ALL_DEFS.find((d) => d.code === code)!;

function fmt(v: number | null | undefined, f: Fmt, cents = false) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  switch (f) {
    case "money":
      return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
    case "pct":
      return `${n.toFixed(1)}%`;
    case "ratio":
      return `${n.toFixed(2)}×`;
    case "dec":
      return n.toFixed(1);
    default:
      return n.toLocaleString("en-CA");
  }
}

const opt = (location: string | null, practitioner: string | null) => ({
  ...(location ? { p_location: location } : {}),
  ...(practitioner ? { p_practitioner: practitioner } : {}),
});

type KpiRow = {
  kpi_code: string; value: number | null; prev_value: number | null; yoy_value: number | null;
  change_pct: number | null; yoy_change_pct: number | null; target: number | null; status: string; note: string | null;
};

function useKpis(start: string, end: string, location: string | null, practitioner: string | null) {
  return useQuery({
    queryKey: ["kpis", start, end, location, practitioner],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_kpis", {
        p_start: start, p_end: end, ...opt(location, practitioner),
      });
      if (error) throw error;
      return new Map((data as KpiRow[]).map((r) => [r.kpi_code, r]));
    },
  });
}

function useTrend(kpi: string, location: string | null, practitioner: string | null, enabled = true) {
  return useQuery({
    queryKey: ["kpi_trend", kpi, location, practitioner],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_kpi_trend", {
        p_kpi: kpi, p_months: 12, ...opt(location, practitioner),
      });
      if (error) throw error;
      return (data ?? []).map((d) => ({ month: d.month, value: d.value === null ? null : Number(d.value) }));
    },
  });
}

const directionOf = (code: string) => KPI_CODES.find((k) => k.code === code)?.direction ?? "higher_better";

function Change({ code, pct }: { code: string; pct: number | null }) {
  if (pct === null || pct === undefined) return <span className="text-muted-foreground">—</span>;
  const n = Number(pct);
  if (n === 0) return <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="size-3.5" />0%</span>;
  const good = directionOf(code) === "lower_better" ? n < 0 : n > 0;
  const Icon = n > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-destructive")}>
      <Icon className="size-3.5" />
      {Math.abs(n).toFixed(1)}%
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls = { good: "bg-success", watch: "bg-caution", bad: "bg-destructive" }[status] ?? "bg-muted-foreground/30";
  const label = { good: "On target", watch: "Within 5% of target", bad: "Off target" }[status] ?? "No target";
  return <span title={label} aria-label={label} className={cn("inline-block size-2.5 rounded-full", cls)} />;
}

function FormulaInfo({ def }: { def: KpiDef }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground" aria-label={`How ${def.label} is calculated`}>
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{def.formula}</TooltipContent>
    </Tooltip>
  );
}

function DataThrough() {
  const q = useQuery({
    queryKey: ["data_through"],
    queryFn: async () => {
      const [a, s] = await Promise.all([
        supabase.from("appointments").select("start_at").not("start_at", "is", null).order("start_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("sales_lines").select("invoice_date").not("invoice_date", "is", null).order("invoice_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { appt: a.data?.start_at ?? null, sale: s.data?.invoice_date ?? null };
    },
  });
  const d = (v: string | null) =>
    v ? new Date(v).toLocaleDateString("en-CA", { timeZone: "America/Vancouver", month: "short", day: "numeric", year: "numeric" }) : "no data";
  return (
    <p className="-mt-6 mb-8 text-xs text-muted-foreground">
      Data through: appointments {d(q.data?.appt ?? null)} · sales {d(q.data?.sale ?? null)}
    </p>
  );
}

function Sparkline({ code, location, practitioner }: { code: string; location: string | null; practitioner: string | null }) {
  const t = useTrend(code, location, practitioner);
  if (!t.data) return <Skeleton className="h-10 w-full" />;
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={t.data}>
          <YAxis hide domain={["auto", "auto"]} />
          <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HeadlineCard({ row, code, compare, location, practitioner }: {
  row?: KpiRow | undefined; code: string; compare: "prev" | "yoy"; location: string | null; practitioner: string | null;
}) {
  const def = defOf(code);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {def.label} <FormulaInfo def={def} />
      </div>
      {row ? (
        <>
          <div className="text-2xl font-semibold tracking-tight">{fmt(row.value, def.fmt)}</div>
          <div className="flex items-center gap-2 text-xs">
            <Change code={code} pct={compare === "yoy" ? row.yoy_change_pct : row.change_pct} />
            <span className="text-muted-foreground">{compare === "yoy" ? "vs last year" : "vs prev. period"}</span>
          </div>
          {row.value === null && row.note ? <p className="text-xs text-muted-foreground">{row.note}</p> : null}
        </>
      ) : (
        <Skeleton className="h-12 w-2/3" />
      )}
      <Sparkline code={code} location={location} practitioner={practitioner} />
    </div>
  );
}

function DetailPanel({ code, onClose }: { code: string | null; onClose: () => void }) {
  const f = useGlobalFilters();
  const def = code ? defOf(code) : null;
  const trend = useTrend(code ?? "", f.location, f.practitioner, !!code);
  const byLoc = useQuery({
    queryKey: ["kpi_by_location", code, f.start, f.end, f.practitioner],
    enabled: !!code,
    queryFn: async () =>
      Promise.all(
        LOCATIONS.map(async (loc) => {
          const { data, error } = await supabase.rpc("get_kpis", {
            p_start: f.start, p_end: f.end, ...opt(loc, f.practitioner),
          });
          if (error) throw error;
          const r = (data as KpiRow[]).find((x) => x.kpi_code === code);
          return { loc, value: r?.value ?? null, note: r?.note ?? null };
        }),
      ),
  });
  return (
    <Sheet open={!!code} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {def ? (
          <>
            <SheetHeader>
              <SheetTitle>{def.label}</SheetTitle>
              <SheetDescription>{def.formula}</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-8 px-4 pb-6">
              <section>
                <h3 className="mb-3 text-sm font-medium">Last 12 months</h3>
                <div className="h-56 rounded-xl border border-border bg-card p-3">
                  {trend.data ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend.data} margin={{ left: 4, right: 8, top: 8 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="month" tickFormatter={(m) => new Date(m + "T12:00:00").toLocaleDateString("en-CA", { month: "short" })} fontSize={11} stroke="var(--muted-foreground)" />
                        <YAxis fontSize={11} width={56} stroke="var(--muted-foreground)" tickFormatter={(v) => fmt(v, def.fmt)} />
                        <RTooltip
                          formatter={(v: number) => fmt(v, def.fmt, true)}
                          labelFormatter={(m) => new Date(m + "T12:00:00").toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
                          contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
                        />
                        <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Skeleton className="h-full w-full" />
                  )}
                </div>
              </section>
              <section>
                <h3 className="mb-3 text-sm font-medium">By location (selected period)</h3>
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {(byLoc.data ?? LOCATIONS.map((loc) => ({ loc, value: undefined, note: null }))).map((r) => (
                    <div key={r.loc} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                      <span>{r.loc.replace("Derma Spa ", "")}</span>
                      <span className="text-right">
                        {r.value === undefined ? <Skeleton className="h-4 w-16" /> : <span className="font-medium tabular-nums">{fmt(r.value, def.fmt, true)}</span>}
                        {r.note ? <span className="block text-xs text-muted-foreground">{r.note}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DashboardPage() {
  const f = useGlobalFilters();
  const kpis = useKpis(f.start, f.end, f.location, f.practitioner);
  const [selected, setSelected] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const cmpLabel = f.compare === "yoy" ? "Last year" : "Prev. period";
  const pdfRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const filterSummary = [
    `${PRESETS.find((p) => p.value === f.preset)?.label ?? "Custom"}: ${f.start} to ${f.end}`,
    f.location ?? "All locations",
    f.practitioner ?? "All providers",
    `Compared to ${f.compare === "yoy" ? "same period last year" : "previous period"}`,
  ].join("  ·  ");

  const downloadPdf = async () => {
    if (!pdfRef.current) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 150));
      await exportElementToPdf(pdfRef.current, `dermaspa-dashboard-${f.start}-to-${f.end}.pdf`);
    } catch (e) {
      toast.error(`Couldn't create the PDF: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const scorecardCsv = kpis.data ? SCORECARD.map((def) => {
    const r = kpis.data!.get(def.code);
    return [def.label, def.why, r?.value ?? "", (f.compare === "yoy" ? r?.yoy_value : r?.prev_value) ?? "",
      (f.compare === "yoy" ? r?.yoy_change_pct : r?.change_pct) ?? "", r?.target ?? "", r?.status ?? "", r?.value === null ? r?.note ?? "" : ""];
  }) : undefined;

  return (
    <TooltipProvider delayDuration={150}>
     <div ref={pdfRef} className={exporting ? "w-[1100px] bg-background p-6" : undefined}>
      {exporting ? (
        <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">DS</div>
            <div>
              <div className="font-semibold leading-tight">DermaSpa Insights</div>
              <div className="text-xs text-muted-foreground">Clinic dashboard</div>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{filterSummary}</div>
            <div>Generated {new Date().toLocaleString("en-CA", { timeZone: "America/Vancouver" })}</div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Dashboard" />
        <Button data-pdf-hide variant="outline" size="sm" onClick={downloadPdf} disabled={exporting || !kpis.data}>
          <FileDown className="size-4" /> {exporting ? "Preparing…" : "Download PDF"}
        </Button>
      </div>
      <DataThrough />

      {kpis.error ? (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive">
          Couldn't load KPIs: {(kpis.error as Error).message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {HEADLINE.map((code) => (
          <HeadlineCard key={code} code={code} row={kpis.data?.get(code)} compare={f.compare} location={f.location} practitioner={f.practitioner} />
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Clinic Scorecard</h2>
            <p className="text-xs text-muted-foreground">Click a row for its 12-month trend and location breakdown.</p>
          </div>
          <span data-pdf-hide><CsvButton name={`scorecard-${f.start}-to-${f.end}`} rows={scorecardCsv}
            headers={["KPI", "Why I care", "Current", cmpLabel, "Change %", "Target", "Status", "Note"]} /></span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">KPI</TableHead>
                <TableHead>Why I care</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">{cmpLabel}</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="pr-5 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SCORECARD.map((def) => {
                const r = kpis.data?.get(def.code);
                return (
                  <TableRow key={def.code} className="cursor-pointer" onClick={() => setSelected(def.code)}>
                    <TableCell className="pl-5 font-medium">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{def.label} <FormulaInfo def={def} /></span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{def.why}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r ? (
                        <>
                          <span className="font-medium">{fmt(r.value, def.fmt, true)}</span>
                          {r.value === null && r.note ? <span className="block max-w-[14rem] text-xs text-muted-foreground ml-auto">{r.note}</span> : null}
                        </>
                      ) : <Skeleton className="ml-auto h-4 w-16" />}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r ? fmt(f.compare === "yoy" ? r.yoy_value : r.prev_value, def.fmt, true) : null}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {r ? <Change code={def.code} pct={f.compare === "yoy" ? r.yoy_change_pct : r.change_pct} /> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r ? fmt(r.target, def.fmt, true) : null}</TableCell>
                    <TableCell className="pr-5 text-center">{r ? <StatusDot status={r.status} /> : null}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <RevenueSections />
     </div>

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="mt-6">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} />
          More metrics
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MORE.map((def) => {
              const r = kpis.data?.get(def.code);
              return (
                <button key={def.code} type="button" onClick={() => setSelected(def.code)}
                  className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{def.label} <FormulaInfo def={def} /></div>
                  <div className="mt-2 text-lg font-semibold">{r ? fmt(r.value, def.fmt) : "…"}</div>
                  <div className="mt-1 text-xs">{r ? <Change code={def.code} pct={f.compare === "yoy" ? r.yoy_change_pct : r.change_pct} /> : null}</div>
                  {r?.value === null && r.note ? <p className="mt-1 text-xs text-muted-foreground">{r.note}</p> : null}
                </button>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <DetailPanel code={selected} onClose={() => setSelected(null)} />
    </TooltipProvider>
  );
}
