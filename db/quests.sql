-- =============================================================================
-- Quêtes / Albums : énigme -> cartes cachées à réunir -> Titre de profil.
-- À exécuter une fois dans le SQL Editor, après refresh.sql.
--
-- Créer un album (à adapter, puis exécuter dans le SQL Editor) :
--   WITH t AS (INSERT INTO titles (code, name) VALUES ('pionnier', 'Pionnier du Web') RETURNING id),
--        a AS (INSERT INTO albums (title_id, riddle)
--              SELECT id, 'Avant les tendances, il y avait nous…' FROM t RETURNING id)
--   INSERT INTO album_requirements (album_id, video_id)
--   SELECT a.id, v.id FROM a, videos v WHERE v.platform_video_id IN ('ID_VIDEO_1', 'ID_VIDEO_2');
-- =============================================================================
BEGIN;

-- Progression du joueur connecté (le contenu exact des albums reste caché)
CREATE OR REPLACE FUNCTION public.album_progress()
RETURNS TABLE (album_id int, title text, riddle text, owned int, total int, unlocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, t.name, a.riddle,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.cards c WHERE c.owner_id = auth.uid() AND c.video_id = r.video_id))::int,
    count(*)::int,
    EXISTS (SELECT 1 FROM public.user_titles ut WHERE ut.user_id = auth.uid() AND ut.title_id = a.title_id)
  FROM public.albums a
  JOIN public.titles t ON t.id = a.title_id
  JOIN public.album_requirements r ON r.album_id = a.id
  WHERE a.is_active
  GROUP BY a.id, t.name, a.riddle, a.title_id
  ORDER BY a.id
$$;

-- Débloque les Titres des albums complets, renvoie le nombre de nouveaux Titres
CREATE OR REPLACE FUNCTION public.claim_albums() RETURNS int
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  WITH done AS (
    SELECT a.title_id
    FROM public.albums a
    JOIN public.album_requirements r ON r.album_id = a.id
    WHERE a.is_active AND auth.uid() IS NOT NULL
    GROUP BY a.id, a.title_id
    HAVING bool_and(EXISTS (
      SELECT 1 FROM public.cards c WHERE c.owner_id = auth.uid() AND c.video_id = r.video_id))
  ), ins AS (
    INSERT INTO public.user_titles (user_id, title_id)
    SELECT auth.uid(), title_id FROM done
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int FROM ins
$$;

-- Afficher un de ses Titres à côté du pseudo (NULL = aucun)
CREATE OR REPLACE FUNCTION public.set_active_title(p_title int) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_title IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_titles WHERE user_id = auth.uid() AND title_id = p_title) THEN
    RAISE EXCEPTION 'title_not_owned';
  END IF;
  UPDATE public.users SET active_title_id = p_title WHERE id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.album_progress(), public.claim_albums(), public.set_active_title(int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.album_progress(), public.claim_albums(), public.set_active_title(int)
  TO authenticated;

DROP POLICY IF EXISTS "lire les titres" ON public.titles;
CREATE POLICY "lire les titres" ON public.titles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lire mes titres" ON public.user_titles;
CREATE POLICY "lire mes titres" ON public.user_titles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;

NOTIFY pgrst, 'reload schema';
