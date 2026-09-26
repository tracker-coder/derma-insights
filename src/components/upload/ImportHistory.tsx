import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CsvButton } from "@/components/CsvButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ImportHistory({ reportType }: { reportType?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["import_log", reportType ?? "all"],
    queryFn: async () => {
      let q = supabase.from("import_log").select("*").order("uploaded_at", { ascending: false }).limit(50);
      if (reportType) q = q.eq("report_type", reportType);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold">Import history</h3>
        <CsvButton name={`import-history${reportType ? "-" + reportType : ""}`}
          headers={["Uploaded", "Report", "File", "Period start", "Period end", "Read", "Inserted", "Updated", "Skipped", "Errors"]}
          rows={data?.map((r) => [r.uploaded_at, r.report_type, r.file_name, r.period_start, r.period_end, r.rows_read, r.inserted, r.updated, r.skipped, Array.isArray(r.errors) ? r.errors.length : 0])} />
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">No imports yet. Completed uploads will be listed here.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uploaded</TableHead><TableHead>File</TableHead><TableHead>Period</TableHead>
                <TableHead className="text-right">Read</TableHead><TableHead className="text-right">Inserted</TableHead>
                <TableHead className="text-right">Updated</TableHead><TableHead className="text-right">Skipped</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(r.uploaded_at).toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell>{r.file_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.period_start ?? "—"} → {r.period_end ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.rows_read}</TableCell>
                  <TableCell className="text-right">{r.inserted}</TableCell>
                  <TableCell className="text-right">{r.updated}</TableCell>
                  <TableCell className="text-right">{r.skipped}</TableCell>
                  <TableCell className="text-right">{Array.isArray(r.errors) ? r.errors.length : 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
