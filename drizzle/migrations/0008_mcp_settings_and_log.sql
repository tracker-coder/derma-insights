CREATE TABLE public.mcp_settings (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.mcp_settings (id, enabled) VALUES (1, true);
GRANT SELECT, UPDATE ON public.mcp_settings TO authenticated;
GRANT ALL ON public.mcp_settings TO service_role;
ALTER TABLE public.mcp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles read mcp settings" ON public.mcp_settings FOR SELECT TO authenticated USING (public.has_profile(auth.uid()));
CREATE POLICY "Admins update mcp settings" ON public.mcp_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.mcp_log (
  id bigserial PRIMARY KEY,
  user_id uuid DEFAULT auth.uid(),
  user_email text DEFAULT (auth.jwt() ->> 'email'),
  tool text NOT NULL,
  arguments jsonb,
  duration_ms int,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcp_log_created_idx ON public.mcp_log (created_at DESC);
GRANT SELECT, INSERT ON public.mcp_log TO authenticated;
GRANT USAGE ON SEQUENCE public.mcp_log_id_seq TO authenticated;
GRANT ALL ON public.mcp_log TO service_role;
ALTER TABLE public.mcp_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read mcp log" ON public.mcp_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Profiles write own mcp log" ON public.mcp_log FOR INSERT TO authenticated WITH CHECK (public.has_profile(auth.uid()) AND user_id = auth.uid());

-- Gate every MCP call: server enabled + 60 calls/minute across the clinic.
CREATE OR REPLACE FUNCTION public.mcp_check_call() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_profile(auth.uid()) THEN RETURN 'Your account has no DermaSpa Insights profile.'; END IF;
  IF NOT coalesce((SELECT enabled FROM mcp_settings WHERE id = 1), false) THEN RETURN 'The ChatGPT connection is turned off by an administrator.'; END IF;
  IF (SELECT count(*) FROM mcp_log WHERE created_at > now() - interval '1 minute') >= 60 THEN RETURN 'Rate limit reached (60 calls per minute). Try again shortly.'; END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.mcp_check_call() TO authenticated;