-- Run once in Supabase Dashboard → SQL Editor.
-- Private storage for medical images and DOCX/PDF assessments used by gym mode.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assessments',
  'assessments',
  false,
  10485760,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "assessment files are readable by athlete or coach" ON storage.objects;
CREATE POLICY "assessment files are readable by athlete or coach"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'assessments'
  AND EXISTS (
    SELECT 1
    FROM public."AthleteProfile" AS athlete
    WHERE athlete.id::text = (storage.foldername(name))[1]
      AND (athlete."userId" = auth.uid()::text OR athlete."coachId" = auth.uid()::text)
  )
);

DROP POLICY IF EXISTS "assessment files are uploadable by athlete or coach" ON storage.objects;
CREATE POLICY "assessment files are uploadable by athlete or coach"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'assessments'
  AND EXISTS (
    SELECT 1
    FROM public."AthleteProfile" AS athlete
    WHERE athlete.id::text = (storage.foldername(name))[1]
      AND (athlete."userId" = auth.uid()::text OR athlete."coachId" = auth.uid()::text)
  )
);
