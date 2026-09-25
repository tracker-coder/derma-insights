CREATE OR REPLACE FUNCTION public.has_profile(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id);
$$;

CREATE TABLE public.import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL CHECK (report_type IN ('appointments','sales','shifts')),
  file_name text,
  period_start date,
  period_end date,
  rows_read int NOT NULL DEFAULT 0,
  inserted int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by uuid DEFAULT auth.uid(),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.appointments (
  jane_id bigint PRIMARY KEY,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  duration_min int GENERATED ALWAYS AS ((EXTRACT(EPOCH FROM (end_at - start_at)) / 60)::int) STORED,
  patient_guid text,
  patient_number text,
  patient_name text,
  treatment_name text,
  practitioner text,
  state text CHECK (state IN ('arrived','booked','cancelled','rescheduled','no_show','archived')),
  first_visit boolean,
  chart_status text,
  booked_at timestamptz,
  arrived_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  booked_online boolean,
  is_internal boolean NOT NULL DEFAULT false,
  import_id uuid REFERENCES public.import_log(id) ON DELETE SET NULL
);

CREATE TABLE public.sales_lines (
  invoice_line_no text PRIMARY KEY,
  is_refund boolean NOT NULL DEFAULT false,
  location text,
  purchase_date timestamptz,
  invoice_date timestamptz,
  patient_guid text,
  patient_name text,
  item text,
  staff_member text,
  payer text,
  income_category text,
  quantity numeric,
  status text CHECK (status IN ('paid','no_charge','refunded','unpaid','partially_paid')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  gst numeric(12,2) NOT NULL DEFAULT 0,
  pst numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  collected numeric(12,2) NOT NULL DEFAULT 0,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  import_id uuid REFERENCES public.import_log(id) ON DELETE SET NULL
);

CREATE TABLE public.patients (
  patient_guid text PRIMARY KEY,
  patient_name text,
  patient_number text,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  visit_count int NOT NULL DEFAULT 0,
  next_booked_at timestamptz,
  first_location text,
  first_practitioner text,
  first_treatment text,
  lifetime_revenue numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE public.providers (
  name text PRIMARY KEY,
  display_name text,
  role text,
  active boolean NOT NULL DEFAULT true,
  include_in_kpis boolean NOT NULL DEFAULT true
);

CREATE TABLE public.provider_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner text NOT NULL,
  location text,
  shift_date date NOT NULL,
  available_hours numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('import','manual')),
  import_id uuid REFERENCES public.import_log(id) ON DELETE SET NULL
);

CREATE TABLE public.monthly_finance (
  month date PRIMARY KEY CHECK (EXTRACT(DAY FROM month) = 1),
  marketing_spend numeric(12,2) NOT NULL DEFAULT 0,
  operating_expenses numeric(12,2) NOT NULL DEFAULT 0,
  addbacks numeric(12,2) NOT NULL DEFAULT 0,
  notes text
);

CREATE TABLE public.internal_treatments (treatment_name text PRIMARY KEY);

CREATE TABLE public.category_map (
  income_category text PRIMARY KEY,
  reporting_group text NOT NULL
);

CREATE TABLE public.kpi_targets (
  kpi_code text PRIMARY KEY,
  target numeric,
  direction text NOT NULL DEFAULT 'higher_better' CHECK (direction IN ('higher_better','lower_better'))
);

-- Grants, RLS, policies
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_log','appointments','sales_lines','patients','providers','provider_shifts','monthly_finance','internal_treatments','category_map','kpi_targets']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Profiles can read" ON public.%I FOR SELECT TO authenticated USING (public.has_profile(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Admins can insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins can update" ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins can delete" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

-- Indexes
CREATE INDEX appointments_start_at_idx ON public.appointments (start_at);
CREATE INDEX appointments_patient_guid_idx ON public.appointments (patient_guid);
CREATE INDEX appointments_practitioner_idx ON public.appointments (practitioner);
CREATE INDEX appointments_location_idx ON public.appointments (location);
CREATE INDEX appointments_state_idx ON public.appointments (state);
CREATE INDEX sales_lines_invoice_date_idx ON public.sales_lines (invoice_date);
CREATE INDEX sales_lines_patient_guid_idx ON public.sales_lines (patient_guid);
CREATE INDEX sales_lines_staff_member_idx ON public.sales_lines (staff_member);
CREATE INDEX sales_lines_location_idx ON public.sales_lines (location);
CREATE INDEX provider_shifts_practitioner_date_idx ON public.provider_shifts (practitioner, shift_date);
CREATE INDEX provider_shifts_location_idx ON public.provider_shifts (location);

-- Functions
CREATE OR REPLACE FUNCTION public.mark_internal()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  UPDATE public.appointments a
  SET is_internal = EXISTS (
    SELECT 1 FROM public.internal_treatments it
    WHERE lower(trim(it.treatment_name)) = lower(trim(a.treatment_name))
  )
  WHERE a.is_internal IS DISTINCT FROM EXISTS (
    SELECT 1 FROM public.internal_treatments it
    WHERE lower(trim(it.treatment_name)) = lower(trim(a.treatment_name))
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_patients()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  DELETE FROM public.patients WHERE true;

  WITH guids AS (
    SELECT patient_guid FROM public.appointments WHERE patient_guid IS NOT NULL AND patient_guid <> ''
    UNION
    SELECT patient_guid FROM public.sales_lines WHERE patient_guid IS NOT NULL AND patient_guid <> ''
  ),
  visits AS (
    SELECT patient_guid, min(start_at) AS first_visit_at, max(start_at) AS last_visit_at, count(*)::int AS visit_count
    FROM public.appointments
    WHERE state = 'arrived' AND is_internal = false AND patient_guid IS NOT NULL
    GROUP BY patient_guid
  ),
  first_v AS (
    SELECT DISTINCT ON (patient_guid) patient_guid, location, practitioner, treatment_name
    FROM public.appointments
    WHERE state = 'arrived' AND is_internal = false AND patient_guid IS NOT NULL
    ORDER BY patient_guid, start_at ASC
  ),
  next_b AS (
    SELECT patient_guid, min(start_at) AS next_booked_at
    FROM public.appointments
    WHERE state = 'booked' AND is_internal = false AND start_at > now() AND patient_guid IS NOT NULL
    GROUP BY patient_guid
  ),
  names AS (
    SELECT DISTINCT ON (patient_guid) patient_guid, patient_name, patient_number
    FROM (
      SELECT patient_guid, patient_name, patient_number, start_at AS seen_at
      FROM public.appointments WHERE patient_guid IS NOT NULL AND coalesce(patient_name,'') <> ''
      UNION ALL
      SELECT patient_guid, patient_name, NULL, invoice_date
      FROM public.sales_lines WHERE patient_guid IS NOT NULL AND coalesce(patient_name,'') <> ''
    ) s
    ORDER BY patient_guid, seen_at DESC NULLS LAST
  ),
  numbers AS (
    SELECT DISTINCT ON (patient_guid) patient_guid, patient_number
    FROM public.appointments WHERE patient_guid IS NOT NULL AND coalesce(patient_number,'') <> ''
    ORDER BY patient_guid, start_at DESC NULLS LAST
  ),
  rev AS (
    SELECT patient_guid, sum(subtotal) AS lifetime_revenue
    FROM public.sales_lines WHERE patient_guid IS NOT NULL
    GROUP BY patient_guid
  )
  INSERT INTO public.patients (patient_guid, patient_name, patient_number, first_visit_at, last_visit_at,
    visit_count, next_booked_at, first_location, first_practitioner, first_treatment, lifetime_revenue)
  SELECT g.patient_guid, nm.patient_name, nu.patient_number, v.first_visit_at, v.last_visit_at,
    coalesce(v.visit_count, 0), nb.next_booked_at, f.location, f.practitioner, f.treatment_name,
    coalesce(r.lifetime_revenue, 0)
  FROM guids g
  LEFT JOIN visits v USING (patient_guid)
  LEFT JOIN first_v f USING (patient_guid)
  LEFT JOIN next_b nb USING (patient_guid)
  LEFT JOIN names nm USING (patient_guid)
  LEFT JOIN numbers nu USING (patient_guid)
  LEFT JOIN rev r USING (patient_guid);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.mark_internal() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_patients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_internal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_patients() TO authenticated, service_role;