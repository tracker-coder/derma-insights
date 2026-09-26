import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalFilters } from "@/lib/filters";
import { cad2 } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Row = {
  practitioner: string; revenue: number | null; visits: number | null; visit_hours: number | null; available_hours: number | null;
  revenue_per_hour: number | null; utilization_pct: number | null; new_patients: number | null; no_show_rate: number | null;
};
type Key = keyof Row;

const COLS: { key: Key; label: string; fmt: (r: Row) => React.ReactNode }[] = [
  { key: "revenue", label: "Revenue", fmt: (r) => cad2(r.revenue) },
  { key: "visits", label: "Visits", fmt: (r) => r.visits ?? "—" },
  { key: "visit_hours", label: "Visit hrs", fmt: (r) => (r.visit_hours === null ? "—" : Number(r.visit_hours).toFixed(1)) },
  { key: "revenue_per_hour", label: "Rev / hr", fmt: (r) => cad2(r.revenue_per_hour) },
  { key: "utilization_pct", label: "Utilization", fmt: (r) => <Util v={r.utilization_pct} /> },
  { key: "new_patients", label: "New pts", fmt: (r) => r.new_patients ?? "—" },
  { key: "no_show_rate", label: "No-show", fmt: (r) => (r.no_show_rate === null ? "—" : `${Number(r.no_show_rate).toFixed(1)}%`) },
];

function Util({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">No shifts</span>;
  const n = Number(v);
  const color = n > 95 ? "bg-destructive" : n < 60 ? "bg-caution" : n <= 85 ? "bg-success" : "bg-primary";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, n)}%` }} />
      </div>
      <span className="w-12 text-right tabular-nums">{n.toFixed(0)}%</span>
    </div>
  );
}

export function Leaderboard() {
  const f = useGlobalFilters();
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "revenue", dir: -1 });
  const q = useQuery({
    queryKey: ["provider_table", f.start, f.end, f.location],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_provider_table", {
        p_start: f.start, p_end: f.end, ...(f.location ? { p_location: f.location } : {}),
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const rows = useMemo(() => {
    const r = [...(q.data ?? [])];
    r.sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y)) * sort.dir;
    });
    return r;
  }, [q.data, sort]);

  const head = (key: Key, label: string, right = true) => (
    <TableHead className={right ? "text-right" : "pl-5"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
      </button>
    </TableHead>
  );

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">Leaderboard</h2>
        <p className="text-sm text-muted-foreground">For the date range and location in the top bar. Click a provider to see their Dashboard.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            {head("practitioner", "Provider", false)}
            {COLS.map((c) => <span key={c.key} className="contents">{head(c.key, c.label)}</span>)}
          </TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={8} className="pl-5 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows.length ? (
              <TableRow><TableCell colSpan={8} className="pl-5 text-muted-foreground">No provider activity in this period.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.practitioner} className="cursor-pointer"
                onClick={() => navigate({ to: "/dashboard", search: (s: Record<string, unknown>) => ({ ...s, prov: r.practitioner }) })}>
                <TableCell className="pl-5 font-medium text-primary">{r.practitioner}</TableCell>
                {COLS.map((c) => <TableCell key={c.key} className="text-right tabular-nums whitespace-nowrap">{c.fmt(r)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="px-5 py-3 text-xs text-muted-foreground">Utilization: amber under 60%, green 60–85%, teal 85–95%, red over 95%.</p>
    </section>
  );
}
