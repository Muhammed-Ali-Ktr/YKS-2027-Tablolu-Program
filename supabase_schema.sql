-- ==========================================================
-- YKS 2027 Kişisel Çalışma Programı - Supabase SQL Şeması
-- ==========================================================
-- Bu scripti Supabase Dashboard > SQL Editor alanına yapıştırıp "Run" diyerek çalıştırabilirsiniz.

-- 1. Tabloların Oluşturulması
CREATE TABLE IF NOT EXISTS public.programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_name TEXT NOT NULL DEFAULT 'YKS 2027',
    exam_date DATE NOT NULL DEFAULT '2027-06-19',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    include_exam_day BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    exam_type TEXT NOT NULL CHECK (exam_type IN ('TYT', 'AYT')),
    teacher TEXT NOT NULL DEFAULT '',
    total_days INTEGER NOT NULL CHECK (total_days > 0),
    youtube_url TEXT DEFAULT '',
    color_tag TEXT DEFAULT 'blue',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.schedule_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    schedule_date DATE NOT NULL,
    day_number INTEGER NOT NULL CHECK (day_number > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Aynı gün içinde aynı dersin mükerrer eklenmesini önler
    CONSTRAINT unique_program_date_subject UNIQUE (program_id, schedule_date, subject_id)
);

-- 2. İndeksler (Hızlı sorgulama ve takvim yükleme için)
CREATE INDEX IF NOT EXISTS idx_programs_user_id ON public.programs(user_id);
CREATE INDEX IF NOT EXISTS idx_subjects_program_id ON public.subjects(program_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_program_id ON public.schedule_items(program_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_date ON public.schedule_items(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedule_items_subject ON public.schedule_items(subject_id);

-- 3. Row Level Security (RLS) Etkinleştirme
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS Politikaları (Kullanıcılar sadece kendi verilerini okuyabilir, ekleyebilir, güncelleyebilir ve silebilir)

-- Programs Politikaları
DROP POLICY IF EXISTS "Users can view own programs" ON public.programs;
CREATE POLICY "Users can view own programs"
    ON public.programs FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own programs" ON public.programs;
CREATE POLICY "Users can insert own programs"
    ON public.programs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own programs" ON public.programs;
CREATE POLICY "Users can update own programs"
    ON public.programs FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own programs" ON public.programs;
CREATE POLICY "Users can delete own programs"
    ON public.programs FOR DELETE
    USING (auth.uid() = user_id);

-- Subjects Politikaları
DROP POLICY IF EXISTS "Users can view own subjects" ON public.subjects;
CREATE POLICY "Users can view own subjects"
    ON public.subjects FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own subjects" ON public.subjects;
CREATE POLICY "Users can insert own subjects"
    ON public.subjects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subjects" ON public.subjects;
CREATE POLICY "Users can update own subjects"
    ON public.subjects FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own subjects" ON public.subjects;
CREATE POLICY "Users can delete own subjects"
    ON public.subjects FOR DELETE
    USING (auth.uid() = user_id);

-- Schedule Items Politikaları
DROP POLICY IF EXISTS "Users can view own schedule items" ON public.schedule_items;
CREATE POLICY "Users can view own schedule items"
    ON public.schedule_items FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own schedule items" ON public.schedule_items;
CREATE POLICY "Users can insert own schedule items"
    ON public.schedule_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own schedule items" ON public.schedule_items;
CREATE POLICY "Users can update own schedule items"
    ON public.schedule_items FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own schedule items" ON public.schedule_items;
CREATE POLICY "Users can delete own schedule items"
    ON public.schedule_items FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Realtime Yayınını Etkinleştirme (İsteğe bağlı)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'schedule_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_items;
    END IF;
END $$;
