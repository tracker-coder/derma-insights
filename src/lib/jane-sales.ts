import { parseTimestamp, type RawRow } from "@/lib/jane-appointments";

export const SALES_FIELDS = [
  "Location", "Purchase Date", "Invoice Date", "Patient Guid", "Patient", "Item", "Staff Member", "Payer",
  "Invoice #", "Income Category", "Details", "Status", "Subtotal", "GST", "PST", "Total", "Collected", "Balance",
] as const;
export type SalesField = (typeof SALES_FIELDS)[number];
export const SALES_REQUIRED: SalesField[] = ["Invoice #", "Invoice Date", "Location", "Subtotal", "Total", "Collected", "Balance"];
export type SalesMapping = Record<SalesField, string | null>;
const KEY = "dermaspa.mapping.jane_sales";

export function autoMapSales(headers: string[]): SalesMapping {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const lower = new Map(headers.map((h) => [norm(h), h]));
  let saved: Partial<SalesMapping> | null = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { /* ignore */ }
  const m = {} as SalesMapping;
  for (const f of SALES_FIELDS) {
    const s = saved?.[f];
    m[f] = lower.get(norm(f)) ?? (s && headers.includes(s) ? s : null);
  }
  return m;
}
export const saveSalesMapping = (m: SalesMapping) => localStorage.setItem(KEY, JSON.stringify(m));
export const missingSales = (m: SalesMapping) => SALES_REQUIRED.filter((f) => !m[f]);

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};
const money = (v: unknown): number => {
  if (typeof v === "number") return Math.round(v * 100) / 100;
  const s = text(v);
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round((neg ? -n : n) * 100) / 100 : 0;
};
const date = (v: unknown): string | null => {
  const s = text(v);
  // Date-only values: anchor at noon Vancouver so the day never shifts.
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00-08:00`;
  return parseTimestamp(v instanceof Date ? v : s);
};
const STATUSES = ["paid", "no_charge", "refunded", "unpaid", "partially_paid"];

export type SalesRecord = {
  invoice_line_no: string; is_refund: boolean; location: string | null;
  purchase_date: string | null; invoice_date: string | null; patient_guid: string | null;
  patient_name: string | null; item: string | null; staff_member: string; payer: string | null;
  income_category: string | null; quantity: number | null; status: string | null;
  subtotal: number; gst: number; pst: number; total: number; collected: number; balance: number;
};
export type SalesParsed =
  | { rowNo: number; kind: "ok"; record: SalesRecord }
  | { rowNo: number; kind: "error"; reason: string };

export function transformSales(rows: RawRow[], m: SalesMapping): SalesParsed[] {
  const get = (r: RawRow, f: SalesField) => (m[f] ? r[m[f] as string] : null);
  return rows.map((r, i) => {
    const rowNo = i + 2;
    const inv = text(get(r, "Invoice #"));
    if (!inv) return { rowNo, kind: "error", reason: "Missing Invoice #" };
    const invDate = date(get(r, "Invoice Date"));
    if (!invDate) return { rowNo, kind: "error", reason: "Invalid Invoice Date" };
    const qty = text(get(r, "Details"))?.match(/quantity:\s*(-?[\d.]+)/i);
    const st = text(get(r, "Status"))?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
    return {
      rowNo, kind: "ok",
      record: {
        invoice_line_no: inv,
        is_refund: /-refund$/i.test(inv),
        location: text(get(r, "Location")),
        purchase_date: date(get(r, "Purchase Date")),
        invoice_date: invDate,
        patient_guid: text(get(r, "Patient Guid")),
        patient_name: text(text(get(r, "Patient"))?.replace(/\*+\s*$/, "")),
        item: text(get(r, "Item")),
        staff_member: text(get(r, "Staff Member")) ?? "Unassigned",
        payer: text(get(r, "Payer")),
        income_category: text(get(r, "Income Category")),
        quantity: qty ? Number(qty[1]) : null,
        status: st && STATUSES.includes(st) ? st : null,
        subtotal: money(get(r, "Subtotal")), gst: money(get(r, "GST")), pst: money(get(r, "PST")),
        total: money(get(r, "Total")), collected: money(get(r, "Collected")), balance: money(get(r, "Balance")),
      },
    };
  });
}
