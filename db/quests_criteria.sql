-- =============================================================================
-- Quêtes à critères : en plus des quêtes "vidéos précises", une quête peut demander
-- une règle (albums.criteria). Types :
--   {"type": "same_creator", "count": 3}               3 cartes d'une même chaîne
--   {"type": "faction", "faction_id": 2, "count": 5}   5 cartes d'une faction
--   {"type": "each_rarity"}                            une carte de chaque rareté (6)
--   {"type": "before_year", "year": 2010, "count": 3}  3 cartes de vidéos publiées avant 2010
-- À exécuter une fois dans le SQL Editor, après quests.sql (relançable).
-- =============================================================================
BEGIN;

ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS criteria jsonb;

-- Nombre de cartes à réunir pour une quête à critères
CREATE OR REPLACE FUNCTION public.criteria_total(c jsonb) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE c ->> 'type' WHEN 'each_rarity' THEN 6 ELSE (c ->> 'count')::int END
$$;

-- Progression d'un joueur sur une quête à critères (plafonnée au total)
CREATE OR REPLACE FUNCTION public.criteria_progress(p_user uuid, c jsonb) RETURNS int
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT least(public.criteria_total(c), CASE c ->> 'type'
    WHEN 'same_creator' THEN (
      SELECT coalesce(max(n), 0) FROM (
        SELECT count(*) AS n FROM public.cards k JOIN public.videos v ON v.id = k.video_id
        WHERE k.owner_id = p_user GROUP BY v.creator_id) s)
    WHEN 'faction' THEN (
      SELECT count(*) FROM public.cards k JOIN public.videos v ON v.id = k.video_id
      WHERE k.owner_id = p_user AND v.faction_id = (c ->> 'faction_id')::int)
    WHEN 'each_rarity' THEN (
      SELECT count(DISTINCT k.rarity) FROM public.cards k WHERE k.owner_id = p_user)
    WHEN 'before_year' THEN (
      SELECT count(*) FROM public.cards k JOIN public.videos v ON v.id = k.video_id
      WHERE k.owner_id = p_user AND v.published_at < make_date((c ->> 'year')::int, 1, 1))
    ELSE 0 END)::int
$$;

-- Progression du joueur connecté, pour les deux types de quêtes
CREATE OR REPLACE FUNCTION public.album_progress()
RETURNS TABLE (album_id int, title text, riddle text, owned int, total int, unlocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, t.name, a.riddle,
    CASE WHEN a.criteria IS NOT NULL THEN public.criteria_progress(auth.uid(), a.criteria)
         ELSE (SELECT count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM public.cards c WHERE c.owner_id = auth.uid() AND c.video_id = r.video_id))
               FROM public.album_requirements r WHERE r.album_id = a.id)::int END,
    CASE WHEN a.criteria IS NOT NULL THEN public.criteria_total(a.criteria)
         ELSE (SELECT count(*) FROM public.album_requirements r WHERE r.album_id = a.id)::int END,
    EXISTS (SELECT 1 FROM public.user_titles ut WHERE ut.user_id = auth.uid() AND ut.title_id = a.title_id)
  FROM public.albums a
  JOIN public.titles t ON t.id = a.title_id
  WHERE a.is_active
  ORDER BY a.id
$$;

-- Débloque les Titres des quêtes terminées (des deux types)
CREATE OR REPLACE FUNCTION public.claim_albums() RETURNS int
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  WITH done AS (
    SELECT a.title_id
    FROM public.album_progress() p
    JOIN public.albums a ON a.id = p.album_id
    WHERE auth.uid() IS NOT NULL AND p.total > 0 AND p.owned >= p.total AND NOT p.unlocked
  ), ins AS (
    INSERT INTO public.user_titles (user_id, title_id)
    SELECT auth.uid(), title_id FROM done
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int FROM ins
$$;

REVOKE ALL ON FUNCTION public.criteria_total(jsonb), public.criteria_progress(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Les 4 quêtes à critères
INSERT INTO public.titles (code, name) VALUES
  ('fidele', 'Fidèle'),
  ('coeur-passionne', 'Cœur Passionné'),
  ('collectionneur-complet', 'Collectionneur Complet'),
  ('nostalgique', 'Nostalgique')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.albums (title_id, riddle, criteria)
SELECT t.id, q.riddle, q.criteria
FROM (VALUES
  ('fidele', 'Trois fois la même signature au bas de l''écran.', '{"type": "same_creator", "count": 3}'::jsonb),
  ('coeur-passionne', 'Cinq cartes qui vibrent pour le jeu et le sport.', '{"type": "faction", "faction_id": 2, "count": 5}'::jsonb),
  ('collectionneur-complet', 'De la plus humble à la plus mythique : une de chaque.', '{"type": "each_rarity"}'::jsonb),
  ('nostalgique', 'Trois souvenirs d''un web d''avant 2010.', '{"type": "before_year", "year": 2010, "count": 3}'::jsonb)
) AS q(code, riddle, criteria)
JOIN public.titles t ON t.code = q.code
WHERE NOT EXISTS (SELECT 1 FROM public.albums a WHERE a.title_id = t.id);

COMMIT;

NOTIFY pgrst, 'reload schema';
