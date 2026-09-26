import { useSearch } from "@tanstack/react-router";

export type GlobalSearch = {
  preset?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  loc?: string | undefined;
  prov?: string | undefined;
  cmp?: string | undefined;
};

export const LOCATIONS = ["Derma Spa Oak Bay", "Derma Spa Uptown", "Derma Spa Nanaimo"] as const;

export const PRESETS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "mtd", label: "Month to date" },
  { value: "qtd", label: "Quarter to date" },
  { value: "ytd", label: "Year to date" },
  { value: "last_12m", label: "Last 12 months" },
  { value: "custom", label: "Custom" },
] as const;

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

export function validateGlobalSearch(s: Record<string, unknown>): GlobalSearch {
  return {
    preset: str(s.preset),
    from: isDate(s.from) ? s.from : undefined,
    to: isDate(s.to) ? s.to : undefined,
    loc: str(s.loc),
    prov: str(s.prov),
    cmp: s.cmp === "yoy" ? "yoy" : undefined,
  };
}

export const todayVancouver = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function resolveRange(s: GlobalSearch): { start: string; end: string; preset: string } {
  const today = todayVancouver();
  const [y = 2000, mo = 1, d = 1] = today.split("-").map(Number);
  const m = mo - 1;
  const preset = PRESETS.some((p) => p.value === s.preset) ? s.preset! : "mtd";
  switch (preset) {
    case "this_month":
      return { preset, start: iso(y, m, 1), end: iso(y, m + 1, 0) };
    case "last_month":
      return { preset, start: iso(y, m - 1, 1), end: iso(y, m, 0) };
    case "qtd":
      return { preset, start: iso(y, Math.floor(m / 3) * 3, 1), end: today };
    case "ytd":
      return { preset, start: iso(y, 0, 1), end: today };
    case "last_12m":
      return { preset, start: iso(y - 1, m, d + 1), end: today };
    case "custom": {
      const start = s.from ?? iso(y, m, 1);
      const end = s.to ?? today;
      return start <= end ? { preset, start, end } : { preset, start: end, end: start };
    }
    default:
      return { preset: "mtd", start: iso(y, m, 1), end: today };
  }
}

export function useGlobalFilters() {
  const search = useSearch({ from: "/_authenticated" }) as GlobalSearch;
  const range = resolveRange(search);
  return {
    ...range,
    location: search.loc ?? null,
    practitioner: search.prov ?? null,
    compare: (search.cmp === "yoy" ? "yoy" : "prev") as "prev" | "yoy",
    search,
  };
}
