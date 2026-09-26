
CREATE OR REPLACE FUNCTION public.get_top_items(p_start date, p_end date, p_location text DEFAULT NULL, p_practitioner text DEFAULT NULL, p_limit int DEFAULT 15)
RETURNS TABLE(item text, income_category text, quantity numeric, revenue numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(sl.item,'(none)'), min(sl.income_category), sum(sl.quantity), sum(sl.subtotal)
  FROM sales_lines sl
  WHERE sl.invoice_date >= (p_start::timestamp AT TIME ZONE 'America/Vancouver')
    AND sl.invoice_date < ((p_end + 1)::timestamp AT TIME ZONE 'America/Vancouver')
    AND (p_location IS NULL OR sl.location = p_location) AND (p_practitioner IS NULL OR sl.staff_member = p_practitioner)
  GROUP BY coalesce(sl.item,'(none)')
  ORDER BY sum(sl.subtotal) DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_second_visit_trend(p_months int DEFAULT 12, p_location text DEFAULT NULL, p_practitioner text DEFAULT NULL)
RETURNS TABLE(month date, value numeric, cohort_size bigint, maturing boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH m AS (
    SELECT gs::date AS mstart FROM generate_series(
      date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date) - make_interval(months => p_months - 1),
      date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date), interval '1 month') gs
  )
  SELECT m.mstart,
    CASE WHEN count(p.patient_guid) > 0 THEN round(100.0 * count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM appointments a WHERE a.patient_guid = p.patient_guid AND a.state='arrived' AND NOT a.is_internal
        AND a.start_at > p.first_visit_at AND a.start_at <= p.first_visit_at + interval '90 days')) / count(p.patient_guid), 1) END,
    count(p.patient_guid),
    coalesce(bool_or(p.first_visit_at > now() - interval '90 days'),
             ((m.mstart + interval '1 month') > now() - interval '90 days'))
  FROM m LEFT JOIN patients p
    ON p.first_visit_at >= (m.mstart::timestamp AT TIME ZONE 'America/Vancouver')
   AND p.first_visit_at < ((m.mstart + interval '1 month')::timestamp AT TIME ZONE 'America/Vancouver')
   AND (p_location IS NULL OR p.first_location = p_location) AND (p_practitioner IS NULL OR p.first_practitioner = p_practitioner)
  GROUP BY m.mstart ORDER BY m.mstart;
$$;

CREATE OR REPLACE FUNCTION public.get_new_patients_by_location(p_months int DEFAULT 12, p_practitioner text DEFAULT NULL)
RETURNS TABLE(month date, location text, new_patients bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH m AS (
    SELECT gs::date AS mstart FROM generate_series(
      date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date) - make_interval(months => p_months - 1),
      date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date), interval '1 month') gs
  ), l AS (SELECT DISTINCT first_location AS location FROM patients WHERE first_location IS NOT NULL)
  SELECT m.mstart, l.location, count(p.patient_guid)
  FROM m CROSS JOIN l LEFT JOIN patients p
    ON p.first_location = l.location
   AND p.first_visit_at >= (m.mstart::timestamp AT TIME ZONE 'America/Vancouver')
   AND p.first_visit_at < ((m.mstart + interval '1 month')::timestamp AT TIME ZONE 'America/Vancouver')
   AND (p_practitioner IS NULL OR p.first_practitioner = p_practitioner)
  GROUP BY m.mstart, l.location ORDER BY m.mstart, l.location;
$$;

CREATE OR REPLACE FUNCTION public.get_followup_list(p_location text DEFAULT NULL, p_practitioner text DEFAULT NULL)
RETURNS TABLE(patient_guid text, patient_name text, patient_number text, first_visit_at timestamptz, location text,
  practitioner text, first_treatment text, amount_spent numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT p.patient_guid, p.patient_name, p.patient_number, p.first_visit_at, p.first_location, p.first_practitioner,
         p.first_treatment, p.lifetime_revenue
  FROM patients p
  WHERE p.first_visit_at <= now() - interval '14 days' AND p.first_visit_at >= now() - interval '90 days'
    AND p.visit_count = 1
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_guid = p.patient_guid AND a.state='booked'
                    AND NOT a.is_internal AND a.start_at > now())
    AND (p_location IS NULL OR p.first_location = p_location) AND (p_practitioner IS NULL OR p.first_practitioner = p_practitioner)
  ORDER BY p.first_visit_at;
$$;

CREATE OR REPLACE FUNCTION public.get_lapsed_regulars(p_location text DEFAULT NULL, p_practitioner text DEFAULT NULL)
RETURNS TABLE(patient_guid text, patient_name text, patient_number text, last_visit_at timestamptz, visit_count int,
  lifetime_revenue numeric, usual_practitioner text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH usual AS (
    SELECT DISTINCT ON (a.patient_guid) a.patient_guid, a.practitioner, a.location
    FROM appointments a WHERE a.state='arrived' AND NOT a.is_internal AND a.patient_guid IS NOT NULL
    GROUP BY a.patient_guid, a.practitioner, a.location
    ORDER BY a.patient_guid, count(*) DESC, max(a.start_at) DESC
  )
  SELECT p.patient_guid, p.patient_name, p.patient_number, p.last_visit_at, p.visit_count, p.lifetime_revenue, u.practitioner
  FROM patients p LEFT JOIN usual u USING (patient_guid)
  WHERE p.visit_count >= 3 AND p.last_visit_at <= now() - interval '120 days'
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_guid = p.patient_guid AND a.state='booked'
                    AND NOT a.is_internal AND a.start_at > now())
    AND (p_location IS NULL OR u.location = p_location) AND (p_practitioner IS NULL OR u.practitioner = p_practitioner)
  ORDER BY p.lifetime_revenue DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_items(date,date,text,text,int), public.get_second_visit_trend(int,text,text),
  public.get_new_patients_by_location(int,text), public.get_followup_list(text,text), public.get_lapsed_regulars(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_top_items(date,date,text,text,int), public.get_second_visit_trend(int,text,text),
  public.get_new_patients_by_location(int,text), public.get_followup_list(text,text), public.get_lapsed_regulars(text,text) TO authenticated, service_role;
