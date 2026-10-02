-- =============================================================================
-- Jeton de Refresh : met à jour une carte avec les dernières stats de sa vidéo
-- (déjà rafraîchie par l'API côté serveur) et peut faire MONTER sa rareté, jamais baisser.
-- À exécuter une fois dans le SQL Editor, après combat.sql.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.use_refresh_token(p_card uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.users; c public.cards; v public.videos; st record;
  v_rarity public.rarity; v_variant public.card_variant;
BEGIN
  SELECT * INTO u FROM public.users WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF u.refresh_tokens < 1 THEN RAISE EXCEPTION 'no_refresh_token'; END IF;

  SELECT * INTO c FROM public.cards WHERE id = p_card AND owner_id = u.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_your_card'; END IF;
  IF c.locked_reason = 'match' THEN RAISE EXCEPTION 'card_locked'; END IF;
  SELECT * INTO v FROM public.videos WHERE id = c.video_id;

  v_rarity := greatest(c.rarity, v.current_rarity);
  -- Une carte qui devient GOAT prend le design Arc-en-ciel
  v_variant := CASE WHEN v_rarity = 'goat' AND c.variant = 'normal' THEN 'rainbow' ELSE c.variant END;
  SELECT * INTO st FROM public.card_stats(v_rarity, v_variant, v.view_count, v.like_count);

  UPDATE public.users SET refresh_tokens = refresh_tokens - 1 WHERE id = u.id;
  UPDATE public.cards SET
    rarity = v_rarity, variant = v_variant,
    goat_reason = CASE WHEN v_rarity <> 'goat' THEN NULL
                       WHEN EXISTS (SELECT 1 FROM public.goat_whitelist w WHERE w.platform_video_id = v.platform_video_id)
                         THEN 'whitelist'::public.goat_reason
                       ELSE 'absolute_views' END,
    snap_view_count = v.view_count, snap_like_count = v.like_count,
    attack = st.attack, defense = st.defense, last_updated_at = now()
  WHERE id = c.id;

  INSERT INTO public.card_refresh_log (card_id, cause, old_views, new_views, old_rarity, new_rarity, api_called)
  VALUES (c.id, 'refresh_token', c.snap_view_count, v.view_count, c.rarity, v_rarity, true);
END $$;

REVOKE ALL ON FUNCTION public.use_refresh_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_refresh_token(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
