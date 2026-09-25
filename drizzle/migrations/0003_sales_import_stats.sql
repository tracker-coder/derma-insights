CREATE OR REPLACE FUNCTION public.sales_import_stats(_start timestamptz, _end timestamptz)
RETURNS TABLE(location text, revenue numeric, total numeric, collected numeric, balance numeric, refund_lines bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE WHEN GROUPING(s.location) = 1 THEN '__total__' ELSE coalesce(s.location, '(none)') END,
    coalesce(sum(s.subtotal),0), coalesce(sum(s.total),0), coalesce(sum(s.collected),0), coalesce(sum(s.balance),0),
    count(*) FILTER (WHERE s.is_refund)
  FROM public.sales_lines s
  WHERE s.invoice_date >= _start AND s.invoice_date <= _end
  GROUP BY ROLLUP (s.location)
  ORDER BY GROUPING(s.location), 1;
$$;
GRANT EXECUTE ON FUNCTION public.sales_import_stats(timestamptz, timestamptz) TO authenticated;