
CREATE OR REPLACE FUNCTION public.get_data_coverage(p_months int DEFAULT 24)
RETURNS TABLE(month date, appointments bigint, sales bigint, shifts bigint, finance_row boolean, finance_complete boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH m AS (
    SELECT gs::date AS mstart FROM generate_series(
      date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date) - make_interval(months => p_months - 1),
      date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date), interval '1 month') gs
  )
  SELECT m.mstart,
    (SELECT count(*) FROM appointments a WHERE a.start_at >= (m.mstart::timestamp AT TIME ZONE 'America/Vancouver')
       AND a.start_at < ((m.mstart + interval '1 month')::timestamp AT TIME ZONE 'America/Vancouver')),
    (SELECT count(*) FROM sales_lines s WHERE s.invoice_date >= (m.mstart::timestamp AT TIME ZONE 'America/Vancouver')
       AND s.invoice_date < ((m.mstart + interval '1 month')::timestamp AT TIME ZONE 'America/Vancouver')),
    (SELECT count(*) FROM provider_shifts ps WHERE ps.shift_date >= m.mstart AND ps.shift_date < (m.mstart + interval '1 month')::date),
    EXISTS (SELECT 1 FROM monthly_finance f WHERE f.month = m.mstart),
    EXISTS (SELECT 1 FROM monthly_finance f WHERE f.month = m.mstart AND f.marketing_spend > 0 AND f.operating_expenses > 0)
  FROM m ORDER BY m.mstart DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_data_health_details()
RETURNS TABLE(check_code text, label text, detail text, value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  -- Sales staff with no appointments
  SELECT 'staff_no_appts', s.staff_member, count(*)::text || ' sales lines', sum(s.subtotal)
  FROM sales_lines s
  WHERE s.staff_member IS NOT NULL AND s.staff_member <> 'Unassigned'
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.practitioner = s.staff_member)
  GROUP BY s.staff_member
  UNION ALL
  -- Income categories mapped to Other (or unmapped)
  SELECT 'category_other', s.income_category, count(*)::text || ' sales lines', sum(s.subtotal)
  FROM sales_lines s LEFT JOIN category_map c ON c.income_category = s.income_category
  WHERE s.income_category IS NOT NULL AND coalesce(c.reporting_group, 'Other') = 'Other'
  GROUP BY s.income_category
  UNION ALL
  -- Treatments that look internal but aren't flagged
  SELECT 'maybe_internal', t.treatment_name, t.n::text || ' appointments', t.n::numeric
  FROM (
    SELECT a.treatment_name, count(*) AS n
    FROM appointments a
    WHERE NOT a.is_internal AND a.treatment_name IS NOT NULL AND a.state = 'arrived'
    GROUP BY a.treatment_name
    HAVING NOT EXISTS (
      SELECT 1 FROM appointments a2 JOIN sales_lines s ON s.patient_guid = a2.patient_guid
      WHERE a2.treatment_name = a.treatment_name AND s.subtotal <> 0)
  ) t
  UNION ALL
  -- Patients in sales with no Visits
  SELECT 'product_only', coalesce(max(s.patient_name), s.patient_guid), s.patient_guid, sum(s.subtotal)
  FROM sales_lines s
  WHERE s.patient_guid IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_guid = s.patient_guid AND a.state='arrived' AND NOT a.is_internal)
  GROUP BY s.patient_guid
  UNION ALL
  -- Months missing marketing spend or expenses (last 24 full + current)
  SELECT 'finance_missing', to_char(m.mstart, 'Mon YYYY'),
    CASE WHEN f.month IS NULL THEN 'No entry' ELSE concat_ws(', ',
      CASE WHEN f.marketing_spend = 0 THEN 'Marketing spend missing' END,
      CASE WHEN f.operating_expenses = 0 THEN 'Operating expenses missing' END) END,
    NULL::numeric
  FROM generate_series(date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date) - interval '23 months',
                       date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date), interval '1 month') AS m(mstart)
  LEFT JOIN monthly_finance f ON f.month = m.mstart::date
  WHERE f.month IS NULL OR f.marketing_spend = 0 OR f.operating_expenses = 0
  UNION ALL
  -- Providers with visits but no shift hours (by month)
  SELECT 'visits_no_shifts', v.practitioner, to_char(v.mon, 'Mon YYYY') || ' · ' || v.n || ' visits', v.n::numeric
  FROM (
    SELECT a.practitioner, date_trunc('month', a.start_at AT TIME ZONE 'America/Vancouver')::date AS mon, count(*) AS n
    FROM appointments a
    WHERE a.state='arrived' AND NOT a.is_internal AND a.practitioner IS NOT NULL
    GROUP BY 1, 2
  ) v
  WHERE NOT EXISTS (SELECT 1 FROM provider_shifts ps WHERE ps.practitioner = v.practitioner
                    AND ps.shift_date >= v.mon AND ps.shift_date < (v.mon + interval '1 month')::date AND ps.available_hours > 0);
$$;

CREATE OR REPLACE FUNCTION public.get_reconciliation(p_start date, p_end date)
RETURNS TABLE(revenue numeric, gst numeric, pst numeric, collected numeric, arrived_visits bigint, first_visits bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT s.revenue, s.gst, s.pst, s.collected, a.arrived, a.firsts
  FROM (SELECT coalesce(sum(subtotal),0) revenue, coalesce(sum(gst),0) gst, coalesce(sum(pst),0) pst, coalesce(sum(collected),0) collected
        FROM sales_lines WHERE invoice_date >= (p_start::timestamp AT TIME ZONE 'America/Vancouver')
          AND invoice_date < ((p_end + 1)::timestamp AT TIME ZONE 'America/Vancouver')) s,
       (SELECT count(*) FILTER (WHERE state='arrived' AND NOT is_internal) arrived,
               count(*) FILTER (WHERE state='arrived' AND NOT is_internal AND first_visit) firsts
        FROM appointments WHERE start_at >= (p_start::timestamp AT TIME ZONE 'America/Vancouver')
          AND start_at < ((p_end + 1)::timestamp AT TIME ZONE 'America/Vancouver')) a;
$$;

REVOKE EXECUTE ON FUNCTION public.get_data_coverage(int), public.get_data_health_details(), public.get_reconciliation(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_data_coverage(int), public.get_data_health_details(), public.get_reconciliation(date,date) TO authenticated, service_role;
