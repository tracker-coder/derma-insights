import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { useProfile } from "@/hooks/useProfile";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/monthly-inputs")({
  head: () => ({
    meta: [
      { title: "Monthly Inputs — DermaSpa Insights" },
      { name: "description", content: "Monthly marketing spend, operating expenses and add-backs." },
      { property: "og:title", content: "Monthly Inputs — DermaSpa Insights" },
      { property: "og:description", content: "Monthly marketing spend, operating expenses and add-backs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MonthlyInputsPage,
});

type Row = { month: string; marketing_spend: number | null; operating_expenses: number | null; addbacks: number | null; notes: string | null };
type Field = "marketing_spend" | "operating_expenses" | "addbacks" | "notes";
const NUM_FIELDS: { key: Exclude<Field, "notes">; label: string }[] = [
  { key: "marketing_spend", label: "Marketing spend" },
  { key: "operating_expenses", label: "Operating expenses" },
  { key: "addbacks", label: "Add-backs" },
];

function monthList() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Vancouver" }));
  const out: string[] = [];
  for (let i = 3; i >= -24; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }
  return out;
}

function MonthlyInputsPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const isAdmin = profile?.role === "admin";
  const months = useMemo(monthList, []);
  const { data: saved = new Map<string, Row>() } = useQuery({
    queryKey: ["monthly_finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("monthly_finance").select("*").gte("month", months[months.length - 1]!).lte("month", months[0]!);
      if (error) throw error;
      return new Map((data as Row[]).map((r) => [r.month, r]));
    },
  });

  const save = async (month: string, field: Field, raw: string) => {
    const existing = saved.get(month);
    let value: number | string | null;
    if (field === "notes") value = raw.trim() || null;
    else {
      const n = raw.replace(/[$,\s]/g, "");
      value = n === "" ? null : Number(n);
      if (value !== null && !Number.isFinite(value)) { toast.error("Please enter a number"); return; }
    }
    if ((existing?.[field] ?? null) === value) return;
    // Numeric columns are NOT NULL in the database; blank is stored as 0 only on an existing row.
    const row: Row = {
      month,
      marketing_spend: existing?.marketing_spend ?? 0,
      operating_expenses: existing?.operating_expenses ?? 0,
      addbacks: existing?.addbacks ?? 0,
      notes: existing?.notes ?? null,
      [field]: field === "notes" ? value : (value ?? 0),
    } as Row;
    const { error } = await supabase.from("monthly_finance").upsert({ month: row.month, marketing_spend: row.marketing_spend ?? 0, operating_expenses: row.operating_expenses ?? 0, addbacks: row.addbacks ?? 0, notes: row.notes }, { onConflict: "month" });
    if (error) { toast.error(error.message); return; }
    toast.success("Saved", { duration: 1200 });
    qc.invalidateQueries({ queryKey: ["monthly_finance"] });
  };

  const label = (m: string) => new Date(`${m}T12:00:00`).toLocaleDateString("en-CA", { month: "short", year: "numeric" });
  const thisMonth = monthList()[3];

  return (
    <>
      <PageHeader title="Monthly Inputs" subtitle="Finance figures used for CAC and Adjusted EBITDA. Changes save automatically." />
      <div className="rounded-xl border border-border bg-card p-4 md:p-6">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-sm bg-warning" /> Month has missing values
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Month</th>
                {NUM_FIELDS.map((f) => <th key={f.key} className="px-2 py-2 text-right font-medium">{f.label} (CAD)</th>)}
                <th className="px-2 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const r = saved.get(m);
                const missing = !r;
                return (
                  <tr key={m} className={`border-b border-border last:border-0 ${missing ? "bg-warning/60" : ""}`}>
                    <td className="whitespace-nowrap py-1.5 pr-3 font-medium">
                      {label(m)}{m === thisMonth && <span className="ml-2 text-xs text-primary">current</span>}
                      {m > thisMonth! && <span className="ml-2 text-xs text-muted-foreground">budget</span>}
                    </td>
                    {NUM_FIELDS.map((f) => (
                      <td key={f.key} className="px-2 py-1.5">
                        <Input key={`${m}-${f.key}-${r?.[f.key] ?? ""}`} disabled={!isAdmin} inputMode="decimal"
                          className="h-8 w-36 text-right ml-auto" defaultValue={r?.[f.key] != null ? Number(r[f.key]).toFixed(2) : ""}
                          placeholder="—" onBlur={(e) => save(m, f.key, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                      </td>
                    ))}
                    <td className="px-2 py-1.5">
                      <Input key={`${m}-notes-${r?.notes ?? ""}`} disabled={!isAdmin} className="h-8 min-w-48" defaultValue={r?.notes ?? ""}
                        onBlur={(e) => save(m, "notes", e.target.value)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
