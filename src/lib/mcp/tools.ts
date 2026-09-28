import { defineTool, ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./supabase";
import * as core from "./core";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date as YYYY-MM-DD");
const location = z.enum(core.LOCATIONS as [string, ...string[]]).optional().describe("Filter to one location; omit for all.");
const provider = z.string().optional().describe("Provider name exactly as listed by get_context; omit for all.");
const ro = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

async function run(tool: string, args: unknown, ctx: ToolContext, fn: (db: core.Db) => Promise<unknown> | unknown) {
  if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
  const db = supabaseForUser(ctx);
  try {
    const out = await core.runLogged(db, tool, args, () => fn(db));
    return { content: [{ type: "text" as const, text: JSON.stringify(out) }] };
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e));
  }
}

export const getContextTool = defineTool({
  name: "get_context", title: "Get context",
  description: "Today's date in Vancouver, how recent the loaded data is, locations, active providers, service groups, and which KPIs lack data and why. Call this first.",
  inputSchema: {}, annotations: ro,
  handler: (a, ctx) => run("get_context", a, ctx, (db) => core.getContext(db)),
});

export const getScorecardTool = defineTool({
  name: "get_scorecard", title: "Get scorecard",
  description: "The 10 clinic scorecard KPIs plus extra metrics for a date range: current value, comparison, % change, target, status and notes.",
  inputSchema: { start_date: date, end_date: date, location, provider, compare_to: z.enum(["previous", "last_year"]).default("previous").describe("Compare with previous period of same length or same period last year.") },
  annotations: ro,
  handler: (a, ctx) => run("get_scorecard", a, ctx, (db) => core.getScorecard(db, a)),
});

export const getKpiTrendTool = defineTool({
  name: "get_kpi_trend", title: "Get KPI trend",
  description: "Monthly values of one KPI over the last N months.",
  inputSchema: { kpi: z.enum(Object.keys(core.KPI_INFO) as [string, ...string[]]).describe("KPI code"), months: z.number().int().min(1).max(36).default(12), location, provider },
  annotations: ro,
  handler: (a, ctx) => run("get_kpi_trend", a, ctx, (db) => core.getKpiTrend(db, a)),
});

export const getRevenueBreakdownTool = defineTool({
  name: "get_revenue_breakdown", title: "Get revenue breakdown",
  description: "Revenue (ex-tax) for a date range split by location, service group, income category, provider or item, with quantity and % of total.",
  inputSchema: { start_date: date, end_date: date, group_by: z.enum(["location", "service_group", "income_category", "provider", "item"]), location, provider, limit: z.number().int().min(1).max(100).default(15) },
  annotations: ro,
  handler: (a, ctx) => run("get_revenue_breakdown", a, ctx, (db) => core.getRevenueBreakdown(db, a)),
});

export const getProviderPerformanceTool = defineTool({
  name: "get_provider_performance", title: "Get provider performance",
  description: "Per-provider revenue, visits, hours, revenue per hour, utilization, new patients and no-show rate for a date range.",
  inputSchema: { start_date: date, end_date: date, location },
  annotations: ro,
  handler: (a, ctx) => run("get_provider_performance", a, ctx, (db) => core.getProviderPerformance(db, a)),
});

export const getRetentionCohortsTool = defineTool({
  name: "get_retention_cohorts", title: "Get retention cohorts",
  description: "For each first-visit month, % of new patients who returned within 1–12 months, and revenue per patient.",
  inputSchema: { months: z.number().int().min(1).max(36).default(12) },
  annotations: ro,
  handler: (a, ctx) => run("get_retention_cohorts", a, ctx, (db) => core.getRetentionCohorts(db, a)),
});

export const explainKpiTool = defineTool({
  name: "explain_kpi", title: "Explain KPI",
  description: "Definition, formula and data sources for a KPI.",
  inputSchema: { kpi: z.enum(Object.keys(core.KPI_INFO) as [string, ...string[]]) },
  annotations: ro,
  handler: (a, ctx) => run("explain_kpi", a, ctx, () => core.explainKpi(a.kpi)),
});

export const allTools = [getContextTool, getScorecardTool, getKpiTrendTool, getRevenueBreakdownTool, getProviderPerformanceTool, getRetentionCohortsTool, explainKpiTool];
