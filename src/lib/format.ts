export const cad0 = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
export const cad2 = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });
export const vanDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" }) : "—";
export const monthLabel = (m: string, long = false) =>
  new Date(m.slice(0, 10) + "T12:00:00").toLocaleDateString("en-CA", long ? { month: "long", year: "numeric" } : { month: "short", year: "2-digit" });
export const shortLoc = (l: string | null | undefined) => (l ?? "—").replace("Derma Spa ", "");

/** Only include RPC filter args that are set (exactOptionalPropertyTypes-safe). */
export const filterArgs = (location: string | null, practitioner: string | null) => ({
  ...(location ? { p_location: location } : {}),
  ...(practitioner ? { p_practitioner: practitioner } : {}),
});

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
