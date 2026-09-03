-- Storage policies run as the `authenticated` role. GymClient has RLS of its
-- own, so an inline EXISTS check against it always evaluates to false. Keep
-- the Storage bucket private and expose only this boolean ownership check.
CREATE OR REPLACE FUNCTION public.can_access_gym_assessment_folder(client_folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."GymClient" AS client
    WHERE client.id::text = client_folder
      AND (
        client."coachId" = auth.uid()::text
        OR client."userId" = auth.uid()::text
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_gym_assessment_folder(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_gym_assessment_folder(text) TO authenticated;

DROP POLICY IF EXISTS "assessment files are readable by gym client or coach" ON storage.objects;
DROP POLICY IF EXISTS "assessment files are uploadable by gym client or coach" ON storage.objects;

CREATE POLICY "assessment files are readable by gym client or coach"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'assessments'
  AND public.can_access_gym_assessment_folder((storage.foldername(name))[1])
);

CREATE POLICY "assessment files are uploadable by gym client or coach"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'assessments'
  AND public.can_access_gym_assessment_folder((storage.foldername(name))[1])
);
