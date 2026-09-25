import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const REPORTING_GROUPS = ["Injectables", "Packages", "Laser & Devices", "Skin Treatments", "Retail", "Consults", "Other"];

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 md:p-8">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function InternalTreatmentsSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["internal_treatments"],
    queryFn: async () => (await supabase.from("internal_treatments").select("treatment_name").order("treatment_name")).data ?? [],
  });
  const after = async (msg: string) => {
    const { data: n, error } = await supabase.rpc("mark_internal");
    if (error) toast.error(error.message);
    else toast.success(`${msg} — ${n ?? 0} appointments re-flagged`);
    qc.invalidateQueries({ queryKey: ["internal_treatments"] });
  };
  const add = async () => {
    const v = name.trim();
    if (!v) return;
    const { error } = await supabase.from("internal_treatments").insert({ treatment_name: v });
    if (error) return toast.error(error.message);
    setName("");
    after("Added");
  };
  const remove = async (t: string) => {
    const { error } = await supabase.from("internal_treatments").delete().eq("treatment_name", t);
    if (error) return toast.error(error.message);
    after("Removed");
  };
  return (
    <Card title="Internal treatments" description="Treatment names that are staff time, not patient visits. They're excluded from visits and utilization.">
      <div className="flex flex-wrap gap-2">
        {data.map((t) => (
          <Badge key={t.treatment_name} variant="secondary" className="gap-1 py-1 pl-3 pr-1 text-sm font-normal">
            {t.treatment_name}
            {isAdmin && (
              <button onClick={() => remove(t.treatment_name)} className="rounded p-0.5 hover:bg-muted" aria-label={`Remove ${t.treatment_name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {isAdmin && (
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Treatment name exactly as in Jane" className="max-w-sm" />
          <Button type="submit">Add</Button>
        </form>
      )}
    </Card>
  );
}

export function CategoryMappingSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["category_map"],
    queryFn: async () => (await supabase.from("category_map").select("*").order("reporting_group").order("income_category")).data ?? [],
  });
  const set = async (cat: string, group: string) => {
    const { error } = await supabase.from("category_map").update({ reporting_group: group }).eq("income_category", cat);
    if (error) return toast.error(error.message);
    toast.success("Saved", { duration: 1200 });
    qc.invalidateQueries({ queryKey: ["category_map"] });
  };
  const sorted = [...data].sort((a, b) => Number(b.reporting_group === "Other") - Number(a.reporting_group === "Other"));
  return (
    <Card title="Category mapping" description="How Jane income categories roll up into reporting groups. Categories not listed count as Other.">
      <div className="divide-y divide-border rounded-xl border border-border">
        {sorted.map((c) => (
          <div key={c.income_category} className={`flex items-center justify-between gap-3 px-4 py-2 ${c.reporting_group === "Other" ? "bg-warning/50" : ""}`}>
            <span className="text-sm">{c.income_category}</span>
            <Select value={c.reporting_group} disabled={!isAdmin} onValueChange={(v) => set(c.income_category, v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{REPORTING_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </Card>
  );
}

export const KPI_CODES: { code: string; label: string; direction: "higher_better" | "lower_better" }[] = [
  { code: "revenue", label: "Revenue (CAD)", direction: "higher_better" },
  { code: "visits", label: "Visits", direction: "higher_better" },
  { code: "new_patients", label: "New patients", direction: "higher_better" },
  { code: "cac", label: "CAC (CAD)", direction: "lower_better" },
  { code: "ltv_12m", label: "12-month LTV (CAD)", direction: "higher_better" },
  { code: "ltv_cac", label: "LTV:CAC", direction: "higher_better" },
  { code: "second_visit_rate", label: "2nd Visit Rate (%)", direction: "higher_better" },
  { code: "retention_12m", label: "12-month Retention (%)", direction: "higher_better" },
  { code: "adj_ebitda_pct", label: "Adjusted EBITDA (%)", direction: "higher_better" },
  { code: "revenue_per_provider_hour", label: "Revenue / Provider Hour (CAD)", direction: "higher_better" },
  { code: "provider_utilization", label: "Provider Utilization (%)", direction: "higher_better" },
];

export function KpiTargetsSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data = new Map() } = useQuery({
    queryKey: ["kpi_targets"],
    queryFn: async () => new Map(((await supabase.from("kpi_targets").select("*")).data ?? []).map((t) => [t.kpi_code, t])),
  });
  const save = async (code: string, target: number | null, direction: string) => {
    const { error } = await supabase.from("kpi_targets").upsert({ kpi_code: code, target, direction }, { onConflict: "kpi_code" });
    if (error) return toast.error(error.message);
    toast.success("Saved", { duration: 1200 });
    qc.invalidateQueries({ queryKey: ["kpi_targets"] });
  };
  return (
    <Card title="KPI targets" description="Goals shown on the dashboard. Direction decides whether being above target is good or bad.">
      <div className="divide-y divide-border rounded-xl border border-border">
        {KPI_CODES.map((k) => {
          const t = data.get(k.code);
          const dir = t?.direction ?? k.direction;
          return (
            <div key={k.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
              <span className="flex-1 text-sm">{k.label}</span>
              <Input key={`${k.code}-${t?.target ?? ""}`} disabled={!isAdmin} inputMode="decimal" className="h-8 w-32 text-right"
                defaultValue={t?.target ?? ""} placeholder="—"
                onBlur={(e) => {
                  const raw = e.target.value.replace(/[$,%\s]/g, "");
                  const v = raw === "" ? null : Number(raw);
                  if (v !== null && !Number.isFinite(v)) return toast.error("Please enter a number");
                  if (v !== (t?.target ?? null)) save(k.code, v, dir);
                }} />
              <Select value={dir} disabled={!isAdmin} onValueChange={(v) => save(k.code, t?.target ?? null, v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher_better">Higher is better</SelectItem>
                  <SelectItem value="lower_better">Lower is better</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
