// Shared read-only KPI queries used by the MCP tools and the Settings test panel.
// Only calls existing aggregate SQL functions — never per-patient data, never arbitrary SQL.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;

export const LOCATIONS = ["Derma Spa Oak Bay", "Derma Spa Uptown", "Derma Spa Nanaimo"];

export const KPI_INFO: Record<string, { label: string; scorecard?: boolean; definition: string; formula: string; depends_on: string }> = {
  revenue: { label: "Revenue", scorecard: true, definition: "Overall growth — net sales before tax.", formula: "SUM(sales subtotal) by invoice date; refunds are negative lines so they net out. Excludes GST/PST.", depends_on: "Jane Sales report" },
  adjusted_ebitda_pct: { label: "Adjusted EBITDA %", scorecard: true, definition: "Are we actually making more money?", formula: "(Revenue − operating expenses + add-backs) / Revenue. Monthly finance inputs prorated by days for partial months. Always company-wide.", depends_on: "Jane Sales report + Monthly Inputs (operating expenses, add-backs)" },
  new_patients: { label: "New Patients", scorecard: true, definition: "Growth of patient base.", formula: "Patients whose first-ever Visit (arrived, non-internal appointment) falls in the period. Uses Jane's first-visit flag until 24 months of history exist.", depends_on: "Jane Appointments report" },
  cac: { label: "CAC", scorecard: true, definition: "Cost of growth.", formula: "Marketing spend in period / new patients. Always company-wide.", depends_on: "Monthly Inputs (marketing spend) + Appointments" },
  ltv_12m: { label: "12-month LTV", scorecard: true, definition: "Value of growth.", formula: "Average revenue per patient in the 365 days after their first Visit, for patients whose first Visit is 12–24 months before period end.", depends_on: "Appointments + Sales, 24 months of history" },
  ltv_cac: { label: "LTV:CAC", scorecard: true, definition: "Economics of acquiring patients.", formula: "12-month LTV / CAC.", depends_on: "Appointments, Sales, Monthly Inputs" },
  second_visit_rate_90d: { label: "2nd Visit Rate", scorecard: true, definition: "Are new patients sticking?", formula: "% of new patients in the period with a 2nd Visit within 90 days of the first. 'Maturing' if any first Visit was less than 90 days ago.", depends_on: "Jane Appointments report" },
  retention_12m: { label: "12-month Retention", scorecard: true, definition: "Long-term health of clinic.", formula: "Of patients with a Visit in the 12 months before the trailing year, % who also had a Visit in the trailing 12 months ending at period end.", depends_on: "Appointments, 24 months of history" },
  revenue_per_provider_hour: { label: "Revenue / Provider Hour", scorecard: true, definition: "Provider productivity.", formula: "Provider revenue (sales staff member) / provider Visit hours.", depends_on: "Sales + Appointments" },
  provider_utilization_pct: { label: "Provider Utilization %", scorecard: true, definition: "Capacity available for growth.", formula: "Booked non-internal hours (arrived + no-show) / available shift hours.", depends_on: "Appointments + provider shifts" },
  collected_revenue: { label: "Collected revenue", definition: "Money actually collected.", formula: "SUM(sales collected) by invoice date.", depends_on: "Jane Sales report" },
  visits: { label: "Visits", definition: "Patient visits.", formula: "Appointments with state 'arrived' that are not internal staff time.", depends_on: "Jane Appointments report" },
  unique_patients: { label: "Unique patients", definition: "Distinct patients seen.", formula: "Distinct patients with a Visit in the period.", depends_on: "Jane Appointments report" },
  avg_revenue_per_visit: { label: "Avg revenue / visit", definition: "Spend per visit.", formula: "Revenue / Visits.", depends_on: "Sales + Appointments" },
  no_show_rate: { label: "No-show rate", definition: "Missed appointments.", formula: "No-shows / (arrived + no-shows).", depends_on: "Jane Appointments report" },
  late_cancel_rate: { label: "Late cancel rate", definition: "Late cancellations.", formula: "Late cancellations / booked appointments.", depends_on: "Jane Appointments report" },
  neuromodulator_units_per_visit: { label: "Neuromodulator units / visit", definition: "Injectable dosing per visit.", formula: "Neuromodulator units sold / Visits.", depends_on: "Sales (Details quantity) + Appointments" },
};

const opt = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "")) as { [K in keyof T]?: NonNullable<T[K]> };

function vanToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const num = (v: unknown) => (v == null ? null : Number(v));
function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? ([] as unknown)) as T;
}

export async function getContext(db: Db) {
  const today = vanToday();
  const [appt, sale, provs, cats] = await Promise.all([
    db.from("appointments").select("start_at").order("start_at", { ascending: false }).limit(1),
    db.from("sales_lines").select("invoice_date").order("invoice_date", { ascending: false }).limit(1),
    db.from("providers").select("name").eq("active", true).order("name"),
    db.from("category_map").select("reporting_group"),
  ]);
  const monthStart = today.slice(0, 8) + "01";
  const kpis = must(await db.rpc("get_kpis", { p_start: monthStart, p_end: today }));
  const groups = [...new Set([...must(cats).map((c) => c.reporting_group), "Other"])].sort();
  return {
    today_vancouver: today,
    latest_appointment_date: must(appt)[0]?.start_at?.slice(0, 10) ?? null,
    latest_invoice_date: must(sale)[0]?.invoice_date?.slice(0, 10) ?? null,
    locations: LOCATIONS,
    active_providers: must(provs).map((p) => p.name),
    service_groups: groups,
    kpis_lacking_data_month_to_date: kpis.filter((k) => k.value == null).map((k) => ({ kpi: k.kpi_code, reason: k.note ?? "No data" })),
  };
}

export async function getScorecard(db: Db, a: { start_date: string; end_date: string; location?: string | undefined; provider?: string | undefined; compare_to?: "previous" | "last_year" | undefined }) {
  const rows = must(await db.rpc("get_kpis", { p_start: a.start_date, p_end: a.end_date, ...opt({ p_location: a.location, p_practitioner: a.provider }) }));
  const ly = a.compare_to === "last_year";
  return {
    period: { start: a.start_date, end: a.end_date, compare_to: ly ? "same period last year" : "previous period", location: a.location ?? "All", provider: a.provider ?? "All" },
    kpis: rows.map((k) => ({
      kpi: k.kpi_code,
      label: KPI_INFO[k.kpi_code]?.label ?? k.kpi_code,
      scorecard: !!KPI_INFO[k.kpi_code]?.scorecard,
      current: num(k.value),
      comparison: num(ly ? k.yoy_value : k.prev_value),
      change_pct: num(ly ? k.yoy_change_pct : k.change_pct),
      target: num(k.target),
      status: k.status ?? null,
      note: k.note ?? null,
    })),
  };
}

export async function getKpiTrend(db: Db, a: { kpi: string; months?: number | undefined; location?: string | undefined; provider?: string | undefined }) {
  const rows = must(await db.rpc("get_kpi_trend", { p_kpi: a.kpi, p_months: a.months ?? 12, ...opt({ p_location: a.location, p_practitioner: a.provider }) }));
  return { kpi: a.kpi, months: rows.map((r) => ({ month: r.month, value: num(r.value) })) };
}

const GROUP_MAP = { location: "location", service_group: "reporting_group", income_category: "income_category", provider: "staff_member", item: "item" } as const;
export type GroupBy = keyof typeof GROUP_MAP;

export async function getRevenueBreakdown(db: Db, a: { start_date: string; end_date: string; group_by: GroupBy; location?: string | undefined; provider?: string | undefined; limit?: number | undefined }) {
  const rows = must(await db.rpc("get_revenue_breakdown", { p_start: a.start_date, p_end: a.end_date, p_group: GROUP_MAP[a.group_by], ...opt({ p_location: a.location, p_practitioner: a.provider }) }));
  const sorted = [...rows].sort((x, y) => Number(y.revenue) - Number(x.revenue));
  return {
    group_by: a.group_by,
    total_revenue: sorted.reduce((s, r) => s + Number(r.revenue ?? 0), 0),
    rows: sorted.slice(0, a.limit ?? 15).map((r) => ({ name: r.group, revenue: num(r.revenue), quantity: num(r.quantity), pct_of_total: num(r.pct_of_total) })),
  };
}

export async function getProviderPerformance(db: Db, a: { start_date: string; end_date: string; location?: string | undefined }) {
  const rows = must(await db.rpc("get_provider_table", { p_start: a.start_date, p_end: a.end_date, ...opt({ p_location: a.location }) }));
  return {
    providers: rows.map((r) => ({
      provider: r.practitioner, revenue: num(r.revenue), visits: num(r.visits), visit_hours: num(r.visit_hours),
      available_hours: num(r.available_hours), revenue_per_hour: num(r.revenue_per_hour), utilization_pct: num(r.utilization_pct),
      new_patients: num(r.new_patients), no_show_rate: num(r.no_show_rate),
    })),
  };
}

export async function getRetentionCohorts(db: Db, a: { months?: number | undefined }) {
  const rows = must(await db.rpc("get_cohorts", { p_months: a.months ?? 12 }));
  const pct = (n: unknown, d: number) => (n == null || !d ? null : Math.round((Number(n) / d) * 1000) / 10);
  return {
    note: "Percent of each first-visit cohort who returned within N months. Null = cohort not old enough yet.",
    cohorts: rows.map((r) => ({
      cohort_month: r.cohort_month, cohort_size: r.cohort_size,
      returned_pct: { m1: pct(r.returned_1m, r.cohort_size), m2: pct(r.returned_2m, r.cohort_size), m3: pct(r.returned_3m, r.cohort_size), m6: pct(r.returned_6m, r.cohort_size), m9: pct(r.returned_9m, r.cohort_size), m12: pct(r.returned_12m, r.cohort_size) },
      revenue_per_patient: { m3: num(r.revenue_per_patient_3m), m6: num(r.revenue_per_patient_6m), m12: num(r.revenue_per_patient_12m) },
    })),
  };
}

export function explainKpi(kpi: string) {
  const k = KPI_INFO[kpi];
  if (!k) throw new Error(`Unknown KPI "${kpi}". Known: ${Object.keys(KPI_INFO).join(", ")}`);
  return { kpi, ...k };
}

// Wraps a call with the enabled/rate-limit gate and writes one mcp_log row.
export async function runLogged<T>(db: Db, tool: string, args: unknown, fn: () => Promise<T> | T): Promise<T> {
  const gate = await db.rpc("mcp_check_call");
  if (gate.error) throw new Error(gate.error.message);
  if (gate.data) throw new Error(gate.data);
  const t0 = Date.now();
  const { data: u } = await db.auth.getUser();
  try {
    const out = await fn();
    await db.from("mcp_log").insert({ tool, arguments: args as never, duration_ms: Date.now() - t0, success: true, user_id: u.user?.id ?? null });
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("mcp_log").insert({ tool, arguments: args as never, duration_ms: Date.now() - t0, success: false, error: msg, user_id: u.user?.id ?? null });
    throw e;
  }
}
