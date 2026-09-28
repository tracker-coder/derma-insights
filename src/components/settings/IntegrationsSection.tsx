import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { testMcpTool } from "@/lib/mcp-admin.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 8) + "01";
const SAMPLES: Record<string, object> = {
  get_context: {},
  get_scorecard: { start_date: monthStart, end_date: today, compare_to: "previous" },
  get_kpi_trend: { kpi: "revenue", months: 12 },
  get_revenue_breakdown: { start_date: monthStart, end_date: today, group_by: "service_group", limit: 15 },
  get_provider_performance: { start_date: monthStart, end_date: today },
  get_retention_cohorts: { months: 12 },
  explain_kpi: { kpi: "ltv_cac" },
};

export function IntegrationsSection() {
  const qc = useQueryClient();
  const runTool = useServerFn(testMcpTool);
  const url = typeof window !== "undefined" ? `${window.location.origin.replace("id-preview--", "")}/mcp` : "/mcp";
  const publishedUrl = "https://derma-insights.lovable.app/mcp";
  const { data: settings } = useQuery({
    queryKey: ["mcp_settings"],
    queryFn: async () => (await supabase.from("mcp_settings").select("enabled").eq("id", 1).maybeSingle()).data,
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["mcp_log"],
    queryFn: async () => (await supabase.from("mcp_log").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const [tool, setTool] = useState("get_context");
  const [args, setArgs] = useState(JSON.stringify(SAMPLES.get_context, null, 2));
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = async (enabled: boolean) => {
    const { error } = await supabase.from("mcp_settings").update({ enabled, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success(enabled ? "ChatGPT connection turned on" : "ChatGPT connection turned off");
    qc.invalidateQueries({ queryKey: ["mcp_settings"] });
  };
  const run = async () => {
    setBusy(true);
    try {
      const parsed = JSON.parse(args || "{}");
      setOut(await runTool({ data: { tool, args: parsed } }));
    } catch (e) {
      setOut(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["mcp_log"] });
  };
  void url;

  return (
    <div className="rounded-xl border border-border bg-card p-6 md:p-8">
      <h2 className="text-base font-semibold">Integrations — ChatGPT</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask questions about your KPIs from ChatGPT. It sees totals only — never patient names or numbers. Each person signs in with their own DermaSpa Insights account.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <code className="rounded-lg bg-muted px-3 py-2 text-sm">{publishedUrl}</code>
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(publishedUrl); toast.success("Copied"); }}>
          <Copy className="mr-1 h-4 w-4" /> Copy
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <Switch checked={settings?.enabled ?? false} onCheckedChange={toggle} /> Enabled
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        In ChatGPT: Settings → Apps & Connectors → Create, paste this link, choose OAuth, then sign in when asked. Limited to 60 calls per minute.
      </p>

      <h3 className="mt-8 text-sm font-semibold">Test a question tool</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <Select value={tool} onValueChange={(v) => { setTool(v); setArgs(JSON.stringify(SAMPLES[v], null, 2)); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.keys(SAMPLES).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea rows={8} className="font-mono text-xs" value={args} onChange={(e) => setArgs(e.target.value)} />
          <Button onClick={run} disabled={busy}>{busy ? "Running…" : "Run"}</Button>
        </div>
        <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">{out || "Response appears here."}</pre>
      </div>

      <h3 className="mt-8 text-sm font-semibold">Last 100 calls</h3>
      <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">Tool</th><th className="p-2">Arguments</th><th className="p-2 text-right">ms</th><th className="p-2">Result</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.length === 0 ? (
              <tr><td colSpan={6} className="p-3 text-muted-foreground">No calls yet.</td></tr>
            ) : logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap p-2">{new Date(l.created_at).toLocaleString("en-CA", { timeZone: "America/Vancouver" })}</td>
                <td className="p-2">{l.user_email ?? "—"}</td>
                <td className="p-2 font-mono text-xs">{l.tool}</td>
                <td className="max-w-xs truncate p-2 font-mono text-xs" title={JSON.stringify(l.arguments)}>{JSON.stringify(l.arguments)}</td>
                <td className="p-2 text-right">{l.duration_ms}</td>
                <td className="p-2">{l.success ? <span className="text-success">OK</span> : <span className="text-destructive" title={l.error ?? ""}>Error</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
