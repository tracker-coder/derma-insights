import Papa from "papaparse";

export type RawRow = Record<string, unknown>;

export const APPT_FIELDS = [
  "id", "location_name", "start_at", "end_at", "patient_guid", "patient_number",
  "patient_first_name", "patient_preferred_name", "patient_last_name", "treatment_name",
  "staff_member_name", "state", "first_visit", "chart_status", "booked_at", "arrived_at",
  "booked_online", "cancelled_at", "cancelled_reason",
] as const;
export type ApptField = (typeof APPT_FIELDS)[number];

export const REQUIRED_FIELDS: ApptField[] = [
  "id", "location_name", "start_at", "end_at", "patient_guid", "patient_first_name",
  "patient_last_name", "treatment_name", "staff_member_name", "state",
];

// Never sent to the database.
export const BLOCKED_HEADERS = ["notes_text", "insurance_state"];

export type Mapping = Record<ApptField, string | null>;
const MAPPING_KEY = "dermaspa.mapping.jane_appointments";

const VALID_STATES = ["arrived", "booked", "cancelled", "rescheduled", "no_show", "archived"];

export async function readFile(file: File): Promise<{ headers: string[]; rows: RawRow[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const res = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: "greedy" });
    return { headers: (res.meta.fields ?? []).map((h) => h.trim()), rows: res.data };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheetName = wb.SheetNames.includes("Export") ? "Export" : wb.SheetNames[0]!;
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
    const headers = ((aoa[0] ?? []) as unknown[]).map((h) => String(h ?? "").trim());
    const rows = aoa.slice(1)
      .filter((r) => r.some((v) => v !== null && v !== ""))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])));
    return { headers, rows };
  }
  throw new Error("Please upload a .xlsx or .csv file.");
}

export function autoMap(headers: string[]): Mapping {
  const lower = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  const saved = loadSavedMapping();
  const m = {} as Mapping;
  for (const f of APPT_FIELDS) {
    const savedCol = saved?.[f];
    m[f] = lower.get(f) ?? (savedCol && headers.includes(savedCol) ? savedCol : null);
  }
  return m;
}

export function missingRequired(m: Mapping) {
  return REQUIRED_FIELDS.filter((f) => !m[f]);
}

export function loadSavedMapping(): Partial<Mapping> | null {
  try {
    return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? "null");
  } catch {
    return null;
  }
}
export function saveMapping(m: Mapping) {
  localStorage.setItem(MAPPING_KEY, JSON.stringify(m));
}

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};

const bool = (v: unknown): boolean | null => {
  if (typeof v === "boolean") return v;
  const s = text(v)?.toLowerCase();
  if (!s) return null;
  if (["true", "yes", "1", "y"].includes(s)) return true;
  if (["false", "no", "0", "n"].includes(s)) return false;
  return null;
};

/** "2026-09-01 08:30:00 -0700" → "2026-09-01T08:30:00-07:00" (offset preserved). */
export function parseTimestamp(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  const s = text(v);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    const t2 = m[2]!; const time = t2.length === 5 ? `${t2}:00` : t2;
    let off = m[3] ?? "";
    if (off && off !== "Z" && !off.includes(":")) off = `${off.slice(0, 3)}:${off.slice(3)}`;
    return `${m[1]}T${time}${off}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export type ApptRecord = {
  jane_id: number;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  patient_guid: string | null;
  patient_number: string | null;
  patient_name: string | null;
  treatment_name: string | null;
  practitioner: string | null;
  state: string;
  first_visit: boolean | null;
  chart_status: string | null;
  booked_at: string | null;
  arrived_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  booked_online: boolean | null;
};

export type ParsedRow =
  | { rowNo: number; kind: "ok"; record: ApptRecord }
  | { rowNo: number; kind: "skip"; reason: string; state: string | null }
  | { rowNo: number; kind: "error"; reason: string; state: string | null };

export function transformRows(rows: RawRow[], m: Mapping): ParsedRow[] {
  const get = (r: RawRow, f: ApptField) => (m[f] ? r[m[f] as string] : null);
  return rows.map((r, i) => {
    const rowNo = i + 2; // header is row 1
    const rawState = text(get(r, "state"))?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
    if (rawState === "never_booked") return { rowNo, kind: "skip", reason: "Empty slot (never_booked)", state: rawState };
    const guid = text(get(r, "patient_guid"));
    if (!guid || !/-\d+/.test(guid)) return { rowNo, kind: "skip", reason: "No patient", state: rawState };
    const idNum = Number(text(get(r, "id")));
    if (!Number.isFinite(idNum) || idNum <= 0) return { rowNo, kind: "error", reason: "Missing or invalid id", state: rawState };
    if (!rawState || !VALID_STATES.includes(rawState)) return { rowNo, kind: "error", reason: `Unknown state "${rawState ?? ""}"`, state: rawState };
    const start = parseTimestamp(get(r, "start_at"));
    if (!start) return { rowNo, kind: "error", reason: "Invalid start_at", state: rawState };
    const first = text(get(r, "patient_preferred_name")) ?? text(get(r, "patient_first_name"));
    const name = [first, text(get(r, "patient_last_name"))].filter(Boolean).join(" ").trim() || null;
    return {
      rowNo,
      kind: "ok",
      record: {
        jane_id: Math.trunc(idNum),
        location: text(get(r, "location_name")),
        start_at: start,
        end_at: parseTimestamp(get(r, "end_at")),
        patient_guid: guid,
        patient_number: text(get(r, "patient_number")),
        patient_name: name,
        treatment_name: text(get(r, "treatment_name")),
        practitioner: text(get(r, "staff_member_name")),
        state: rawState,
        first_visit: bool(get(r, "first_visit")),
        chart_status: text(get(r, "chart_status")),
        booked_at: parseTimestamp(get(r, "booked_at")),
        arrived_at: parseTimestamp(get(r, "arrived_at")),
        cancelled_at: parseTimestamp(get(r, "cancelled_at")),
        cancelled_reason: text(get(r, "cancelled_reason")),
        booked_online: bool(get(r, "booked_online")),
      },
    };
  });
}
