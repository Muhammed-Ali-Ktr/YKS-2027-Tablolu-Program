-- ==========================================================
-- YKS 2027 Kişisel Çalışma Programı - Supabase SQL Şeması (v2 - Cihaz Eşleştirme & Realtime)
-- ==========================================================
-- Bu scripti Supabase Dashboard > SQL Editor alanına yapıştırıp "Run" butonuna basınız.
-- Eski tabloları temizleyip bilgisayar ve telefon senkronizasyonu için tam uyumlu yeni yapıyı kurar.

-- 1. Eski Tabloları ve Kısıtlamaları Temizle (Foreign Key çakışmalarını önler)
DROP TABLE IF EXISTS public.schedule_items CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.programs CASCADE;

-- 2. Yeni Tabloların Oluşturulması
CREATE TABLE public.programs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sync_code TEXT NOT NULL DEFAULT 'yks2027',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    exam_name TEXT NOT NULL DEFAULT 'YKS 2027',
    exam_date DATE NOT NULL DEFAULT '2027-06-19',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    include_exam_day BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_program_sync_code UNIQUE (sync_code)
);

CREATE TABLE public.subjects (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    program_id TEXT NOT NULL,
    sync_code TEXT NOT NULL DEFAULT 'yks2027',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    exam_type TEXT NOT NULL CHECK (exam_type IN ('TYT', 'AYT')),
    teacher TEXT NOT NULL DEFAULT '',
    total_days INTEGER NOT NULL CHECK (total_days > 0),
    youtube_url TEXT DEFAULT '',
    color_tag TEXT DEFAULT 'blue',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.schedule_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    program_id TEXT NOT NULL,
    sync_code TEXT NOT NULL DEFAULT 'yks2027',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    subject_id TEXT NOT NULL,
    schedule_date DATE NOT NULL,
    day_number INTEGER NOT NULL CHECK (day_number > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Aynı günde aynı dersin mükerrer eklenmesini önler
    CONSTRAINT unique_sync_date_subject UNIQUE (sync_code, schedule_date, subject_id)
);

-- 3. İndeksler (Hızlı senkronizasyon ve takvim sorgulama)
CREATE INDEX idx_programs_sync_code ON public.programs(sync_code);
CREATE INDEX idx_subjects_sync_code ON public.subjects(sync_code);
CREATE INDEX idx_schedule_items_sync_code ON public.schedule_items(sync_code);
CREATE INDEX idx_schedule_items_date ON public.schedule_items(schedule_date);
CREATE INDEX idx_schedule_items_subject ON public.schedule_items(subject_id);

-- 4. Row Level Security (RLS) Ayarları
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

-- Bilgisayar ve telefonun eşleştirme kodu (sync_code) ile kesintisiz veri okuma/yazma politikası
CREATE POLICY "Allow sync on programs" ON public.programs
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow sync on subjects" ON public.subjects
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow sync on schedule_items" ON public.schedule_items
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 5. Canlı Senkronizasyon (Supabase Realtime) Yayınları
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'programs') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.programs;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'subjects') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.subjects;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'schedule_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_items;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
