-- =============================================================================
-- Catalogue "Toutes les cartes" : une page de résultats (recherche + rareté + tri),
-- stats calculées seulement pour la page renvoyée. Index pour garder chaque tri rapide.
-- À exécuter une fois dans le SQL Editor (relançable ; la création des index prend
-- quelques secondes sur ~200 000 vidéos).
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Recherche "contient" dans le titre (ILIKE '%mot%')
CREATE INDEX IF NOT EXISTS videos_title_trgm ON public.videos
  USING gin (title extensions.gin_trgm_ops) WHERE is_available;
-- Un index par tri
CREATE INDEX IF NOT EXISTS videos_sort_rarity ON public.videos (current_rarity DESC, view_count DESC) WHERE is_available;
CREATE INDEX IF NOT EXISTS videos_sort_name ON public.videos (title) WHERE is_available;
CREATE INDEX IF NOT EXISTS videos_sort_views ON public.videos (view_count DESC) WHERE is_available;
CREATE INDEX IF NOT EXISTS videos_sort_recent ON public.videos (published_at DESC) WHERE is_available;

BEGIN;

-- Les colonnes renvoyées ont changé (ajout de la chaîne) : Postgres impose de recréer la fonction
DROP FUNCTION IF EXISTS public.catalog_page(text, public.rarity, text, int, int);

-- p_q : texte déjà échappé pour ILIKE (\%, \_) ; p_sort : rarity | name | views | recent
CREATE OR REPLACE FUNCTION public.catalog_page(
  p_q text, p_rarity public.rarity, p_sort text, p_offset int, p_limit int)
RETURNS TABLE (
  id uuid, platform_video_id text, title text, rarity public.rarity, view_count bigint,
  last_sold_price bigint, faction_id smallint, faction_name text, creator_name text, attack int, defense int)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  -- Liste blanche : le tri n'est jamais du texte libre dans la requête
  v_order text := CASE p_sort
    WHEN 'name'   THEN 'v.title'
    WHEN 'views'  THEN 'v.view_count DESC'
    WHEN 'recent' THEN 'v.published_at DESC'
    ELSE 'v.current_rarity DESC, v.view_count DESC' END;
BEGIN
  -- SQL dynamique : un ORDER BY fixe par requête permet à Postgres d'utiliser l'index du tri
  RETURN QUERY EXECUTE format($q$
    WITH page AS (
      SELECT v.* FROM public.videos v
      WHERE v.is_available
        AND ($1 IS NULL OR v.current_rarity = $1)
        AND ($2 IS NULL OR v.title ILIKE '%%' || $2 || '%%')
      ORDER BY %s
      OFFSET $3 LIMIT $4
    )
    SELECT p.id, p.platform_video_id, p.title, p.current_rarity, p.view_count,
           p.last_sold_price, p.faction_id, f.name, c.name, s.attack, s.defense
    FROM page p
    LEFT JOIN public.factions f ON f.id = p.faction_id
    LEFT JOIN public.creators c ON c.id = p.creator_id
    CROSS JOIN LATERAL public.card_stats(p.current_rarity, 'normal', p.view_count, p.like_count) s
    ORDER BY %s
  $q$, v_order, replace(v_order, 'v.', 'p.'))
  USING p_rarity, nullif(p_q, ''), greatest(p_offset, 0), least(greatest(p_limit, 1), 100);
END $$;

-- Nombre de résultats d'une RECHERCHE, plafonné à p_cap : compter exactement 1,4 M de vidéos
-- prend plusieurs secondes. Sans recherche, l'app utilise l'estimation de Postgres (instantanée).
DROP FUNCTION IF EXISTS public.catalog_count(text, public.rarity);
CREATE OR REPLACE FUNCTION public.catalog_count(p_q text, p_rarity public.rarity, p_cap int DEFAULT 6000)
RETURNS bigint
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT count(*) FROM (
    SELECT 1 FROM public.videos v
    WHERE v.is_available
      AND (p_rarity IS NULL OR v.current_rarity = p_rarity)
      AND (nullif(p_q, '') IS NULL OR v.title ILIKE '%' || p_q || '%')
    LIMIT p_cap
  ) s
$$;

REVOKE ALL ON FUNCTION public.catalog_count(text, public.rarity, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_count(text, public.rarity, int) TO authenticated;
REVOKE ALL ON FUNCTION public.catalog_page(text, public.rarity, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_page(text, public.rarity, text, int, int) TO authenticated;
-- Le nom de la chaîne s'affiche sur chaque carte : les créateurs sont lisibles par les joueurs
DROP POLICY IF EXISTS "lire les créateurs" ON public.creators;
CREATE POLICY "lire les créateurs" ON public.creators FOR SELECT TO authenticated USING (true);
-- card_stats lit la base d'attaque de chaque palier : les paliers de rareté sont publics
-- (sans cette règle, la RLS renvoie vide et attaque/défense valent NULL pour les joueurs)
DROP POLICY IF EXISTS "lire les paliers de rareté" ON public.rarity_tiers;
CREATE POLICY "lire les paliers de rareté" ON public.rarity_tiers FOR SELECT TO authenticated USING (true);
-- Le calcul des stats est une formule pure : les joueurs peuvent l'exécuter via le catalogue
GRANT EXECUTE ON FUNCTION public.card_stats(public.rarity, public.card_variant, bigint, bigint) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
