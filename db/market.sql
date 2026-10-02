-- =============================================================================
-- Marketplace : enchères en ViewCoins. L'enchérisseur est débité tout de suite
-- (séquestre) et remboursé s'il est surenchéri. Taxe détruite à chaque vente.
-- À exécuter une fois dans le SQL Editor, après boosters.sql.
-- =============================================================================
BEGIN;

INSERT INTO public.game_config (key, value) VALUES ('market_duration_hours', '24') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.market_check_unlocked(u public.users) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF u.boosters_opened < public.cfg('market_unlock_boosters') THEN
    RAISE EXCEPTION 'market_locked';
  END IF;
END $$;

-- Mettre une de ses cartes en vente
CREATE OR REPLACE FUNCTION public.create_listing(p_card uuid, p_start_price bigint) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.users; c public.cards; v_id uuid;
BEGIN
  SELECT * INTO u FROM public.users WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.market_check_unlocked(u);
  IF p_start_price IS NULL OR p_start_price < 1 THEN RAISE EXCEPTION 'invalid_price'; END IF;

  SELECT * INTO c FROM public.cards WHERE id = p_card AND owner_id = u.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_your_card'; END IF;
  IF c.locked_reason IS NOT NULL THEN RAISE EXCEPTION 'card_locked'; END IF;

  UPDATE public.cards SET locked_reason = 'listing' WHERE id = c.id;
  INSERT INTO public.market_listings (card_id, seller_id, start_price, tax_rate, ends_at)
  VALUES (c.id, u.id, p_start_price, public.cfg('market_tax_rate'),
          now() + make_interval(hours => public.cfg('market_duration_hours')::int))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Enchérir : le montant est retiré tout de suite, l'ancien meilleur enchérisseur est remboursé
CREATE OR REPLACE FUNCTION public.place_bid(p_listing uuid, p_amount bigint) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.users; l public.market_listings;
BEGIN
  -- Verrou sur l'annonce d'abord : deux enchères simultanées passent l'une après l'autre
  SELECT * INTO l FROM public.market_listings WHERE id = p_listing FOR UPDATE;
  IF NOT FOUND OR l.status <> 'active' OR l.ends_at <= now() THEN RAISE EXCEPTION 'listing_closed'; END IF;

  SELECT * INTO u FROM public.users WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.market_check_unlocked(u);
  IF u.id = l.seller_id THEN RAISE EXCEPTION 'own_listing'; END IF;
  IF u.id = l.current_bidder_id THEN RAISE EXCEPTION 'already_best_bidder'; END IF;
  IF p_amount IS NULL OR p_amount < l.start_price OR p_amount <= coalesce(l.current_bid, 0) THEN
    RAISE EXCEPTION 'bid_too_low';
  END IF;
  IF u.viewcoins < p_amount THEN RAISE EXCEPTION 'not_enough_coins'; END IF;

  UPDATE public.users SET viewcoins = viewcoins - p_amount WHERE id = u.id;
  INSERT INTO public.coin_ledger (user_id, delta, reason, ref_id) VALUES (u.id, -p_amount, 'bid_hold', l.id);

  IF l.current_bidder_id IS NOT NULL THEN
    UPDATE public.users SET viewcoins = viewcoins + l.current_bid WHERE id = l.current_bidder_id;
    INSERT INTO public.coin_ledger (user_id, delta, reason, ref_id)
    VALUES (l.current_bidder_id, l.current_bid, 'bid_refund', l.id);
  END IF;

  UPDATE public.market_listings SET current_bid = p_amount, current_bidder_id = u.id WHERE id = l.id;
  INSERT INTO public.bids (listing_id, bidder_id, amount) VALUES (l.id, u.id, p_amount);
END $$;

-- Clôture des enchères terminées (appelée chaque minute par pg_cron, et à l'affichage du marché)
CREATE OR REPLACE FUNCTION public.close_expired_listings() RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.market_listings; c public.cards; v public.videos; st record; v_tax bigint; n int := 0;
BEGIN
  FOR l IN SELECT * FROM public.market_listings
           WHERE status = 'active' AND ends_at <= now() FOR UPDATE SKIP LOCKED LOOP
    n := n + 1;
    IF l.current_bidder_id IS NULL THEN
      UPDATE public.market_listings SET status = 'expired' WHERE id = l.id;
      UPDATE public.cards SET locked_reason = NULL WHERE id = l.card_id;
      CONTINUE;
    END IF;

    v_tax := floor(l.current_bid * l.tax_rate);
    UPDATE public.users SET viewcoins = viewcoins + l.current_bid - v_tax WHERE id = l.seller_id;
    INSERT INTO public.coin_ledger (user_id, delta, reason, ref_id)
    VALUES (l.seller_id, l.current_bid - v_tax, 'sale', l.id);

    -- Transfert + stats rafraîchies depuis le cache vidéo (pas d'appel API)
    SELECT * INTO c FROM public.cards WHERE id = l.card_id;
    SELECT * INTO v FROM public.videos WHERE id = c.video_id;
    SELECT * INTO st FROM public.card_stats(c.rarity, c.variant, v.view_count, v.like_count);
    UPDATE public.cards
    SET owner_id = l.current_bidder_id, locked_reason = NULL,
        snap_view_count = v.view_count, snap_like_count = v.like_count,
        attack = st.attack, defense = st.defense, last_updated_at = now()
    WHERE id = c.id;

    INSERT INTO public.sales (listing_id, video_id, rarity, variant, seller_id, buyer_id, price, tax_burned)
    VALUES (l.id, v.id, c.rarity, c.variant, l.seller_id, l.current_bidder_id, l.current_bid, v_tax);
    UPDATE public.videos SET last_sold_price = l.current_bid, last_sold_at = now() WHERE id = v.id;
    UPDATE public.market_listings SET status = 'sold' WHERE id = l.id;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.market_check_unlocked(public.users),
  public.create_listing(uuid, bigint), public.place_bid(uuid, bigint),
  public.close_expired_listings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing(uuid, bigint), public.place_bid(uuid, bigint),
  public.close_expired_listings() TO authenticated;

-- Lecture : annonces, cartes en vente et historique des ventes sont publics pour les joueurs
DROP POLICY IF EXISTS "lire les annonces" ON public.market_listings;
CREATE POLICY "lire les annonces" ON public.market_listings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lire les cartes en vente" ON public.cards;
CREATE POLICY "lire les cartes en vente" ON public.cards FOR SELECT TO authenticated
  USING (locked_reason = 'listing');

DROP POLICY IF EXISTS "lire les ventes" ON public.sales;
CREATE POLICY "lire les ventes" ON public.sales FOR SELECT TO authenticated USING (true);

COMMIT;

-- Clôture automatique chaque minute
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('close-auctions', '* * * * *', 'SELECT public.close_expired_listings()');

NOTIFY pgrst, 'reload schema';
