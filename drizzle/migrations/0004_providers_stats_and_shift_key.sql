UPDATE public.provider_shifts SET location = '' WHERE location IS NULL;
ALTER TABLE public.provider_shifts ALTER COLUMN location SET DEFAULT '';
ALTER TABLE public.provider_shifts ALTER COLUMN location SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS provider_shifts_unique_day ON public.provider_shifts (practitioner, location, shift_date);

CREATE OR REPLACE FUNCTION public.provider_period_stats(_start date, _end date)
RETURNS TABLE(name text, visit_hours numeric, revenue numeric, available_hours numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH b AS (
    SELECT (_start::timestamp AT TIME ZONE 'America/Vancouver') AS s,
           ((_end + 1)::timestamp AT TIME ZONE 'America/Vancouver') AS e
  ),
  v AS (
    SELECT a.practitioner AS name, sum(a.duration_min)::numeric / 60 AS visit_hours
    FROM public.appointments a, b
    WHERE a.state = 'arrived' AND NOT a.is_internal AND a.start_at >= b.s AND a.start_at < b.e
    GROUP BY a.practitioner
  ),
  r AS (
    SELECT sl.staff_member AS name, sum(sl.subtotal) AS revenue
    FROM public.sales_lines sl, b
    WHERE sl.invoice_date >= b.s AND sl.invoice_date < b.e
    GROUP BY sl.staff_member
  ),
  h AS (
    SELECT practitioner AS name, sum(available_hours) AS available_hours
    FROM public.provider_shifts WHERE shift_date BETWEEN _start AND _end
    GROUP BY practitioner
  )
  SELECT p.name, round(coalesce(v.visit_hours,0),2), coalesce(r.revenue,0), round(coalesce(h.available_hours,0),2)
  FROM public.providers p
  LEFT JOIN v ON v.name = p.name
  LEFT JOIN r ON r.name = p.name
  LEFT JOIN h ON h.name = p.name
  ORDER BY p.name;
$$;
GRANT EXECUTE ON FUNCTION public.provider_period_stats(date, date) TO authenticated;