import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()) });

// Admin "Test MCP" panel: runs the same read-only queries the ChatGPT tools use, as the signed-in admin.
export const testMcpTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const core = await import("./mcp/core");
    const db = context.supabase as unknown as import("./mcp/core").Db;
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Admins only");
    const a = data.args as Record<string, never>;
    const fns: Record<string, () => Promise<unknown> | unknown> = {
      get_context: () => core.getContext(db),
      get_scorecard: () => core.getScorecard(db, a),
      get_kpi_trend: () => core.getKpiTrend(db, a),
      get_revenue_breakdown: () => core.getRevenueBreakdown(db, a),
      get_provider_performance: () => core.getProviderPerformance(db, a),
      get_retention_cohorts: () => core.getRetentionCohorts(db, a),
      explain_kpi: () => core.explainKpi(a["kpi"]),
    };
    const fn = fns[data.tool];
    if (!fn) throw new Error("Unknown tool");
    const out = await core.runLogged(db, `${data.tool} (test)`, data.args, fn);
    return JSON.stringify(out, null, 2);
  });
