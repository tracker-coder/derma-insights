import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const LOCATIONS = ["Derma Spa Oak Bay", "Derma Spa Uptown", "Derma Spa Nanaimo"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type TemplateRow = { location: string; hours: string[] };
const emptyRow = (): TemplateRow => ({ location: LOCATIONS[0]!, hours: Array(7).fill("") });
const keyFor = (p: string) => `dermaspa.shift_template.${p}`;

export function ManualShifts({ providers }: { providers: string[] }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<string>("");
  const [rows, setRows] = useState<TemplateRow[]>([emptyRow()]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = (p: string) => {
    setProvider(p);
    try {
      const saved = JSON.parse(localStorage.getItem(keyFor(p)) ?? "null");
      setRows(Array.isArray(saved) && saved.length ? saved : [emptyRow()]);
    } catch { setRows([emptyRow()]); }
  };

  const generate = async () => {
    if (!provider || !from || !to || from > to) { toast.error("Choose a provider and a valid date range."); return; }
    localStorage.setItem(keyFor(provider), JSON.stringify(rows));
    const records: { practitioner: string; location: string; shift_date: string; available_hours: number; source: string }[] = [];
    for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const wd = (d.getUTCDay() + 6) % 7; // Mon=0
      const day = d.toISOString().slice(0, 10);
      const perLoc = new Map<string, number>();
      for (const r of rows) {
        const h = Number(r.hours[wd]);
        if (h > 0) perLoc.set(r.location, (perLoc.get(r.location) ?? 0) + h);
      }
      perLoc.forEach((h, loc) => records.push({ practitioner: provider, location: loc, shift_date: day, available_hours: h, source: "manual" }));
    }
    if (!records.length) { toast.error("The template has no hours."); return; }
    setBusy(true);
    for (let i = 0; i < records.length; i += 500) {
      const { error } = await supabase.from("provider_shifts").upsert(records.slice(i, i + 500), { onConflict: "practitioner,location,shift_date" });
      if (error) { setBusy(false); { toast.error(error.message); return; } }
    }
    setBusy(false);
    toast.success(`Created ${records.length} shift days for ${provider}`);
    qc.invalidateQueries({ queryKey: ["provider_stats"] });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={pick}>
            <SelectTrigger><SelectValue placeholder="Choose provider" /></SelectTrigger>
            <SelectContent>{providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-2"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {provider && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Location</th>
                {DAYS.map((d) => <th key={d} className="px-1 py-2 font-medium">{d}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <Select value={r.location} onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, location: v } : x)))}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>{LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  {r.hours.map((h, d) => (
                    <td key={d} className="px-1 py-1">
                      <Input className="w-16" inputMode="decimal" value={h} placeholder="0"
                        onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, hours: x.hours.map((y, k) => (k === d ? e.target.value : y)) } : x)))} />
                    </td>
                  ))}
                  <td><Button size="icon" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove location"><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between gap-2">
        <Button variant="outline" size="sm" disabled={!provider} onClick={() => setRows([...rows, emptyRow()])}><Plus className="mr-1 h-4 w-4" />Add location</Button>
        <Button onClick={generate} disabled={busy || !provider}>Generate shifts</Button>
      </div>
    </div>
  );
}
