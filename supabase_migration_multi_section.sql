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
