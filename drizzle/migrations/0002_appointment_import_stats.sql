CREATE OR REPLACE FUNCTION public.appointment_import_stats(_start timestamptz, _end timestamptz)
RETURNS TABLE(arrived_visits bigint, first_visits bigint, unique_patients bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    count(*) FILTER (WHERE state = 'arrived' AND NOT is_internal),
    count(*) FILTER (WHERE state = 'arrived' AND NOT is_internal AND first_visit),
    count(DISTINCT patient_guid) FILTER (WHERE state = 'arrived' AND NOT is_internal)
  FROM public.appointments
  WHERE start_at >= _start AND start_at <= _end;
$$;
GRANT EXECUTE ON FUNCTION public.appointment_import_stats(timestamptz, timestamptz) TO authenticated;