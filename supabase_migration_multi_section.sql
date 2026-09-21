-- Mevcut Supabase projesinde aynı güne aynı dersten birden fazla bölüm eklemek için çalıştırın.
ALTER TABLE public.schedule_items DROP CONSTRAINT IF EXISTS unique_sync_date_subject;
