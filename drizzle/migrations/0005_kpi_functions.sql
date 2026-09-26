
-- Finance inputs prorated by days, with list of months lacking a row
CREATE OR REPLACE FUNCTION public._finance_period(p_start date, p_end date)
RETURNS TABLE(marketing numeric, opex numeric, addbacks numeric, missing_months text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH m AS (
    SELECT gs::date AS mstart, (gs + interval '1 month')::date - 1 AS mend
    FROM generate_series(date_trunc('month', p_start), date_trunc('month', p_end), interval '1 month') gs
  ), o AS (
    SELECT m.*, (LEAST(m.mend, p_end) - GREATEST(m.mstart, p_start) + 1)::numeric
             / (m.mend - m.mstart + 1)::numeric AS frac, f.month AS fmonth,
           f.marketing_spend, f.operating_expenses, f.addbacks
    FROM m LEFT JOIN public.monthly_finance f ON f.month = m.mstart
  )
  SELECT coalesce(sum(marketing_spend * frac),0), coalesce(sum(operating_expenses * frac),0),
         coalesce(sum(addbacks * frac),0),
         string_agg(to_char(mstart,'Mon YYYY'), ', ' ORDER BY mstart) FILTER (WHERE fmonth IS NULL)
  FROM o;
$$;

-- All KPI values for one period
CREATE OR REPLACE FUNCTION public._kpi_period(p_start date, p_end date, p_location text DEFAULT NULL, p_practitioner text DEFAULT NULL)
RETURNS TABLE(kpi_code text, value numeric, note text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  tz constant text := 'America/Vancouver';
  s timestamptz := p_start::timestamp AT TIME ZONE tz;
  e timestamptz := (p_end + 1)::timestamp AT TIME ZONE tz;
  e24 timestamptz := ((p_end + 1) - interval '24 months')::timestamp AT TIME ZONE tz;
  e12 timestamptz := ((p_end + 1) - interval '12 months')::timestamp AT TIME ZONE tz;
  filtered boolean := p_location IS NOT NULL OR p_practitioner IS NOT NULL;
  fin_note text := 'Company-wide: ignores location/provider filters';
  hist_start timestamptz; has24 boolean;
  v_visits numeric; v_uniq numeric; v_rev numeric; v_coll numeric; v_rev_all numeric;
  v_noshow numeric; v_booked numeric; v_late numeric; v_all_appts numeric;
  v_units numeric; v_neuro_visits numeric;
  v_new numeric; v_new_all numeric; v_new_note text; v_new_all_note text;
  f record; v_cac numeric; v_cac_note text;
  v_ltv numeric; v_ltv_all numeric; v_ltv_note text;
  v_2nd numeric; v_2nd_base numeric; v_maturing boolean;
  v_ret_base numeric; v_ret numeric;
  v_prov_rev numeric; v_prov_hours numeric; v_booked_hours numeric; v_shift_hours numeric;
BEGIN
  SELECT min(start_at) INTO hist_start FROM appointments WHERE state='arrived' AND NOT is_internal;
  has24 := hist_start IS NOT NULL AND hist_start <= e24;

  -- Visits / patients
  SELECT count(*), count(DISTINCT patient_guid) INTO v_visits, v_uniq FROM appointments a
  WHERE a.state='arrived' AND NOT a.is_internal AND a.start_at >= s AND a.start_at < e
    AND (p_location IS NULL OR a.location = p_location) AND (p_practitioner IS NULL OR a.practitioner = p_practitioner);

  -- Revenue
  SELECT coalesce(sum(subtotal),0), coalesce(sum(collected),0) INTO v_rev, v_coll FROM sales_lines sl
  WHERE sl.invoice_date >= s AND sl.invoice_date < e
    AND (p_location IS NULL OR sl.location = p_location) AND (p_practitioner IS NULL OR sl.staff_member = p_practitioner);
  SELECT coalesce(sum(subtotal),0) INTO v_rev_all FROM sales_lines WHERE invoice_date >= s AND invoice_date < e;

  -- No-shows and late cancels
  SELECT count(*) FILTER (WHERE a.state='no_show'),
         count(*) FILTER (WHERE a.state IN ('arrived','no_show')),
         count(*) FILTER (WHERE a.cancelled_at IS NOT NULL AND a.cancelled_at >= a.start_at - interval '24 hours'),
         count(*)
  INTO v_noshow, v_booked, v_late, v_all_appts FROM appointments a
  WHERE NOT a.is_internal AND a.start_at >= s AND a.start_at < e
    AND (p_location IS NULL OR a.location = p_location) AND (p_practitioner IS NULL OR a.practitioner = p_practitioner);

  -- Neuromodulator units
  SELECT coalesce(sum(quantity),0) INTO v_units FROM sales_lines sl
  WHERE sl.income_category='Neuromodulator' AND sl.invoice_date >= s AND sl.invoice_date < e
    AND (p_location IS NULL OR sl.location = p_location) AND (p_practitioner IS NULL OR sl.staff_member = p_practitioner);
  SELECT count(*) INTO v_neuro_visits FROM appointments a
  WHERE a.state='arrived' AND NOT a.is_internal AND a.treatment_name ILIKE '%neuromodulator%' AND a.start_at >= s AND a.start_at < e
    AND (p_location IS NULL OR a.location = p_location) AND (p_practitioner IS NULL OR a.practitioner = p_practitioner);

  -- New patients (first-ever Visit in period; filters apply to that first visit)
  IF has24 THEN
    SELECT count(*) INTO v_new FROM patients p WHERE p.first_visit_at >= s AND p.first_visit_at < e
      AND (p_location IS NULL OR p.first_location = p_location) AND (p_practitioner IS NULL OR p.first_practitioner = p_practitioner);
    SELECT count(*) INTO v_new_all FROM patients p WHERE p.first_visit_at >= s AND p.first_visit_at < e;
  ELSE
    SELECT count(DISTINCT patient_guid) INTO v_new FROM appointments a
    WHERE a.state='arrived' AND NOT a.is_internal AND a.first_visit AND a.start_at >= s AND a.start_at < e
      AND (p_location IS NULL OR a.location = p_location) AND (p_practitioner IS NULL OR a.practitioner = p_practitioner);
    SELECT count(DISTINCT patient_guid) INTO v_new_all FROM appointments a
    WHERE a.state='arrived' AND NOT a.is_internal AND a.first_visit AND a.start_at >= s AND a.start_at < e;
    v_new_note := 'Using Jane first-visit flag (history < 24 months)';
  END IF;

  -- Finance
  SELECT * INTO f FROM _finance_period(p_start, p_end);
  IF f.missing_months IS NOT NULL THEN
    v_cac := NULL; v_cac_note := 'Marketing spend missing for ' || f.missing_months;
  ELSIF v_new_all = 0 THEN
    v_cac := NULL; v_cac_note := 'No new patients in period';
  ELSE
    v_cac := round(f.marketing / v_new_all, 2); v_cac_note := fin_note;
  END IF;

  -- 12-month LTV (matured cohort: first Visit 12–24 months before period end)
  IF NOT has24 THEN
    v_ltv_note := 'Needs 24 months of history';
  ELSE
    SELECT round(avg(r.rev),2) INTO v_ltv FROM (
      SELECT p.patient_guid, coalesce(sum(sl.subtotal),0) AS rev FROM patients p
      LEFT JOIN sales_lines sl ON sl.patient_guid = p.patient_guid
        AND sl.invoice_date >= p.first_visit_at AND sl.invoice_date < p.first_visit_at + interval '365 days'
      WHERE p.first_visit_at >= e24 AND p.first_visit_at < e12
        AND (p_location IS NULL OR p.first_location = p_location) AND (p_practitioner IS NULL OR p.first_practitioner = p_practitioner)
      GROUP BY p.patient_guid) r;
    SELECT round(avg(r.rev),2) INTO v_ltv_all FROM (
      SELECT p.patient_guid, coalesce(sum(sl.subtotal),0) AS rev FROM patients p
      LEFT JOIN sales_lines sl ON sl.patient_guid = p.patient_guid
        AND sl.invoice_date >= p.first_visit_at AND sl.invoice_date < p.first_visit_at + interval '365 days'
      WHERE p.first_visit_at >= e24 AND p.first_visit_at < e12
      GROUP BY p.patient_guid) r;
    IF v_ltv IS NULL THEN v_ltv_note := 'No patients in the matured cohort'; END IF;
  END IF;

  -- 2nd visit rate within 90 days
  SELECT count(*), count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM appointments a2 WHERE a2.patient_guid = p.patient_guid AND a2.state='arrived' AND NOT a2.is_internal
             AND a2.start_at > p.first_visit_at AND a2.start_at <= p.first_visit_at + interval '90 days')),
         bool_or(p.first_visit_at > now() - interval '90 days')
  INTO v_2nd_base, v_2nd, v_maturing FROM patients p
  WHERE p.first_visit_at >= s AND p.first_visit_at < e
    AND (p_location IS NULL OR p.first_location = p_location) AND (p_practitioner IS NULL OR p.first_practitioner = p_practitioner);

  -- 12-month retention
  IF has24 THEN
    WITH base AS (
      SELECT DISTINCT a.patient_guid FROM appointments a
      WHERE a.state='arrived' AND NOT a.is_internal AND a.start_at >= e24 AND a.start_at < e12
        AND (p_location IS NULL OR a.location = p_location) AND (p_practitioner IS NULL OR a.practitioner = p_practitioner)
    ), cur AS (
      SELECT DISTINCT a.patient_guid FROM appointments a
      WHERE a.state='arrived' AND NOT a.is_internal AND a.start_at >= e12 AND a.start_at < e
        AND (p_location IS NULL OR a.location = p_location) AND (p_practitioner IS NULL OR a.practitioner = p_practitioner)
    )
    SELECT count(*), count(cur.patient_guid) INTO v_ret_base, v_ret FROM base LEFT JOIN cur USING (patient_guid);
  END IF;

  -- Provider-hour KPIs (only providers with include_in_kpis)
  SELECT coalesce(sum(sl.subtotal),0) INTO v_prov_rev FROM sales_lines sl
  JOIN providers pr ON pr.name = sl.staff_member AND pr.include_in_kpis
  WHERE sl.invoice_date >= s AND sl.invoice_date < e
    AND (p_location IS NULL OR sl.location = p_location) AND (p_practitioner IS NULL OR sl.staff_member = p_practitioner);
  SELECT coalesce(sum(a.duration_min) FILTER (WHERE a.state='arrived'),0)::numeric/60,
         coalesce(sum(a.duration_min) FILTER (WHERE a.state IN ('arrived','no_show')),0)::numeric/60
  INTO v_prov_hours, v_booked_hours FROM appointments a
  JOIN providers pr ON pr.name = a.practitioner AND pr.include_in_kpis
  WHERE NOT a.is_internal AND a.start_at >= s AND a.start_at < e
    AND (p_location IS NULL OR a.location = p_location) AND (p_practitioner IS NULL OR a.practitioner = p_practitioner);
  SELECT coalesce(sum(ps.available_hours),0) INTO v_shift_hours FROM provider_shifts ps
  JOIN providers pr ON pr.name = ps.practitioner AND pr.include_in_kpis
  WHERE ps.shift_date BETWEEN p_start AND p_end
    AND (p_location IS NULL OR ps.location = p_location) AND (p_practitioner IS NULL OR ps.practitioner = p_practitioner);

  RETURN QUERY VALUES
    ('revenue', v_rev, NULL::text),
    ('collected_revenue', v_coll, NULL),
    ('adjusted_ebitda_pct',
      CASE WHEN f.missing_months IS NULL AND v_rev_all <> 0 THEN round((v_rev_all - f.opex + f.addbacks) / v_rev_all * 100, 1) END,
      CASE WHEN f.missing_months IS NOT NULL THEN 'Finance inputs missing for ' || f.missing_months
           WHEN v_rev_all = 0 THEN 'No revenue in period' ELSE fin_note END),
    ('new_patients', v_new, v_new_note),
    ('cac', v_cac, v_cac_note),
    ('ltv_12m', v_ltv, v_ltv_note),
    ('ltv_cac', CASE WHEN v_ltv_all IS NOT NULL AND v_cac > 0 THEN round(v_ltv_all / v_cac, 2) END,
      CASE WHEN NOT has24 THEN 'Needs 24 months of history' WHEN v_cac IS NULL THEN v_cac_note
           WHEN v_ltv_all IS NULL THEN 'No patients in the matured cohort' ELSE fin_note END),
    ('second_visit_rate_90d', CASE WHEN v_2nd_base > 0 THEN round(v_2nd / v_2nd_base * 100, 1) END,
      CASE WHEN v_2nd_base = 0 THEN 'No new patients in period'
           WHEN v_maturing THEN 'Maturing: cohort < 90 days old' END),
    ('retention_12m', CASE WHEN v_ret_base > 0 THEN round(v_ret / v_ret_base * 100, 1) END,
      CASE WHEN NOT has24 THEN 'Needs 24 months of history' WHEN v_ret_base = 0 THEN 'No patients in prior year' END),
    ('revenue_per_provider_hour', CASE WHEN v_prov_hours > 0 THEN round(v_prov_rev / v_prov_hours, 2) END,
      CASE WHEN v_prov_hours = 0 THEN 'No provider visit hours in period' END),
    ('provider_utilization_pct', CASE WHEN v_shift_hours > 0 THEN round(v_booked_hours / v_shift_hours * 100, 1) END,
      CASE WHEN v_shift_hours = 0 THEN 'No shift hours entered' END),
    ('visits', v_visits, NULL),
    ('unique_patients', v_uniq, NULL),
    ('avg_revenue_per_visit', CASE WHEN v_visits > 0 THEN round(v_rev / v_visits, 2) END,
      CASE WHEN v_visits = 0 THEN 'No visits in period' END),
    ('no_show_rate', CASE WHEN v_booked > 0 THEN round(v_noshow / v_booked * 100, 1) END,
      CASE WHEN v_booked = 0 THEN 'No appointments in period' ELSE 'No-shows / (arrived + no-shows)' END),
    ('late_cancel_rate', CASE WHEN v_all_appts > 0 THEN round(v_late / v_all_appts * 100, 1) END,
      CASE WHEN v_all_appts = 0 THEN 'No appointments in period' END),
    ('neuromodulator_units_per_visit', CASE WHEN v_neuro_visits > 0 THEN round(v_units / v_neuro_visits, 1) END,
      CASE WHEN v_neuro_visits = 0 THEN 'No neuromodulator visits in period' END);
END $$;

CREATE OR REPLACE FUNCTION public.get_kpis(p_start date, p_end date, p_location text DEFAULT NULL, p_practitioner text DEFAULT NULL)
RETURNS TABLE(kpi_code text, value numeric, prev_value numeric, yoy_value numeric, change_pct numeric,
              yoy_change_pct numeric, target numeric, status text, note text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH len AS (SELECT (p_end - p_start + 1) AS d),
  c AS (SELECT * FROM _kpi_period(p_start, p_end, p_location, p_practitioner)),
  p AS (SELECT k.* FROM len, LATERAL _kpi_period(p_start - len.d, p_start - 1, p_location, p_practitioner) k),
  y AS (SELECT * FROM _kpi_period((p_start - interval '1 year')::date, (p_end - interval '1 year')::date, p_location, p_practitioner))
  SELECT c.kpi_code, c.value, p.value, y.value,
    CASE WHEN p.value IS NOT NULL AND p.value <> 0 AND c.value IS NOT NULL THEN round((c.value - p.value) / abs(p.value) * 100, 1) END,
    CASE WHEN y.value IS NOT NULL AND y.value <> 0 AND c.value IS NOT NULL THEN round((c.value - y.value) / abs(y.value) * 100, 1) END,
    t.target,
    CASE WHEN t.target IS NULL OR c.value IS NULL THEN 'n/a'
         WHEN coalesce(t.direction,'higher_better') = 'lower_better' THEN
           CASE WHEN c.value <= t.target THEN 'good' WHEN c.value <= t.target + abs(t.target) * 0.05 THEN 'watch' ELSE 'bad' END
         ELSE
           CASE WHEN c.value >= t.target THEN 'good' WHEN c.value >= t.target - abs(t.target) * 0.05 THEN 'watch' ELSE 'bad' END
    END,
    c.note
  FROM c
  LEFT JOIN p ON p.kpi_code = c.kpi_code
  LEFT JOIN y ON y.kpi_code = c.kpi_code
  LEFT JOIN kpi_targets t ON t.kpi_code = c.kpi_code;
$$;

CREATE OR REPLACE FUNCTION public.get_kpi_trend(p_kpi text, p_months int DEFAULT 12, p_location text DEFAULT NULL, p_practitioner text DEFAULT NULL)
RETURNS TABLE(month date, value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH m AS (
    SELECT gs::date AS mstart FROM generate_series(
      date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date) - make_interval(months => p_months - 1),
      date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')::date), interval '1 month') gs
  )
  SELECT m.mstart, k.value FROM m
  CROSS JOIN LATERAL _kpi_period(m.mstart, ((m.mstart + interval '1 month')::date - 1), p_location, p_practitioner) k
  WHERE k.kpi_code = p_kpi
  ORDER BY m.mstart;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_breakdown(p_start date, p_end date, p_location text DEFAULT NULL,
  p_practitioner text DEFAULT NULL, p_group text DEFAULT 'location')
RETURNS TABLE("group" text, revenue numeric, quantity numeric, lines bigint, pct_of_total numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH b AS (
    SELECT (p_start::timestamp AT TIME ZONE 'America/Vancouver') s, ((p_end + 1)::timestamp AT TIME ZONE 'America/Vancouver') e
  ), l AS (
    SELECT coalesce(CASE p_group
        WHEN 'location' THEN sl.location
        WHEN 'reporting_group' THEN coalesce(cm.reporting_group, 'Other')
        WHEN 'income_category' THEN sl.income_category
        WHEN 'staff_member' THEN sl.staff_member
        WHEN 'item' THEN sl.item END, '(none)') AS g,
      sl.subtotal, sl.quantity
    FROM sales_lines sl CROSS JOIN b
    LEFT JOIN category_map cm ON cm.income_category = sl.income_category
    WHERE sl.invoice_date >= b.s AND sl.invoice_date < b.e
      AND (p_location IS NULL OR sl.location = p_location) AND (p_practitioner IS NULL OR sl.staff_member = p_practitioner)
  ), agg AS (
    SELECT g, sum(subtotal) rev, sum(quantity) qty, count(*) n FROM l GROUP BY g
  )
  SELECT g, rev, qty, n,
    CASE WHEN sum(rev) OVER () <> 0 THEN round(rev / sum(rev) OVER () * 100, 1) END
  FROM agg ORDER BY rev DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_provider_table(p_start date, p_end date, p_location text DEFAULT NULL)
RETURNS TABLE(practitioner text, revenue numeric, visits bigint, visit_hours numeric, available_hours numeric,
  revenue_per_hour numeric, utilization_pct numeric, new_patients bigint, no_show_rate numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH b AS (
    SELECT (p_start::timestamp AT TIME ZONE 'America/Vancouver') s, ((p_end + 1)::timestamp AT TIME ZONE 'America/Vancouver') e
  ), a AS (
    SELECT ap.practitioner AS name,
      count(*) FILTER (WHERE ap.state='arrived') visits,
      coalesce(sum(ap.duration_min) FILTER (WHERE ap.state='arrived'),0)::numeric/60 vh,
      coalesce(sum(ap.duration_min) FILTER (WHERE ap.state IN ('arrived','no_show')),0)::numeric/60 bh,
      count(*) FILTER (WHERE ap.state='no_show') ns,
      count(*) FILTER (WHERE ap.state IN ('arrived','no_show')) bk
    FROM appointments ap, b
    WHERE NOT ap.is_internal AND ap.start_at >= b.s AND ap.start_at < b.e AND (p_location IS NULL OR ap.location = p_location)
    GROUP BY ap.practitioner
  ), r AS (
    SELECT sl.staff_member AS name, sum(sl.subtotal) rev FROM sales_lines sl, b
    WHERE sl.invoice_date >= b.s AND sl.invoice_date < b.e AND (p_location IS NULL OR sl.location = p_location)
    GROUP BY sl.staff_member
  ), h AS (
    SELECT ps.practitioner AS name, sum(ps.available_hours) hrs FROM provider_shifts ps
    WHERE ps.shift_date BETWEEN p_start AND p_end AND (p_location IS NULL OR ps.location = p_location)
    GROUP BY ps.practitioner
  ), n AS (
    SELECT pt.first_practitioner AS name, count(*) np FROM patients pt, b
    WHERE pt.first_visit_at >= b.s AND pt.first_visit_at < b.e AND (p_location IS NULL OR pt.first_location = p_location)
    GROUP BY pt.first_practitioner
  )
  SELECT pr.name, coalesce(r.rev,0), coalesce(a.visits,0), round(coalesce(a.vh,0),2), round(coalesce(h.hrs,0),2),
    CASE WHEN a.vh > 0 THEN round(coalesce(r.rev,0) / a.vh, 2) END,
    CASE WHEN h.hrs > 0 THEN round(coalesce(a.bh,0) / h.hrs * 100, 1) END,
    coalesce(n.np,0),
    CASE WHEN a.bk > 0 THEN round(a.ns::numeric / a.bk * 100, 1) END
  FROM providers pr
  LEFT JOIN a ON a.name = pr.name LEFT JOIN r ON r.name = pr.name
  LEFT JOIN h ON h.name = pr.name LEFT JOIN n ON n.name = pr.name
  WHERE pr.active OR a.name IS NOT NULL OR r.name IS NOT NULL
  ORDER BY coalesce(r.rev,0) DESC, pr.name;
$$;

CREATE OR REPLACE FUNCTION public.get_cohorts(p_months int DEFAULT 12)
RETURNS TABLE(cohort_month date, cohort_size bigint,
  returned_1m numeric, returned_2m numeric, returned_3m numeric, returned_6m numeric, returned_9m numeric, returned_12m numeric,
  revenue_per_patient_3m numeric, revenue_per_patient_6m numeric, revenue_per_patient_12m numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH c AS (
    SELECT p.patient_guid, p.first_visit_at f,
      date_trunc('month', p.first_visit_at AT TIME ZONE 'America/Vancouver')::date AS cm,
      (SELECT min(a.start_at) FROM appointments a WHERE a.patient_guid = p.patient_guid AND a.state='arrived'
         AND NOT a.is_internal AND a.start_at > p.first_visit_at) AS second_at,
      (SELECT coalesce(sum(subtotal),0) FROM sales_lines sl WHERE sl.patient_guid = p.patient_guid
         AND sl.invoice_date >= p.first_visit_at AND sl.invoice_date < p.first_visit_at + interval '3 months') r3,
      (SELECT coalesce(sum(subtotal),0) FROM sales_lines sl WHERE sl.patient_guid = p.patient_guid
         AND sl.invoice_date >= p.first_visit_at AND sl.invoice_date < p.first_visit_at + interval '6 months') r6,
      (SELECT coalesce(sum(subtotal),0) FROM sales_lines sl WHERE sl.patient_guid = p.patient_guid
         AND sl.invoice_date >= p.first_visit_at AND sl.invoice_date < p.first_visit_at + interval '12 months') r12
    FROM patients p
    WHERE p.first_visit_at >= (date_trunc('month', (now() AT TIME ZONE 'America/Vancouver')) - make_interval(months => p_months - 1))
                               AT TIME ZONE 'America/Vancouver'
  )
  SELECT cm, count(*),
    -- a cell is null until every patient in the cohort has had the full window
    CASE WHEN max(f) + interval '1 month'  <= now() THEN round(100.0 * count(*) FILTER (WHERE second_at <= f + interval '1 month')  / count(*), 1) END,
    CASE WHEN max(f) + interval '2 months' <= now() THEN round(100.0 * count(*) FILTER (WHERE second_at <= f + interval '2 months') / count(*), 1) END,
    CASE WHEN max(f) + interval '3 months' <= now() THEN round(100.0 * count(*) FILTER (WHERE second_at <= f + interval '3 months') / count(*), 1) END,
    CASE WHEN max(f) + interval '6 months' <= now() THEN round(100.0 * count(*) FILTER (WHERE second_at <= f + interval '6 months') / count(*), 1) END,
    CASE WHEN max(f) + interval '9 months' <= now() THEN round(100.0 * count(*) FILTER (WHERE second_at <= f + interval '9 months') / count(*), 1) END,
    CASE WHEN max(f) + interval '12 months' <= now() THEN round(100.0 * count(*) FILTER (WHERE second_at <= f + interval '12 months') / count(*), 1) END,
    CASE WHEN max(f) + interval '3 months'  <= now() THEN round(avg(r3), 2) END,
    CASE WHEN max(f) + interval '6 months'  <= now() THEN round(avg(r6), 2) END,
    CASE WHEN max(f) + interval '12 months' <= now() THEN round(avg(r12), 2) END
  FROM c GROUP BY cm ORDER BY cm;
$$;

REVOKE EXECUTE ON FUNCTION public._finance_period(date,date), public._kpi_period(date,date,text,text),
  public.get_kpis(date,date,text,text), public.get_kpi_trend(text,int,text,text),
  public.get_revenue_breakdown(date,date,text,text,text), public.get_provider_table(date,date,text),
  public.get_cohorts(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._finance_period(date,date), public._kpi_period(date,date,text,text),
  public.get_kpis(date,date,text,text), public.get_kpi_trend(text,int,text,text),
  public.get_revenue_breakdown(date,date,text,text,text), public.get_provider_table(date,date,text),
  public.get_cohorts(int) TO authenticated, service_role;
