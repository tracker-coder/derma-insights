import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { LOCATIONS, useGlobalFilters } from "@/lib/filters";
import { cad0, cad2, downloadCsv, filterArgs, monthLabel, shortLoc, vanDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CsvButton } from "@/components/CsvButton";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/patients")({
  head: () => ({
    meta: [
      { title: "Patients & Cohorts — DermaSpa Insights" },
      { name: "description", content: "Cohort retention, new patients, 2nd visit rate and follow-up lists." },
      { property: "og:title", content: "Patients & Cohorts — DermaSpa Insights" },
      { property: "og:description", content: "Cohort retention, new patients, 2nd visit rate and follow-up lists." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatientsPage,
});

const tip = { borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 };
const LINE_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)"];

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string | undefined; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PatientsPage() {
  return (
    <>
      <PageHeader title="Patients & Cohorts" subtitle="How new patients return over time, and who needs a follow-up." />
      <div className="space-y-6">
        <CohortHeatmap />
        <div className="grid gap-6 lg:grid-cols-2">
          <NewPatientsChart />
          <SecondVisitChart />
        </div>
        <FollowUpList />
        <LapsedRegulars />
      </div>
    </>
  );
}

const COHORT_COLS = [
  { key: "returned_1m", label: "1 mo" }, { key: "returned_2m", label: "2 mo" }, { key: "returned_3m", label: "3 mo" },
  { key: "returned_6m", label: "6 mo" }, { key: "returned_9m", label: "9 mo" }, { key: "returned_12m", label: "12 mo" },
] as const;

function CohortHeatmap() {
  const q = useQuery({
    queryKey: ["cohorts", 18],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cohorts", { p_months: 18 });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card title="Cohort retention" subtitle="Share of each first-visit month's new patients who came back within the given number of months. Blank = not enough time has passed yet."
      action={<CsvButton name="cohort-retention" className="h-9" headers={["First visit month", "Patients", ...COHORT_COLS.map((c) => `Returned ${c.label} %`)]}
        rows={q.data?.map((r) => [r.cohort_month, r.cohort_size, ...COHORT_COLS.map((c) => r[c.key])])} />}>
      {!q.data ? <Skeleton className="h-64" /> : !q.data.length ? (
        <p className="text-sm text-muted-foreground">No visit history yet. Import Jane Appointments to see cohorts.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium">First visit</th>
                <th className="text-right font-medium">Patients</th>
                {COHORT_COLS.map((c) => <th key={c.key} className="font-medium">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.cohort_month}>
                  <td className="whitespace-nowrap pr-2">{monthLabel(r.cohort_month, true)}</td>
                  <td className="pr-2 text-right tabular-nums text-muted-foreground">{r.cohort_size}</td>
                  {COHORT_COLS.map((c) => {
                    const v = r[c.key];
                    if (v === null) return <td key={c.key} className="rounded-md bg-muted/50" />;
                    const n = Number(v);
                    return (
                      <td key={c.key} className="rounded-md px-2 py-1.5 text-center tabular-nums"
                        style={{
                          background: `color-mix(in oklch, var(--primary) ${Math.round(8 + Math.min(n, 100) * 0.85)}%, var(--card))`,
                          color: n >= 45 ? "var(--primary-foreground)" : "var(--foreground)",
                        }}>
                        {n.toFixed(0)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function NewPatientsChart() {
  const f = useGlobalFilters();
  const q = useQuery({
    queryKey: ["new_patients_by_location", 12, f.practitioner],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_new_patients_by_location", {
        p_months: 12, ...(f.practitioner ? { p_practitioner: f.practitioner } : {}),
      });
      if (error) throw error;
      const locs = Array.from(new Set((data ?? []).map((r) => r.location)));
      const byMonth = new Map<string, Record<string, number | string>>();
      for (const r of data ?? []) {
        const row = byMonth.get(r.month) ?? { month: monthLabel(r.month) };
        row[shortLoc(r.location)] = Number(r.new_patients);
        byMonth.set(r.month, row);
      }
      return { locs: locs.map(shortLoc), rows: Array.from(byMonth.values()) };
    },
  });
  return (
    <Card title="New patients per month" subtitle="By location of first visit, last 12 months.">
      {!q.data ? <Skeleton className="h-64" /> : !q.data.locs.length ? (
        <p className="text-sm text-muted-foreground">No new patients yet.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={q.data.rows} margin={{ left: -16, right: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" fontSize={11} stroke="var(--muted-foreground)" tickLine={false} />
              <YAxis fontSize={11} stroke="var(--muted-foreground)" allowDecimals={false} />
              <Tooltip contentStyle={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {q.data.locs.map((l, i) => (
                <Line key={l} type="monotone" dataKey={l} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function SecondVisitChart() {
  const f = useGlobalFilters();
  const q = useQuery({
    queryKey: ["second_visit_trend", 12, f.location, f.practitioner],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_second_visit_trend", { p_months: 12, ...filterArgs(f.location, f.practitioner) });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const v = r.value === null ? null : Number(r.value);
        return {
          month: monthLabel(r.month), size: Number(r.cohort_size), maturing: r.maturing,
          final: r.maturing ? null : v, pending: r.maturing ? v : null,
        };
      });
    },
  });
  return (
    <Card title="2nd Visit Rate" subtitle="New patients with a 2nd visit within 90 days. Hatched months are still maturing (less than 90 days old).">
      {!q.data ? <Skeleton className="h-64" /> : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={q.data} margin={{ left: -16, right: 8 }}>
              <defs>
                <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="var(--muted)" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" strokeWidth="2" strokeOpacity="0.45" />
                </pattern>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" fontSize={11} stroke="var(--muted-foreground)" tickLine={false} />
              <YAxis fontSize={11} stroke="var(--muted-foreground)" unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={tip}
                formatter={(v, name) => [v === null || v === undefined ? "—" : `${v}%`, name]} />
              <Bar dataKey="final" name="2nd visit rate" stackId="a" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="pending" name="Maturing" stackId="a" fill="url(#hatch)" radius={[6, 6, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function useProviderNames() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("providers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

const ALL = "__all";

function FollowUpList() {
  const [loc, setLoc] = useState<string | null>(null);
  const [prac, setPrac] = useState<string | null>(null);
  const providers = useProviderNames();
  const q = useQuery({
    queryKey: ["followup_list", loc, prac],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_followup_list", filterArgs(loc, prac));
      if (error) throw error;
      return data ?? [];
    },
  });
  const exportCsv = () => downloadCsv(`follow-up-list-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Name", "Patient number", "First visit", "Location", "Practitioner", "First treatment", "Amount spent"],
    (q.data ?? []).map((r) => [r.patient_name, r.patient_number, vanDate(r.first_visit_at), r.location, r.practitioner, r.first_treatment,
      Number(r.amount_spent).toFixed(2)]));

  return (
    <Card title="Follow-up list"
      subtitle="New patients whose first visit was 14–90 days ago, with no 2nd visit and nothing booked."
      action={
        <div className="flex flex-wrap gap-2">
          <Select value={loc ?? ALL} onValueChange={(v) => setLoc(v === ALL ? null : v)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All locations</SelectItem>
              {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{shortLoc(l)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={prac ?? ALL} onValueChange={(v) => setPrac(v === ALL ? null : v)}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All practitioners</SelectItem>
              {(providers.data ?? []).map((p) => <SelectItem key={p.name} value={p.name}>{p.display_name ?? p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9" disabled={!q.data?.length} onClick={exportCsv}>
            <Download className="size-4" /> CSV
          </Button>
        </div>
      }>
      <PatientTable loading={!q.data} empty="Nobody needs a follow-up right now."
        headers={["Name", "Patient #", "First visit", "Location", "Practitioner", "First treatment", "Spent"]}
        rows={(q.data ?? []).map((r) => ({
          key: r.patient_guid,
          cells: [r.patient_name ?? "—", r.patient_number ?? "—", vanDate(r.first_visit_at), shortLoc(r.location), r.practitioner ?? "—",
            r.first_treatment ?? "—", cad2(Number(r.amount_spent))],
        }))} />
      {q.data?.length ? <p className="mt-3 text-xs text-muted-foreground">{q.data.length} patients · {cad0(q.data.reduce((s, r) => s + Number(r.amount_spent), 0))} spent so far</p> : null}
    </Card>
  );
}

function LapsedRegulars() {
  const q = useQuery({
    queryKey: ["lapsed_regulars"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_lapsed_regulars", {});
      if (error) throw error;
      return data ?? [];
    },
  });
  const exportCsv = () => downloadCsv(`lapsed-regulars-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Name", "Patient number", "Last visit", "Visit count", "Lifetime revenue", "Usual practitioner"],
    (q.data ?? []).map((r) => [r.patient_name, r.patient_number, vanDate(r.last_visit_at), r.visit_count, Number(r.lifetime_revenue).toFixed(2), r.usual_practitioner]));
  return (
    <Card title="Lapsed regulars" subtitle="Patients with 3+ visits whose last visit was 120+ days ago and nothing booked."
      action={<Button variant="outline" size="sm" className="h-9" disabled={!q.data?.length} onClick={exportCsv}><Download className="size-4" /> CSV</Button>}>
      <PatientTable loading={!q.data} empty="No lapsed regulars."
        headers={["Name", "Last visit", "Visits", "Lifetime revenue", "Usual practitioner"]}
        rows={(q.data ?? []).map((r) => ({
          key: r.patient_guid,
          cells: [r.patient_name ?? "—", vanDate(r.last_visit_at), String(r.visit_count), cad2(Number(r.lifetime_revenue)), r.usual_practitioner ?? "—"],
        }))} />
    </Card>
  );
}

function PatientTable({ headers, rows, loading, empty }: { headers: string[]; rows: { key: string; cells: string[] }[]; loading: boolean; empty: string }) {
  if (loading) return <Skeleton className="h-24" />;
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="max-h-[480px] overflow-auto">
      <Table>
        <TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              {r.cells.map((c, i) => <TableCell key={i} className={i === 0 ? "font-medium" : "whitespace-nowrap"}>{c}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
