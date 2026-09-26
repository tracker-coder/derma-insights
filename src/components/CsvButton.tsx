import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/format";

type Cell = string | number | null | undefined;

export function CsvButton({ name, headers, rows, className }: { name: string; headers: string[]; rows: Cell[][] | undefined; className?: string | undefined }) {
  return (
    <Button variant="outline" size="sm" className={className ?? "h-8"} disabled={!rows?.length}
      onClick={() => downloadCsv(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows ?? [])}>
      <Download className="size-4" /> Export CSV
    </Button>
  );
}
