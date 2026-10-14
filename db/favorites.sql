-- =============================================================================
-- Favoris : le joueur marque ses cartes préférées (tri "Favoris" de la collection).
-- À exécuter une fois dans le SQL Editor (relançable).
-- =============================================================================
BEGIN;

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

-- Une carte qui change de propriétaire (vente au marché) perd son statut de favori
CREATE OR REPLACE FUNCTION public.reset_favorite_on_transfer() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN NEW.is_favorite := false; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS card_favorite_reset ON public.cards;
CREATE TRIGGER card_favorite_reset BEFORE UPDATE OF owner_id ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.reset_favorite_on_transfer();

-- Ajoute/retire une de ses cartes des favoris, renvoie le nouvel état
CREATE OR REPLACE FUNCTION public.toggle_favorite(p_card uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.cards SET is_favorite = NOT is_favorite
  WHERE id = p_card AND owner_id = auth.uid()
  RETURNING is_favorite
$$;

REVOKE ALL ON FUNCTION public.toggle_favorite(uuid), public.reset_favorite_on_transfer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_favorite(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
