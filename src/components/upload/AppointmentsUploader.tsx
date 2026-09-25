import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  APPT_FIELDS, BLOCKED_HEADERS, REQUIRED_FIELDS, autoMap, missingRequired, readFile, saveMapping,
  transformRows, type ApptField, type ApptRecord, type Mapping, type ParsedRow, type RawRow,
} from "@/lib/jane-appointments";

type Stage = "idle" | "mapping" | "preview" | "importing" | "done";
type Result = {
  inserted: number; updated: number; skipped: number;
  errors: { row: number; message: string }[];
  stats: { arrived_visits: number; first_visits: number; unique_patients: number } | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "short", day: "numeric" });
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" }) : "—";
const NONE = "__none__";

export function AppointmentsUploader() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => {
    setStage("idle"); setFile(null); setHeaders([]); setRows([]); setMapping(null); setProgress(0); setResult(null);
  };

  const handleFile = useCallback(async (f: File) => {
    try {
      const { headers, rows } = await readFile(f);
      if (!rows.length) throw new Error("The file has no data rows.");
      const m = autoMap(headers);
      setFile(f); setHeaders(headers); setRows(rows); setMapping(m); setResult(null);
      setStage(missingRequired(m).length ? "mapping" : "preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file");
    }
  }, []);

  const parsed: ParsedRow[] = useMemo(
    () => (mapping && stage !== "mapping" ? transformRows(rows, mapping) : []),
    [rows, mapping, stage],
  );

  const summary = useMemo(() => {
    const ok = parsed.filter((p): p is Extract<ParsedRow, { kind: "ok" }> => p.kind === "ok");
    const byState: Record<string, number> = {};
    for (const p of parsed) {
      const s = p.kind === "ok" ? p.record.state : p.state ?? "(blank)";
      byState[s] = (byState[s] ?? 0) + 1;
    }
    const starts = ok.map((p) => p.record.start_at!).sort((a, b) => Date.parse(a) - Date.parse(b));
    // Dedupe on jane_id (last row wins) so one batch never upserts the same key twice.
    const unique = new Map<number, { rowNo: number; record: ApptRecord }>();
    for (const p of ok) unique.set(p.record.jane_id, { rowNo: p.rowNo, record: p.record });
    return {
      ok, unique: [...unique.values()], byState,
      skips: parsed.filter((p) => p.kind === "skip").length,
      errors: parsed.filter((p): p is Extract<ParsedRow, { kind: "error" }> => p.kind === "error"),
      minStart: starts[0] ?? null, maxStart: starts[starts.length - 1] ?? null,
    };
  }, [parsed]);

  const runImport = async () => {
    if (!file) return;
    setStage("importing"); setProgress(0);
    const errors = summary.errors.map((e) => ({ row: e.rowNo, message: e.reason }));
    let inserted = 0, updated = 0;
    const toDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" }) : null);
    const { data: auth } = await supabase.auth.getUser();
    const { data: log, error: logErr } = await supabase.from("import_log").insert({
      report_type: "appointments", file_name: file.name,
      period_start: toDay(summary.minStart), period_end: toDay(summary.maxStart),
      rows_read: rows.length, uploaded_by: auth.user?.id,
    }).select("id").single();
    if (logErr || !log) { toast.error(logErr?.message ?? "Could not start import"); setStage("preview"); return; }

    const items = summary.unique;
    const BATCH = 500;
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      const ids = chunk.map((c) => c.record.jane_id);
      const { data: existing } = await supabase.from("appointments").select("jane_id").in("jane_id", ids);
      const existingSet = new Set((existing ?? []).map((e) => Number(e.jane_id)));
      const { error } = await supabase.from("appointments")
        .upsert(chunk.map((c) => ({ ...c.record, import_id: log.id })), { onConflict: "jane_id" });
      if (error) {
        errors.push({ row: chunk[0].rowNo, message: `Rows ${chunk[0].rowNo}–${chunk[chunk.length - 1].rowNo}: ${error.message}` });
      } else {
        updated += ids.filter((id) => existingSet.has(id)).length;
        inserted += ids.filter((id) => !existingSet.has(id)).length;
      }
      setProgress(Math.round(((i + chunk.length) / Math.max(items.length, 1)) * 90));
    }

    const r1 = await supabase.rpc("mark_internal");
    if (r1.error) errors.push({ row: 0, message: `Marking internal time failed: ${r1.error.message}` });
    setProgress(95);
    const r2 = await supabase.rpc("refresh_patients");
    if (r2.error) errors.push({ row: 0, message: `Refreshing patients failed: ${r2.error.message}` });

    const skipped = summary.skips + (summary.ok.length - summary.unique.length);
    await supabase.from("import_log").update({ inserted, updated, skipped, errors }).eq("id", log.id);

    let stats: Result["stats"] = null;
    if (summary.minStart && summary.maxStart) {
      const { data } = await supabase.rpc("appointment_import_stats", { _start: summary.minStart, _end: summary.maxStart });
      const s = Array.isArray(data) ? data[0] : data;
      if (s) stats = { arrived_visits: Number(s.arrived_visits), first_visits: Number(s.first_visits), unique_patients: Number(s.unique_patients) };
    }
    setProgress(100);
    setResult({ inserted, updated, skipped, errors, stats });
    setStage("done");
    qc.invalidateQueries({ queryKey: ["import_log"] });
    toast.success("Appointments imported");
  };

  return (
    <div className="space-y-6">
      {(stage === "idle" || stage === "done") && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${drag ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/50"}`}
        >
          <UploadCloud className="h-8 w-8 text-primary" />
          <div>
            <p className="font-medium">Drop the Jane Appointments report here</p>
            <p className="text-sm text-muted-foreground">or click to choose a .xlsx or .csv file</p>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
      )}

      {stage === "mapping" && mapping && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div>
            <h3 className="font-semibold">Match the columns</h3>
            <p className="text-sm text-muted-foreground">Some expected columns weren't found in <b>{file?.name}</b>. Pick which column holds each field. We'll remember this for next time.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {APPT_FIELDS.map((f) => (
              <div key={f} className="flex items-center justify-between gap-3">
                <span className="text-sm">{f}{REQUIRED_FIELDS.includes(f) && <span className="text-destructive"> *</span>}</span>
                <Select value={mapping[f] ?? NONE} onValueChange={(v) => setMapping({ ...mapping, [f as ApptField]: v === NONE ? null : v })}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Not in file —</SelectItem>
                    {headers.filter((h) => h && !BLOCKED_HEADERS.includes(h.toLowerCase())).map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button disabled={missingRequired(mapping).length > 0} onClick={() => { saveMapping(mapping); setStage("preview"); }}>
              Continue to preview
            </Button>
          </div>
        </div>
      )}

      {(stage === "preview" || stage === "importing") && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="font-medium">{file?.name}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStage("mapping")} disabled={stage === "importing"}>Edit columns</Button>
              <Button variant="outline" onClick={reset} disabled={stage === "importing"}>Cancel</Button>
              <Button onClick={runImport} disabled={stage === "importing" || summary.unique.length === 0}>
                {stage === "importing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {summary.unique.length.toLocaleString()} appointments
              </Button>
            </div>
          </div>
          {stage === "importing" && <Progress value={progress} />}
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Rows read" value={rows.length.toLocaleString()} />
            <Stat label="Date range" value={summary.minStart ? `${fmtDate(summary.minStart)} – ${fmtDate(summary.maxStart!)}` : "—"} />
            <Stat label="Rows to skip" value={summary.skips.toLocaleString()} />
            <Stat label="Rows with errors" value={summary.errors.length.toLocaleString()} />
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.byState).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
              <Badge key={s} variant="secondary">{s}: {n.toLocaleString()}</Badge>
            ))}
          </div>
          {summary.errors.length > 0 && (
            <p className="text-sm text-destructive">
              Errors: {summary.errors.slice(0, 10).map((e) => `row ${e.rowNo} (${e.reason})`).join(", ")}
              {summary.errors.length > 10 && ` and ${summary.errors.length - 10} more`}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead><TableHead>ID</TableHead><TableHead>Start</TableHead>
                  <TableHead>Location</TableHead><TableHead>Patient</TableHead><TableHead>Treatment</TableHead>
                  <TableHead>Practitioner</TableHead><TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.ok.slice(0, 20).map(({ rowNo, record: r }) => (
                  <TableRow key={rowNo}>
                    <TableCell className="text-muted-foreground">{rowNo}</TableCell>
                    <TableCell>{r.jane_id}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(r.start_at)}</TableCell>
                    <TableCell>{r.location}</TableCell>
                    <TableCell>{r.patient_name}</TableCell>
                    <TableCell>{r.treatment_name}</TableCell>
                    <TableCell>{r.practitioner}</TableCell>
                    <TableCell>{r.state}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {stage === "done" && result && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="font-semibold">Import complete</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Inserted" value={result.inserted.toLocaleString()} />
            <Stat label="Updated" value={result.updated.toLocaleString()} />
            <Stat label="Skipped" value={result.skipped.toLocaleString()} />
            <Stat label="Errors" value={result.errors.length.toLocaleString()} />
          </div>
          {result.stats && (
            <>
              <p className="text-sm text-muted-foreground">For this file's date range:</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Arrived visits" value={result.stats.arrived_visits.toLocaleString()} />
                <Stat label="First visits" value={result.stats.first_visits.toLocaleString()} />
                <Stat label="Unique patients" value={result.stats.unique_patients.toLocaleString()} />
              </div>
            </>
          )}
          {result.errors.length > 0 && (
            <ul className="max-h-48 overflow-y-auto text-sm text-destructive space-y-1">
              {result.errors.map((e, i) => <li key={i}>{e.row > 0 ? `Row ${e.row}: ` : ""}{e.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
