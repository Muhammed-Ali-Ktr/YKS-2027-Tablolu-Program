-- Mevcut Supabase projesinde aynı güne aynı dersten birden fazla bölüm eklemek için çalıştırın.
ALTER TABLE public.schedule_items DROP CONSTRAINT IF EXISTS unique_sync_date_subject;

-- Günlük görev ayrıntıları. Mevcut satırlar ve tamamlanma bilgileri korunur.
-- NULL eski kayıtları ayırt eder; uygulama eski cihazdaki ayrıntıları korur.
ALTER TABLE public.schedule_items
    ADD COLUMN IF NOT EXISTS title text,
    ADD COLUMN IF NOT EXISTS notes text,
    ADD COLUMN IF NOT EXISTS task_type text,
    ADD COLUMN IF NOT EXISTS duration_minutes integer,
    ADD COLUMN IF NOT EXISTS question_count integer,
    ADD COLUMN IF NOT EXISTS resource_url text;

-- ACCOUNT UPGRADE: export the old program before running this section.
-- Rows without an owner are preserved but cannot be read by public clients.
BEGIN;
DO $$ DECLARE t text; p record; BEGIN
  FOREACH t IN ARRAY ARRAY['programs','subjects','schedule_items'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY owner_access ON public.%I FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()) AND sync_code = (SELECT auth.uid())::text)',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon',t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',t);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS public.login_attempts (
  bucket text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  attempts integer NOT NULL
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;
GRANT ALL ON public.login_attempts TO service_role;
CREATE OR REPLACE FUNCTION public.consume_login_attempt(bucket text, max_attempts integer, window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE hits integer;
BEGIN
  INSERT INTO public.login_attempts AS a VALUES (bucket, clock_timestamp(), 1)
  ON CONFLICT ON CONSTRAINT login_attempts_pkey DO UPDATE
  SET attempts = CASE WHEN a.started_at < clock_timestamp() - make_interval(secs => window_seconds) THEN 1 ELSE a.attempts+1 END,
      started_at = CASE WHEN a.started_at < clock_timestamp() - make_interval(secs => window_seconds) THEN clock_timestamp() ELSE a.started_at END
  RETURNING attempts INTO hits;
  RETURN hits <= max_attempts;
END $$;
REVOKE ALL ON FUNCTION public.consume_login_attempt(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_login_attempt(text,integer,integer) TO service_role;
COMMIT;
