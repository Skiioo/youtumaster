-- =============================================================================
-- Suppression de compte : efface toutes les données du joueur connecté, sans léser les autres
-- (enchérisseurs remboursés, matchs annulés, cartes adverses libérées).
-- Le compte de connexion (auth.users) est ensuite supprimé par le serveur (clé admin).
-- À exécuter une fois dans le SQL Editor (relançable).
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_my_account() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Marché : rembourser les enchérisseurs sur MES ventes en cours
  UPDATE public.users u SET viewcoins = u.viewcoins + l.current_bid
  FROM public.market_listings l
  WHERE l.seller_id = uid AND l.status = 'active' AND l.current_bidder_id = u.id;

  -- Marché : MES enchères en tête chez les autres sont retirées (l'annonce repart sans enchère)
  UPDATE public.market_listings SET current_bid = NULL, current_bidder_id = NULL
  WHERE current_bidder_id = uid AND status = 'active';

  -- Combat : matchs non terminés annulés, cartes de l'adversaire libérées
  UPDATE public.cards c SET locked_reason = NULL
  FROM public.matches m
  WHERE uid IN (m.player_a_id, m.player_b_id) AND m.status IN ('waiting', 'in_progress')
    AND c.locked_reason = 'match' AND c.owner_id <> uid
    AND m.state -> 'cards' ? c.id::text;

  -- Suppression des données (ordre imposé par les clés étrangères)
  DELETE FROM public.quiz_rounds q USING public.matches m
  WHERE q.match_id = m.id AND uid IN (m.player_a_id, m.player_b_id);
  DELETE FROM public.matches WHERE uid IN (player_a_id, player_b_id);
  UPDATE public.matches SET winner_id = NULL WHERE winner_id = uid;

  DELETE FROM public.bids WHERE bidder_id = uid
     OR listing_id IN (SELECT id FROM public.market_listings WHERE seller_id = uid);
  DELETE FROM public.sales WHERE uid IN (seller_id, buyer_id)
     OR listing_id IN (SELECT id FROM public.market_listings WHERE seller_id = uid);
  DELETE FROM public.market_listings WHERE seller_id = uid;

  DELETE FROM public.decks WHERE user_id = uid;  -- deck_cards suivent (cascade)
  DELETE FROM public.booster_items bi USING public.boosters b WHERE bi.booster_id = b.id AND b.user_id = uid;
  DELETE FROM public.cards WHERE owner_id = uid;
  DELETE FROM public.boosters WHERE user_id = uid;
  DELETE FROM public.coin_ledger WHERE user_id = uid;
  UPDATE public.goat_whitelist SET added_by = NULL WHERE added_by = uid;

  -- Titres, cosmétiques, amis : supprimés en cascade avec le profil
  DELETE FROM public.users WHERE id = uid;
END $$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
