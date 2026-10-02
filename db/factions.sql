-- =============================================================================
-- Factions : 4 familles en cycle (chacune bat la suivante, perd contre la précédente).
-- Divertissement → bat Passion → bat Culture → bat Découverte → bat Divertissement
-- À exécuter une fois dans le SQL Editor. Renommer : UPDATE factions SET name = '...' WHERE code = '...';
-- =============================================================================
BEGIN;

INSERT INTO public.factions (id, code, name) VALUES
  (1, 'divertissement', 'Divertissement'), -- musique, divertissement, humour, films
  (2, 'passion',        'Passion'),        -- gaming, sport, auto
  (3, 'culture',        'Culture'),        -- éducation, sciences, actualité
  (4, 'decouverte',     'Découverte')      -- vlogs, tutos, animaux, voyage
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name;
UPDATE public.factions SET beats_id = id % 4 + 1;

-- Catégories de la plateforme -> faction
INSERT INTO public.category_factions (platform_category_id, faction_id) VALUES
  ('1', 1), ('10', 1), ('23', 1), ('24', 1), ('30', 1), ('43', 1), ('44', 1),
  ('2', 2), ('17', 2), ('20', 2),
  ('25', 3), ('27', 3), ('28', 3), ('29', 3),
  ('15', 4), ('19', 4), ('22', 4), ('26', 4)
ON CONFLICT (platform_category_id) DO UPDATE SET faction_id = EXCLUDED.faction_id;

-- Chaque vidéo reçoit sa faction automatiquement (catégorie inconnue -> Découverte)
CREATE OR REPLACE FUNCTION public.set_video_faction() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.faction_id := COALESCE(
    (SELECT faction_id FROM public.category_factions WHERE platform_category_id = NEW.platform_category_id),
    4);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS video_faction ON public.videos;
CREATE TRIGGER video_faction
  BEFORE INSERT OR UPDATE OF platform_category_id ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.set_video_faction();

-- Vidéos déjà importées
UPDATE public.videos v SET faction_id = COALESCE(
  (SELECT faction_id FROM public.category_factions cf WHERE cf.platform_category_id = v.platform_category_id), 4);

DROP POLICY IF EXISTS "lire les factions" ON public.factions;
CREATE POLICY "lire les factions" ON public.factions FOR SELECT TO authenticated USING (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
