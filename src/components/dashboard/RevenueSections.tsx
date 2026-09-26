import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { compareRange, useGlobalFilters } from "@/lib/filters";
import { cad0, cad2, filterArgs, shortLoc } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const tip = { borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 };

function useBreakdown(start: string, end: string, group: string, location: string | null, practitioner: string | null) {
  return useQuery({
    queryKey: ["revenue_breakdown", group, start, end, location, practitioner],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_revenue_breakdown", {
        p_start: start, p_end: end, p_group: group, ...filterArgs(location, practitioner),
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({ group: r.group, revenue: Number(r.revenue), pct: r.pct_of_total === null ? null : Number(r.pct_of_total) }));
    },
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function RevenueSections() {
  const f = useGlobalFilters();
  const cmp = compareRange(f.start, f.end, f.compare);
  const groups = useBreakdown(f.start, f.end, "reporting_group", f.location, f.practitioner);
  const locCur = useBreakdown(f.start, f.end, "location", f.location, f.practitioner);
  const locCmp = useBreakdown(cmp.start, cmp.end, "location", f.location, f.practitioner);
  const top = useQuery({
    queryKey: ["top_items", f.start, f.end, f.location, f.practitioner],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_items", {
        p_start: f.start, p_end: f.end, p_limit: 15, ...filterArgs(f.location, f.practitioner),
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const locData = (() => {
    if (!locCur.data || !locCmp.data) return null;
    const names = Array.from(new Set([...locCur.data, ...locCmp.data].map((r) => r.group)));
    return names.map((n) => ({
      name: shortLoc(n),
      current: locCur.data!.find((r) => r.group === n)?.revenue ?? 0,
      comparison: locCmp.data!.find((r) => r.group === n)?.revenue ?? 0,
    })).sort((a, b) => b.current - a.current);
  })();
  const cmpName = f.compare === "yoy" ? "Same period last year" : "Previous period";

  return (
    <>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card title="Revenue by service group">
          {!groups.data ? <Skeleton className="h-64" /> : !groups.data.length ? (
            <p className="text-sm text-muted-foreground">No sales in this period.</p>
          ) : (
            <div style={{ height: Math.max(180, groups.data.length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groups.data} layout="vertical" margin={{ left: 8, right: 56 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="group" width={110} fontSize={12} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tip} formatter={(v: number) => cad2(v)} cursor={{ fill: "var(--muted)" }} />
                  <Bar dataKey="revenue" name="Revenue" fill="var(--chart-1)" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="pct" position="right" fontSize={11} fill="var(--muted-foreground)" formatter={(v: number | null) => (v === null ? "" : `${v}%`)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Revenue by location">
          {!locData ? <Skeleton className="h-64" /> : !locData.length ? (
            <p className="text-sm text-muted-foreground">No sales in this period.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locData} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} stroke="var(--muted-foreground)" tickLine={false} />
                  <YAxis fontSize={11} width={64} stroke="var(--muted-foreground)" tickFormatter={(v) => cad0(v)} />
                  <Tooltip contentStyle={tip} formatter={(v: number) => cad2(v)} cursor={{ fill: "var(--muted)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="current" name="Selected period" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="comparison" name={cmpName} fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-5 py-4 text-base font-semibold">Top items</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-5">Item</TableHead><TableHead>Income category</TableHead>
              <TableHead className="text-right">Quantity</TableHead><TableHead className="pr-5 text-right">Revenue</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!top.data ? (
                <TableRow><TableCell colSpan={4} className="pl-5"><Skeleton className="h-4 w-1/2" /></TableCell></TableRow>
              ) : !top.data.length ? (
                <TableRow><TableCell colSpan={4} className="pl-5 text-muted-foreground">No sales in this period.</TableCell></TableRow>
              ) : top.data.map((r) => (
                <TableRow key={r.item}>
                  <TableCell className="pl-5 font-medium">{r.item}</TableCell>
                  <TableCell className="text-muted-foreground">{r.income_category ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.quantity === null ? "—" : Number(r.quantity).toLocaleString("en-CA")}</TableCell>
                  <TableCell className="pr-5 text-right tabular-nums">{cad2(Number(r.revenue))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );
}
