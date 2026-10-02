-- =============================================================================
-- Boosters : recharge paresseuse + ouverture atomique (tout ou rien).
-- À exécuter une fois dans le SQL Editor, après auth.sql.
-- =============================================================================
BEGIN;

-- Lecture d'une valeur numérique de game_config
CREATE OR REPLACE FUNCTION public.cfg(k text) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (value #>> '{}')::numeric FROM public.game_config WHERE key = k
$$;

-- Stock réel à l'instant T : on ajoute les boosters générés depuis l'ancre.
-- Stock plein = le chrono ne tourne pas (l'ancre suit now()).
CREATE OR REPLACE FUNCTION public.booster_refill(p_stock int, p_anchor timestamptz,
  OUT stock int, OUT anchor timestamptz)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_interval numeric := public.cfg('booster_interval_seconds');
  v_cap int := public.cfg('booster_stock_cap');
  n int := floor(extract(epoch FROM now() - p_anchor) / v_interval);
BEGIN
  stock := least(v_cap, p_stock + n);
  anchor := CASE WHEN stock >= v_cap THEN now()
                 ELSE p_anchor + make_interval(secs => n * v_interval) END;
END $$;

-- Pour l'UI : boosters dispo + secondes avant le prochain (NULL si plein)
CREATE OR REPLACE FUNCTION public.booster_state(OUT available int, OUT next_in_seconds int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.users; r record;
BEGIN
  SELECT * INTO u FROM public.users WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO r FROM public.booster_refill(u.booster_stock, u.booster_anchor_at);
  available := r.stock;
  next_in_seconds := CASE WHEN r.stock >= public.cfg('booster_stock_cap') THEN NULL
    ELSE ceil(public.cfg('booster_interval_seconds') - extract(epoch FROM now() - r.anchor)) END;
END $$;

INSERT INTO public.game_config (key, value) VALUES ('coins_per_booster', '50') ON CONFLICT DO NOTHING;

-- Attaque/Défense d'une carte. Puissance = base du palier + bonus log10(vues) ;
-- le ratio likes/vues penche vers la défense ; Gold +15 %, Dark +25 %.
CREATE OR REPLACE FUNCTION public.card_stats(p_rarity public.rarity, p_variant public.card_variant,
  p_views bigint, p_likes bigint, OUT attack int, OUT defense int)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_power numeric := (SELECT base_attack FROM public.rarity_tiers WHERE rarity = p_rarity)
                     + log(greatest(p_views, 1)) * 3;
  v_def numeric := 0.4 + 2 * CASE WHEN p_likes IS NULL OR p_views = 0 THEN 0.03
                                  ELSE least(p_likes::numeric / p_views, 0.1) END;
  v_boost numeric := CASE p_variant WHEN 'gold' THEN 1.15 WHEN 'dark' THEN 1.25 ELSE 1 END;
BEGIN
  attack := round(v_power * (1 - v_def) * 2 * v_boost);
  defense := round(v_power * v_def * 2 * v_boost);
END $$;

-- Tirage rapide : chaque vidéo a une clé aléatoire fixe, indexée par rareté.
-- On prend la première clé >= un nombre au hasard : une recherche d'index, quelle que soit la taille du catalogue.
-- Les clés ne sont pas parfaitement espacées : sous 1000 vidéos (Légendaires, GOAT…) on tire
-- donc uniformément par position, ce qui reste rapide sur une petite liste.
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS random_key double precision NOT NULL DEFAULT random();
CREATE INDEX IF NOT EXISTS videos_random_pick ON public.videos (current_rarity, random_key) WHERE is_available;

-- Vidéo au hasard de la rareté demandée, sinon de la rareté la plus proche (à égalité : la plus basse)
CREATE OR REPLACE FUNCTION public.pick_video(p_rarity public.rarity) RETURNS public.videos
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE v public.videos; r public.rarity; x double precision := random(); n int;
BEGIN
  FOR r IN SELECT t FROM unnest(enum_range(NULL::public.rarity)) t
           ORDER BY abs(array_position(enum_range(NULL::public.rarity), t)
                      - array_position(enum_range(NULL::public.rarity), p_rarity)), t LOOP
    SELECT count(*) INTO n FROM (
      SELECT 1 FROM public.videos WHERE is_available AND current_rarity = r LIMIT 1000) s;
    CONTINUE WHEN n = 0;
    IF n < 1000 THEN
      SELECT * INTO v FROM public.videos WHERE is_available AND current_rarity = r
      ORDER BY random_key OFFSET floor(x * n)::int LIMIT 1;
      RETURN v;
    END IF;

    SELECT * INTO v FROM public.videos
    WHERE is_available AND current_rarity = r AND random_key >= x ORDER BY random_key LIMIT 1;
    IF NOT FOUND THEN -- on repart du début de l'index
      SELECT * INTO v FROM public.videos
      WHERE is_available AND current_rarity = r ORDER BY random_key LIMIT 1;
    END IF;
    IF FOUND THEN RETURN v; END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- Ouvre un booster pour le joueur connecté, renvoie l'id du booster
CREATE OR REPLACE FUNCTION public.open_booster() RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  u public.users; r record; v public.videos;
  v_booster uuid; v_card uuid; v_slot int; v_roll numeric;
  v_rarity public.rarity; v_variant public.card_variant; st record;
BEGIN
  -- Verrou sur la ligne du joueur : deux clics simultanés ne consomment pas 2 fois
  SELECT * INTO u FROM public.users WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO r FROM public.booster_refill(u.booster_stock, u.booster_anchor_at);
  IF r.stock < 1 THEN RAISE EXCEPTION 'no_booster_available'; END IF;

  UPDATE public.users
  SET booster_stock = r.stock - 1, booster_anchor_at = r.anchor, boosters_opened = boosters_opened + 1,
      viewcoins = viewcoins + public.cfg('coins_per_booster')
  WHERE id = u.id;
  INSERT INTO public.boosters (user_id) VALUES (u.id) RETURNING id INTO v_booster;
  INSERT INTO public.coin_ledger (user_id, delta, reason, ref_id)
  VALUES (u.id, public.cfg('coins_per_booster'), 'booster', v_booster);

  FOR v_slot IN 1 .. public.cfg('booster_size')::int LOOP
    IF random() < public.cfg('refresh_token_drop_rate') THEN
      UPDATE public.users SET refresh_tokens = refresh_tokens + 1 WHERE id = u.id;
      INSERT INTO public.booster_items (booster_id, slot, is_refresh_token) VALUES (v_booster, v_slot, true);
      CONTINUE;
    END IF;

    -- Rareté tirée selon les poids de rarity_tiers
    v_roll := random() * (SELECT sum(booster_weight) FROM public.rarity_tiers);
    SELECT t.rarity INTO v_rarity
    FROM (SELECT rarity, sum(booster_weight) OVER (ORDER BY rarity) AS cum FROM public.rarity_tiers) t
    WHERE t.cum > v_roll ORDER BY t.rarity LIMIT 1;

    v := public.pick_video(v_rarity);
    IF v.id IS NULL THEN RAISE EXCEPTION 'empty_catalog'; END IF;
    v_rarity := v.current_rarity;

    v_roll := random();
    v_variant := CASE
      WHEN v_rarity = 'goat'      AND v_roll < 0.05 THEN 'dark'
      WHEN v_rarity = 'goat'      AND v_roll < 0.15 THEN 'gold'
      WHEN v_rarity = 'goat'                        THEN 'rainbow'
      WHEN v_rarity = 'legendary' AND v_roll < 0.04 THEN 'dark'
      WHEN v_rarity = 'legendary' AND v_roll < 0.12 THEN 'gold'
      ELSE 'normal' END;

    SELECT * INTO st FROM public.card_stats(v_rarity, v_variant, v.view_count, v.like_count);

    INSERT INTO public.cards (owner_id, video_id, rarity, variant, goat_reason,
      snap_view_count, snap_like_count, attack, defense, booster_id)
    VALUES (u.id, v.id, v_rarity, v_variant,
      CASE WHEN v_rarity <> 'goat' THEN NULL
           WHEN EXISTS (SELECT 1 FROM public.goat_whitelist w WHERE w.platform_video_id = v.platform_video_id)
             THEN 'whitelist'::public.goat_reason
           ELSE 'absolute_views' END,
      v.view_count, v.like_count,
      st.attack, st.defense, v_booster)
    RETURNING id INTO v_card;

    INSERT INTO public.booster_items (booster_id, slot, card_id) VALUES (v_booster, v_slot, v_card);
  END LOOP;

  RETURN v_booster;
END $$;

-- Seuls les joueurs connectés appellent les fonctions publiques ; les helpers restent internes
REVOKE ALL ON FUNCTION public.cfg(text), public.booster_refill(int, timestamptz),
  public.card_stats(public.rarity, public.card_variant, bigint, bigint), public.pick_video(public.rarity),
  public.booster_state(), public.open_booster() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booster_state(), public.open_booster() TO authenticated;

-- Lecture : le catalogue est public pour les joueurs, les cartes/boosters restent privés
DROP POLICY IF EXISTS "lire le catalogue" ON public.videos;
CREATE POLICY "lire le catalogue" ON public.videos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lire mes cartes" ON public.cards;
CREATE POLICY "lire mes cartes" ON public.cards FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "lire mes boosters" ON public.boosters;
CREATE POLICY "lire mes boosters" ON public.boosters FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "lire le contenu de mes boosters" ON public.booster_items;
CREATE POLICY "lire le contenu de mes boosters" ON public.booster_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boosters b WHERE b.id = booster_id AND b.user_id = (SELECT auth.uid())));

COMMIT;

NOTIFY pgrst, 'reload schema';
