import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LOCATIONS, PRESETS, useGlobalFilters, type GlobalSearch } from "@/lib/filters";

const ALL = "__all__";

export function GlobalFilterBar() {
  const navigate = useNavigate();
  const f = useGlobalFilters();

  const providers = useQuery({
    queryKey: ["providers", "filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("providers").select("name, display_name, active").order("name");
      if (error) throw error;
      return data;
    },
  });

  const set = (patch: Partial<GlobalSearch>) =>
    navigate({ to: ".", search: ((prev: GlobalSearch) => ({ ...prev, ...patch })) as never, replace: true });

  const trigger = "h-9 w-auto min-w-[8.5rem] rounded-xl bg-card text-xs";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={f.preset}
        onValueChange={(v) =>
          set(v === "custom" ? { preset: v, from: f.start, to: f.end } : { preset: v, from: undefined, to: undefined })
        }
      >
        <SelectTrigger className={trigger} aria-label="Date range"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {f.preset === "custom" ? (
        <div className="flex items-center gap-1">
          <Input type="date" className="h-9 w-[9.5rem] rounded-xl bg-card text-xs" value={f.start}
            onChange={(e) => e.target.value && set({ from: e.target.value })} aria-label="From" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" className="h-9 w-[9.5rem] rounded-xl bg-card text-xs" value={f.end}
            onChange={(e) => e.target.value && set({ to: e.target.value })} aria-label="To" />
        </div>
      ) : null}

      <Select value={f.location ?? ALL} onValueChange={(v) => set({ loc: v === ALL ? undefined : v })}>
        <SelectTrigger className={trigger} aria-label="Location"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All locations</SelectItem>
          {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l.replace("Derma Spa ", "")}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={f.practitioner ?? ALL} onValueChange={(v) => set({ prov: v === ALL ? undefined : v })}>
        <SelectTrigger className={trigger} aria-label="Provider"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All providers</SelectItem>
          {(providers.data ?? []).map((p) => (
            <SelectItem key={p.name} value={p.name}>{p.display_name || p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={f.compare} onValueChange={(v) => set({ cmp: v === "yoy" ? "yoy" : undefined })}>
        <SelectTrigger className={trigger} aria-label="Compare to"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="prev">vs previous period</SelectItem>
          <SelectItem value="yoy">vs same period last year</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
