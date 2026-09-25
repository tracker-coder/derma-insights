import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readFile, type RawRow } from "@/lib/jane-appointments";
import { SHIFT_FIELDS, autoMapShifts, saveShiftMapping, shiftMappingValid, transformShifts, type ShiftMapping } from "@/lib/jane-shifts";

const NONE = "__none__";
const LABELS: Record<string, string> = { practitioner: "Practitioner", location: "Location", date: "Date", start: "Start time", end: "End time", hours: "Hours" };

export function ShiftsUpload() {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<ShiftMapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  const parsed = useMemo(() => (mapping && shiftMappingValid(mapping) ? transformShifts(rows, mapping) : null), [rows, mapping]);

  const onFile = async (f: File) => {
    try {
      const r = await readFile(f);
      setFile(f); setHeaders(r.headers); setRows(r.rows); setMapping(autoMapShifts(r.headers)); setDone(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not read file"); }
  };

  const runImport = async () => {
    if (!file || !parsed || !mapping) return;
    saveShiftMapping(mapping);
    setBusy(true); setProgress(0);
    const errors = [...parsed.errors];
    const days = parsed.records.map((r) => r.shift_date).sort();
    const { data: auth } = await supabase.auth.getUser();
    const { data: log } = await supabase.from("import_log").insert({
      report_type: "shifts", file_name: file.name, period_start: days[0] ?? null, period_end: days[days.length - 1] ?? null,
      rows_read: rows.length, uploaded_by: auth.user?.id ?? null,
    }).select("id").single();
    const names = [...new Set(parsed.records.map((r) => r.practitioner))];
    const { data: provs } = await supabase.from("providers").select("name").in("name", names);
    const newProvs = names.filter((n) => !(provs ?? []).some((p) => p.name === n));
    if (newProvs.length) await supabase.from("providers").upsert(newProvs.map((name) => ({ name, display_name: name })), { onConflict: "name", ignoreDuplicates: true });
    let saved = 0;
    for (let i = 0; i < parsed.records.length; i += 500) {
      const chunk = parsed.records.slice(i, i + 500);
      const { error } = await supabase.from("provider_shifts").upsert(
        chunk.map((c) => ({ ...c, source: "import", import_id: log?.id ?? null })),
        { onConflict: "practitioner,location,shift_date" },
      );
      if (error) errors.push({ row: 0, message: error.message }); else saved += chunk.length;
      setProgress(Math.round(((i + chunk.length) / parsed.records.length) * 100));
    }
    if (log) await supabase.from("import_log").update({ inserted: saved, skipped: parsed.errors.length, errors }).eq("id", log.id);
    setBusy(false);
    setDone(`Saved ${saved} provider-days from ${parsed.rowsUsed} shift rows.${errors.length ? ` ${errors.length} rows had problems.` : ""}`);
    setFile(null); setMapping(null);
    qc.invalidateQueries({ queryKey: ["provider_stats"] });
    qc.invalidateQueries({ queryKey: ["import_log"] });
  };

  return (
    <div className="space-y-4">
      {!mapping && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
          onClick={() => ref.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-background p-8 text-center hover:bg-muted/50"
        >
          <UploadCloud className="h-7 w-7 text-primary" />
          <p className="font-medium">Drop the Jane Shifts report</p>
          <p className="text-sm text-muted-foreground">.xlsx or .csv</p>
          <input ref={ref} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </div>
      )}
      {done && <p className="text-sm text-muted-foreground">{done}</p>}
      {mapping && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Match the columns in <b>{file?.name}</b>. You need practitioner, a date (or start time with date), and either hours or start + end.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SHIFT_FIELDS.map((f) => (
              <div key={f} className="flex items-center justify-between gap-3">
                <span className="text-sm">{LABELS[f]}</span>
                <Select value={mapping[f] ?? NONE} onValueChange={(v) => setMapping({ ...mapping, [f]: v === NONE ? null : v })}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Not in file —</SelectItem>
                    {headers.filter(Boolean).map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {parsed && (
            <p className="text-sm">
              {rows.length} rows read → <b>{parsed.records.length}</b> provider-days, {parsed.records.reduce((s, r) => s + r.available_hours, 0).toFixed(1)} hours.
              {parsed.errors.length > 0 && <span className="text-destructive"> {parsed.errors.length} rows can't be used (e.g. row {parsed.errors[0]!.row}: {parsed.errors[0]!.message}).</span>}
            </p>
          )}
          {busy && <Progress value={progress} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setMapping(null); setFile(null); }} disabled={busy}>Cancel</Button>
            <Button onClick={runImport} disabled={busy || !parsed || !parsed.records.length}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import shifts
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
