import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyStateCard } from "@/components/PageHeader";
import { useProfile } from "@/hooks/useProfile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShiftsUpload } from "@/components/providers/ShiftsUpload";
import { ManualShifts } from "@/components/providers/ManualShifts";

export const Route = createFileRoute("/_authenticated/providers")({
  head: () => ({
    meta: [
      { title: "Providers — DermaSpa Insights" },
      { name: "description", content: "Provider visit hours, revenue and available shift hours." },
      { property: "og:title", content: "Providers — DermaSpa Insights" },
      { property: "og:description", content: "Provider visit hours, revenue and available shift hours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProvidersPage,
});

const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
const cad = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });

type Provider = { name: string; display_name: string | null; role: string | null; active: boolean; include_in_kpis: boolean };

function ProvidersPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const isAdmin = profile?.role === "admin";
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => day(new Date()));

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("providers").select("*").order("name");
      if (error) throw error;
      return data as Provider[];
    },
  });
  const stats = useQuery({
    queryKey: ["provider_stats", from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("provider_period_stats", { _start: from, _end: to });
      if (error) throw error;
      return new Map((data ?? []).map((d) => [d.name, d]));
    },
  });

  const update = useMutation({
    mutationFn: async (p: Partial<Provider> & { name: string }) => {
      const { name, ...rest } = p;
      const { error } = await supabase.from("providers").update(rest).eq("name", name);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const list = providers.data ?? [];

  return (
    <>
      <PageHeader title="Providers" subtitle="Visit hours, revenue and availability by provider." />
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-semibold">Providers</h2>
            <div className="flex gap-3">
              <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
          </div>
          {providers.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !list.length ? (
            <p className="text-sm text-muted-foreground">No providers yet. They're added automatically when you import sales or shifts.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Active</TableHead><TableHead>Include in KPIs</TableHead>
                  <TableHead className="text-right">Visit hours</TableHead><TableHead className="text-right">Available hours</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {list.map((p) => {
                    const s = stats.data?.get(p.name);
                    return (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.display_name ?? p.name}</TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <Input className="h-8 w-40" defaultValue={p.role ?? ""} placeholder="e.g. Nurse injector"
                              onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== p.role) update.mutate({ name: p.name, role: v }); }} />
                          ) : (p.role ?? "—")}
                        </TableCell>
                        <TableCell><Switch checked={p.active} disabled={!isAdmin} onCheckedChange={(v) => update.mutate({ name: p.name, active: v })} /></TableCell>
                        <TableCell><Switch checked={p.include_in_kpis} disabled={!isAdmin} onCheckedChange={(v) => update.mutate({ name: p.name, include_in_kpis: v })} /></TableCell>
                        <TableCell className="text-right">{s ? Number(s.visit_hours).toFixed(1) : "—"}</TableCell>
                        <TableCell className="text-right">{s ? Number(s.available_hours).toFixed(1) : "—"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{s ? cad(Number(s.revenue)) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {isAdmin ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-semibold">Available hours</h2>
            <p className="mb-4 text-sm text-muted-foreground">Fill in provider shifts so utilization can be calculated. Uploads and templates replace hours for the same provider, location and day.</p>
            <Tabs defaultValue="upload">
              <TabsList><TabsTrigger value="upload">Upload Shifts report</TabsTrigger><TabsTrigger value="manual">Weekly template</TabsTrigger></TabsList>
              <TabsContent value="upload" className="pt-4"><ShiftsUpload /></TabsContent>
              <TabsContent value="manual" className="pt-4"><ManualShifts providers={list.map((p) => p.name)} /></TabsContent>
            </Tabs>
          </div>
        ) : (
          <EmptyStateCard title="Available hours" description="Only administrators can upload or set provider shift hours." />
        )}
      </div>
    </>
  );
}
