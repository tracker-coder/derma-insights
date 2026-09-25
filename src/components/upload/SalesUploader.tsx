import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readFile, type RawRow } from "@/lib/jane-appointments";
import {
  SALES_FIELDS, SALES_REQUIRED, autoMapSales, missingSales, saveSalesMapping, transformSales,
  type SalesMapping, type SalesParsed, type SalesRecord,
} from "@/lib/jane-sales";

type Stage = "idle" | "mapping" | "preview" | "importing" | "done";
type StatRow = { location: string; revenue: number; total: number; collected: number; balance: number; refund_lines: number };
type Result = {
  inserted: number; updated: number; skipped: number; errors: { row: number; message: string }[];
  stats: StatRow[]; newProviders: string[]; newCategories: string[];
};

const NONE = "__none__";
const cad = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "short", day: "numeric" });
const toDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" }) : null);

export function SalesUploader() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<SalesMapping | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => { setStage("idle"); setFile(null); setRows([]); setMapping(null); setResult(null); setProgress(0); };

  const handleFile = async (f: File) => {
    try {
      const r = await readFile(f);
      if (!r.rows.length) throw new Error("The file has no data rows.");
      const m = autoMapSales(r.headers);
      setFile(f); setHeaders(r.headers); setRows(r.rows); setMapping(m); setResult(null);
      setStage(missingSales(m).length ? "mapping" : "preview");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not read file"); }
  };

  const parsed: SalesParsed[] = useMemo(
    () => (mapping && stage !== "mapping" ? transformSales(rows, mapping) : []), [rows, mapping, stage]);

  const summary = useMemo(() => {
    const ok = parsed.filter((p): p is Extract<SalesParsed, { kind: "ok" }> => p.kind === "ok");
    const errors = parsed.filter((p): p is Extract<SalesParsed, { kind: "error" }> => p.kind === "error");
    const unique = new Map<string, { rowNo: number; record: SalesRecord }>();
    for (const p of ok) unique.set(p.record.invoice_line_no, p);
    const dates = ok.map((p) => p.record.invoice_date!).sort((a, b) => Date.parse(a) - Date.parse(b));
    return {
      ok, errors, unique: [...unique.values()],
      refunds: ok.filter((p) => p.record.is_refund).length,
      subtotal: ok.reduce((s, p) => s + p.record.subtotal, 0),
      minDate: dates[0] ?? null, maxDate: dates[dates.length - 1] ?? null,
    };
  }, [parsed]);

  const runImport = async () => {
    if (!file) return;
    setStage("importing"); setProgress(0);
    const errors = summary.errors.map((e) => ({ row: e.rowNo, message: e.reason }));
    const { data: auth } = await supabase.auth.getUser();
    const { data: log, error: logErr } = await supabase.from("import_log").insert({
      report_type: "sales", file_name: file.name, period_start: toDay(summary.minDate), period_end: toDay(summary.maxDate),
      rows_read: rows.length, uploaded_by: auth.user?.id ?? null,
    }).select("id").single();
    if (logErr || !log) { toast.error(logErr?.message ?? "Could not start import"); setStage("preview"); return; }

    // New providers and categories
    const staff = [...new Set(summary.unique.map((u) => u.record.staff_member))];
    const cats = [...new Set(summary.unique.map((u) => u.record.income_category).filter((c): c is string => !!c))];
    const [{ data: provs }, { data: catRows }] = await Promise.all([
      supabase.from("providers").select("name").in("name", staff),
      cats.length ? supabase.from("category_map").select("income_category").in("income_category", cats) : Promise.resolve({ data: [] as { income_category: string }[] }),
    ]);
    const newProviders = staff.filter((s) => !(provs ?? []).some((p) => p.name === s));
    const newCategories = cats.filter((c) => !(catRows ?? []).some((r) => r.income_category === c));
    if (newProviders.length) {
      const { error } = await supabase.from("providers").upsert(newProviders.map((name) => ({ name, display_name: name })), { onConflict: "name", ignoreDuplicates: true });
      if (error) errors.push({ row: 0, message: `Adding providers failed: ${error.message}` });
    }
    if (newCategories.length) {
      const { error } = await supabase.from("category_map").upsert(newCategories.map((c) => ({ income_category: c, reporting_group: "Other" })), { onConflict: "income_category", ignoreDuplicates: true });
      if (error) errors.push({ row: 0, message: `Adding categories failed: ${error.message}` });
    }

    let inserted = 0, updated = 0;
    const items = summary.unique, BATCH = 500;
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      const keys = chunk.map((c) => c.record.invoice_line_no);
      const { data: existing } = await supabase.from("sales_lines").select("invoice_line_no").in("invoice_line_no", keys);
      const ex = new Set((existing ?? []).map((e) => e.invoice_line_no));
      const { error } = await supabase.from("sales_lines").upsert(chunk.map((c) => ({ ...c.record, import_id: log.id })), { onConflict: "invoice_line_no" });
      if (error) {
        const a = chunk[0]!.rowNo, b = chunk[chunk.length - 1]!.rowNo;
        errors.push({ row: a, message: `Rows ${a}–${b}: ${error.message}` });
      } else {
        updated += keys.filter((k) => ex.has(k)).length;
        inserted += keys.filter((k) => !ex.has(k)).length;
      }
      setProgress(Math.round(((i + chunk.length) / Math.max(items.length, 1)) * 90));
    }

    const rp = await supabase.rpc("refresh_patients");
    if (rp.error) errors.push({ row: 0, message: `Refreshing patients failed: ${rp.error.message}` });
    const skipped = summary.ok.length - summary.unique.length;
    await supabase.from("import_log").update({ inserted, updated, skipped, errors }).eq("id", log.id);

    let stats: StatRow[] = [];
    if (summary.minDate && summary.maxDate) {
      const { data } = await supabase.rpc("sales_import_stats", { _start: summary.minDate, _end: summary.maxDate });
      stats = (data ?? []).map((d) => ({
        location: d.location, revenue: Number(d.revenue), total: Number(d.total),
        collected: Number(d.collected), balance: Number(d.balance), refund_lines: Number(d.refund_lines),
      }));
    }
    setProgress(100);
    setResult({ inserted, updated, skipped, errors, stats, newProviders, newCategories });
    setStage("done");
    qc.invalidateQueries({ queryKey: ["import_log"] });
    toast.success("Sales imported");
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
            <p className="font-medium">Drop the Jane Sales report here</p>
            <p className="text-sm text-muted-foreground">or click to choose a .xlsx or .csv file</p>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
      )}

      {stage === "mapping" && mapping && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div>
            <h3 className="font-semibold">Match the columns</h3>
            <p className="text-sm text-muted-foreground">Some expected columns weren't found in <b>{file?.name}</b>. We'll remember your choices.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SALES_FIELDS.map((f) => (
              <div key={f} className="flex items-center justify-between gap-3">
                <span className="text-sm">{f}{SALES_REQUIRED.includes(f) && <span className="text-destructive"> *</span>}</span>
                <Select value={mapping[f] ?? NONE} onValueChange={(v) => setMapping({ ...mapping, [f]: v === NONE ? null : v })}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Not in file —</SelectItem>
                    {headers.filter(Boolean).map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button disabled={missingSales(mapping).length > 0} onClick={() => { saveSalesMapping(mapping); setStage("preview"); }}>Continue to preview</Button>
          </div>
        </div>
      )}

      {(stage === "preview" || stage === "importing") && (
        <div className="space-y-5 rounded-xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /><span className="font-medium">{file?.name}</span></div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStage("mapping")} disabled={stage === "importing"}>Edit columns</Button>
              <Button variant="outline" onClick={reset} disabled={stage === "importing"}>Cancel</Button>
              <Button onClick={runImport} disabled={stage === "importing" || !summary.unique.length}>
                {stage === "importing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {summary.unique.length.toLocaleString()} lines
              </Button>
            </div>
          </div>
          {stage === "importing" && <Progress value={progress} />}
          <div className="grid gap-3 sm:grid-cols-5">
            <Stat label="Rows read" value={rows.length.toLocaleString()} />
            <Stat label="Invoice dates" value={summary.minDate ? `${fmtDate(summary.minDate)} – ${fmtDate(summary.maxDate!)}` : "—"} />
            <Stat label="Subtotal in file" value={cad(summary.subtotal)} />
            <Stat label="Refund lines" value={summary.refunds.toLocaleString()} />
            <Stat label="Rows with errors" value={summary.errors.length.toLocaleString()} />
          </div>
          {summary.errors.length > 0 && (
            <p className="text-sm text-destructive">
              Errors: {summary.errors.slice(0, 10).map((e) => `row ${e.rowNo} (${e.reason})`).join(", ")}
              {summary.errors.length > 10 && ` and ${summary.errors.length - 10} more`}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Row</TableHead><TableHead>Invoice #</TableHead><TableHead>Date</TableHead><TableHead>Location</TableHead>
                <TableHead>Patient</TableHead><TableHead>Item</TableHead><TableHead>Staff</TableHead><TableHead>Category</TableHead>
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Subtotal</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {summary.ok.slice(0, 20).map(({ rowNo, record: r }) => (
                  <TableRow key={rowNo}>
                    <TableCell className="text-muted-foreground">{rowNo}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.invoice_line_no}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.invoice_date ? fmtDate(r.invoice_date) : "—"}</TableCell>
                    <TableCell>{r.location}</TableCell><TableCell>{r.patient_name}</TableCell>
                    <TableCell>{r.item}</TableCell><TableCell>{r.staff_member}</TableCell><TableCell>{r.income_category}</TableCell>
                    <TableCell className="text-right">{r.quantity ?? ""}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{cad(r.subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {stage === "done" && result && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h3 className="font-semibold">Import complete</h3>
          {(result.newCategories.length > 0 || result.newProviders.length > 0) && (
            <div className="flex gap-3 rounded-lg border border-border bg-accent p-4 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-1">
                {result.newCategories.length > 0 && (
                  <p><b>{result.newCategories.length} new income categor{result.newCategories.length === 1 ? "y" : "ies"}</b> added as "Other": {result.newCategories.join(", ")}. Please categorize them in <Link to="/settings" className="underline">Settings</Link>.</p>
                )}
                {result.newProviders.length > 0 && <p><b>New providers added:</b> {result.newProviders.join(", ")}.</p>}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Inserted" value={result.inserted.toLocaleString()} />
            <Stat label="Updated" value={result.updated.toLocaleString()} />
            <Stat label="Skipped (duplicates)" value={result.skipped.toLocaleString()} />
            <Stat label="Errors" value={result.errors.length.toLocaleString()} />
          </div>
          {result.stats.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Location</TableHead><TableHead className="text-right">Revenue ex-tax</TableHead>
                  <TableHead className="text-right">Total incl. tax</TableHead><TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Refund lines</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {result.stats.map((s) => {
                    const isTotal = s.location === "__total__";
                    return (
                      <TableRow key={s.location} className={isTotal ? "font-semibold" : ""}>
                        <TableCell>{isTotal ? "All locations" : s.location}</TableCell>
                        <TableCell className="text-right">{cad(s.revenue)}</TableCell>
                        <TableCell className="text-right">{cad(s.total)}</TableCell>
                        <TableCell className="text-right">{cad(s.collected)}</TableCell>
                        <TableCell className="text-right">{cad(s.balance)}</TableCell>
                        <TableCell className="text-right">{s.refund_lines}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-destructive">
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
