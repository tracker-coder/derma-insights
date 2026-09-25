import { parseTimestamp, type RawRow } from "@/lib/jane-appointments";

export const SHIFT_FIELDS = ["practitioner", "location", "date", "start", "end", "hours"] as const;
export type ShiftField = (typeof SHIFT_FIELDS)[number];
export type ShiftMapping = Record<ShiftField, string | null>;
const KEY = "dermaspa.mapping.jane_shifts";

const GUESSES: Record<ShiftField, string[]> = {
  practitioner: ["staff_member_name", "practitioner", "staff member", "staff", "provider", "staff_member"],
  location: ["location_name", "location"],
  date: ["date", "shift_date", "day"],
  start: ["start_at", "start", "start time", "start_time"],
  end: ["end_at", "end", "end time", "end_time"],
  hours: ["hours", "duration_hours", "total hours", "shift hours"],
};

export function autoMapShifts(headers: string[]): ShiftMapping {
  const lower = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  let saved: Partial<ShiftMapping> | null = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { /* ignore */ }
  const m = {} as ShiftMapping;
  for (const f of SHIFT_FIELDS) {
    const s = saved?.[f];
    m[f] = s && headers.includes(s) ? s : GUESSES[f].map((g) => lower.get(g)).find(Boolean) ?? null;
  }
  return m;
}
export const saveShiftMapping = (m: ShiftMapping) => localStorage.setItem(KEY, JSON.stringify(m));
export const shiftMappingValid = (m: ShiftMapping) =>
  !!m.practitioner && (!!m.date || !!m.start) && (!!m.hours || (!!m.start && !!m.end));

const text = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
};
const vanDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });

function toDay(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : vanDay(v);
  const s = text(v);
  if (!s) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : vanDay(d);
}
function minutesOfDay(v: unknown): number | null {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const s = text(v);
  const m = s?.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

export type ShiftRecord = { practitioner: string; location: string; shift_date: string; available_hours: number };
export type ShiftParse = { records: ShiftRecord[]; errors: { row: number; message: string }[]; rowsUsed: number };

export function transformShifts(rows: RawRow[], m: ShiftMapping): ShiftParse {
  const get = (r: RawRow, f: ShiftField) => (m[f] ? r[m[f] as string] : null);
  const agg = new Map<string, ShiftRecord>();
  const errors: ShiftParse["errors"] = [];
  let rowsUsed = 0;
  rows.forEach((r, i) => {
    const row = i + 2;
    const practitioner = text(get(r, "practitioner"));
    if (!practitioner) { errors.push({ row, message: "Missing practitioner" }); return; }
    const location = text(get(r, "location")) ?? "";
    const date = toDay(get(r, "date")) ?? toDay(get(r, "start"));
    if (!date) { errors.push({ row, message: "Missing or invalid date" }); return; }
    let hours: number | null = null;
    const hv = text(get(r, "hours"));
    if (hv && Number.isFinite(Number(hv))) hours = Number(hv);
    else {
      const sRaw = get(r, "start"), eRaw = get(r, "end");
      const sTs = parseTimestamp(sRaw), eTs = parseTimestamp(eRaw);
      if (sTs && eTs) hours = (Date.parse(eTs) - Date.parse(sTs)) / 3_600_000;
      else {
        const sm = minutesOfDay(sRaw), em = minutesOfDay(eRaw);
        if (sm !== null && em !== null) hours = (em - sm) / 60;
      }
    }
    if (hours === null || hours < 0 || hours > 24) { errors.push({ row, message: "Could not work out hours" }); return; }
    rowsUsed++;
    const key = `${practitioner}|${location}|${date}`;
    const cur = agg.get(key);
    if (cur) cur.available_hours += hours;
    else agg.set(key, { practitioner, location, shift_date: date, available_hours: hours });
  });
  const records = [...agg.values()].map((r) => ({ ...r, available_hours: Math.round(r.available_hours * 100) / 100 }));
  return { records, errors, rowsUsed };
}
