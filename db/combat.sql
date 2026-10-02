-- =============================================================================
-- Combat 4v4 : défi -> 4 cartes chacun -> tours attaque/quiz jusqu'à K.O. de l'équipe adverse.
-- Tout l'état visible du match vit dans matches.state (lu en temps réel par les 2 joueurs).
-- La bonne réponse reste dans quiz_rounds, jamais lisible par les joueurs.
-- À exécuter une fois dans le SQL Editor, après market.sql.
-- =============================================================================
BEGIN;

INSERT INTO public.game_config (key, value) VALUES
  ('quiz_seconds', '20'),
  ('coins_per_win', '100')
ON CONFLICT DO NOTHING;

-- Bonus Collectif : +10 % par carte en plus partageant pays / créateur / année (max x1,9)
CREATE OR REPLACE FUNCTION public.deck_collectif(p_cards uuid[]) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH d AS (
    SELECT cr.country_code AS country, cr.id AS creator, extract(year FROM v.published_at) AS year
    FROM public.cards c
    JOIN public.videos v ON v.id = c.video_id
    JOIN public.creators cr ON cr.id = v.creator_id
    WHERE c.id = ANY (p_cards)
  )
  SELECT 1 + 0.1 * (
      coalesce((SELECT max(n) FROM (SELECT count(*) n FROM d WHERE country IS NOT NULL GROUP BY country) s), 1) - 1
    + coalesce((SELECT max(n) FROM (SELECT count(*) n FROM d GROUP BY creator) s), 1) - 1
    + coalesce((SELECT max(n) FROM (SELECT count(*) n FROM d GROUP BY year) s), 1) - 1)
$$;

-- Verrouille 4 cartes du joueur pour le match, renvoie leur fiche de combat
CREATE OR REPLACE FUNCTION public.match_take_deck(p_user uuid, p_cards uuid[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE n int; result jsonb;
BEGIN
  IF coalesce(array_length(p_cards, 1), 0) <> 4
     OR (SELECT count(DISTINCT x) FROM unnest(p_cards) x) <> 4 THEN
    RAISE EXCEPTION 'deck_needs_4_cards';
  END IF;
  UPDATE public.cards SET locked_reason = 'match'
  WHERE id = ANY (p_cards) AND owner_id = p_user AND locked_reason IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'cards_unavailable'; END IF;

  SELECT jsonb_object_agg(c.id, jsonb_build_object(
           'owner', c.owner_id, 'video', v.platform_video_id, 'title', v.title,
           'rarity', c.rarity, 'variant', c.variant, 'faction', v.faction_id,
           'attack', c.attack, 'hp', c.defense * 2, 'max_hp', c.defense * 2))
  INTO result
  FROM public.cards c JOIN public.videos v ON v.id = c.video_id
  WHERE c.id = ANY (p_cards);
  RETURN result;
END $$;

-- Créer un défi
CREATE OR REPLACE FUNCTION public.create_match(p_cards uuid[]) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO public.matches (player_a_id, status, state)
  VALUES (uid, 'waiting', jsonb_build_object(
    'phase', 'waiting',
    'cards', public.match_take_deck(uid, p_cards),
    'collectif', jsonb_build_object(uid::text, public.deck_collectif(p_cards))))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Rejoindre un défi : le créateur attaque en premier
CREATE OR REPLACE FUNCTION public.join_match(p_match uuid, p_cards uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); m public.matches;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.status <> 'waiting' THEN RAISE EXCEPTION 'match_unavailable'; END IF;
  IF m.player_a_id = uid THEN RAISE EXCEPTION 'own_match'; END IF;

  UPDATE public.matches SET
    player_b_id = uid,
    status = 'in_progress',
    state = m.state || jsonb_build_object(
      'phase', 'choose',
      'turn', m.player_a_id,
      'cards', (m.state -> 'cards') || public.match_take_deck(uid, p_cards),
      'collectif', (m.state -> 'collectif') || jsonb_build_object(uid::text, public.deck_collectif(p_cards)))
  WHERE id = m.id;
END $$;

-- Attaquer : génère le quiz sur la carte attaquante (stats figées), pour le défenseur
CREATE OR REPLACE FUNCTION public.attack(p_match uuid, p_card uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid(); m public.matches; a jsonb; t jsonb;
  v_views bigint; v_published timestamptz; v_creator text; v_creator_id uuid;
  v_kind text; v_question text; v_choices text[]; v_correct text; y int; y0 int;
  v_defender uuid; v_round uuid; v_expires timestamptz;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.status <> 'in_progress' THEN RAISE EXCEPTION 'match_not_running'; END IF;
  IF m.state ->> 'turn' IS DISTINCT FROM uid::text OR m.state ->> 'phase' <> 'choose' THEN
    RAISE EXCEPTION 'not_your_turn';
  END IF;
  a := m.state -> 'cards' -> p_card::text;
  t := m.state -> 'cards' -> p_target::text;
  IF a IS NULL OR a ->> 'owner' <> uid::text OR (a ->> 'hp')::int <= 0 THEN RAISE EXCEPTION 'invalid_attacker'; END IF;
  IF t IS NULL OR t ->> 'owner' = uid::text OR (t ->> 'hp')::int <= 0 THEN RAISE EXCEPTION 'invalid_target'; END IF;

  SELECT c.snap_view_count, v.published_at, cr.name, cr.id
  INTO v_views, v_published, v_creator, v_creator_id
  FROM public.cards c
  JOIN public.videos v ON v.id = c.video_id
  JOIN public.creators cr ON cr.id = v.creator_id
  WHERE c.id = p_card;

  v_kind := (ARRAY['creator', 'views', 'year'])[1 + floor(random() * 3)::int];
  IF v_kind = 'creator' THEN
    v_question := 'Qui a publié cette vidéo ?';
    v_correct := v_creator;
    v_choices := v_creator || ARRAY(
      SELECT DISTINCT ON (name) name FROM (
        SELECT name FROM public.creators WHERE id <> v_creator_id AND name <> v_creator ORDER BY random() LIMIT 10
      ) s LIMIT 3);
  ELSIF v_kind = 'views' THEN
    v_question := 'Combien de vues a cette vidéo ?';
    v_choices := ARRAY['Moins de 1 M', '1 M à 10 M', '10 M à 100 M', 'Plus de 100 M'];
    v_correct := v_choices[CASE WHEN v_views < 1e6 THEN 1 WHEN v_views < 1e7 THEN 2
                                WHEN v_views < 1e8 THEN 3 ELSE 4 END];
  ELSE
    v_question := 'En quelle année cette vidéo a-t-elle été publiée ?';
    y := extract(year FROM v_published);
    -- 4 années consécutives contenant la bonne, sans dépasser l'année en cours
    y0 := least(y - floor(random() * 4)::int, extract(year FROM now())::int - 3);
    v_choices := ARRAY(SELECT (y0 + i)::text FROM generate_series(0, 3) i);
    v_correct := y::text;
  END IF;
  v_choices := ARRAY(SELECT x FROM unnest(v_choices) x ORDER BY random());

  v_defender := CASE WHEN uid = m.player_a_id THEN m.player_b_id ELSE m.player_a_id END;
  v_expires := now() + make_interval(secs => public.cfg('quiz_seconds'));
  INSERT INTO public.quiz_rounds (match_id, turn, attacker_card_id, defender_id, question, correct_choice, expires_at)
  VALUES (m.id,
          (SELECT coalesce(max(turn), 0) + 1 FROM public.quiz_rounds WHERE match_id = m.id),
          p_card, v_defender,
          jsonb_build_object('target', p_target, 'choices', to_jsonb(v_choices)),
          array_position(v_choices, v_correct), v_expires)
  RETURNING id INTO v_round;

  -- La carte attaquante n'est pas révélée : seulement sa miniature
  UPDATE public.matches SET state = m.state || jsonb_build_object(
    'phase', 'quiz',
    'quiz', jsonb_build_object(
      'round', v_round, 'video', a ->> 'video', 'target', p_target,
      'question', v_question, 'choices', to_jsonb(v_choices), 'expires_at', v_expires))
  WHERE id = m.id;
END $$;

-- Résout un tour (réponse ou temps écoulé), applique les dégâts, passe la main ou termine
CREATE OR REPLACE FUNCTION public.match_resolve(p_match uuid, p_choice int) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  m public.matches; r public.quiz_rounds; a jsonb; t jsonb; st jsonb;
  v_target text; v_ok boolean; v_mult numeric; v_dmg int; v_attacker uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match;
  SELECT * INTO r FROM public.quiz_rounds WHERE id = (m.state -> 'quiz' ->> 'round')::uuid;
  v_target := r.question ->> 'target';
  a := m.state -> 'cards' -> r.attacker_card_id::text;
  t := m.state -> 'cards' -> v_target;
  v_attacker := (a ->> 'owner')::uuid;

  -- 2 s de tolérance pour la latence réseau
  v_ok := p_choice IS NOT NULL AND p_choice = r.correct_choice AND now() <= r.expires_at + interval '2 seconds';
  v_mult := CASE
    WHEN (SELECT beats_id FROM public.factions WHERE id = (a ->> 'faction')::int) = (t ->> 'faction')::int THEN 1.5
    WHEN (SELECT beats_id FROM public.factions WHERE id = (t ->> 'faction')::int) = (a ->> 'faction')::int THEN 0.75
    ELSE 1 END;
  v_dmg := CASE WHEN v_ok THEN 0
    ELSE round((a ->> 'attack')::int * v_mult * (m.state -> 'collectif' ->> v_attacker::text)::numeric) END;

  UPDATE public.quiz_rounds
  SET answered_choice = p_choice, is_correct = v_ok, damage_dealt = v_dmg, answered_at = now()
  WHERE id = r.id;

  st := jsonb_set(m.state, ARRAY['cards', v_target, 'hp'], to_jsonb(greatest(0, (t ->> 'hp')::int - v_dmg)));
  st := (st - 'quiz') || jsonb_build_object(
    'phase', 'choose',
    'turn', r.defender_id,
    'last', jsonb_build_object(
      'attacker', r.attacker_card_id, 'target', v_target, 'correct', v_ok, 'damage', v_dmg,
      'answer', (r.question -> 'choices') ->> (r.correct_choice - 1)));

  IF EXISTS (SELECT 1 FROM jsonb_each(st -> 'cards') e
             WHERE e.value ->> 'owner' = r.defender_id::text AND (e.value ->> 'hp')::int > 0) THEN
    UPDATE public.matches SET state = st WHERE id = m.id;
    RETURN;
  END IF;

  -- Victoire de l'attaquant
  UPDATE public.matches
  SET state = st || '{"phase": "finished"}', status = 'finished', winner_id = v_attacker, finished_at = now()
  WHERE id = m.id;
  UPDATE public.cards SET locked_reason = NULL
  WHERE id IN (SELECT key::uuid FROM jsonb_each(st -> 'cards'));
  UPDATE public.users SET viewcoins = viewcoins + public.cfg('coins_per_win') WHERE id = v_attacker;
  INSERT INTO public.coin_ledger (user_id, delta, reason, ref_id)
  VALUES (v_attacker, public.cfg('coins_per_win'), 'match_win', m.id);
END $$;

-- Le défenseur répond (numéro de choix à partir de 1)
CREATE OR REPLACE FUNCTION public.answer_quiz(p_match uuid, p_choice int) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.matches;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.state ->> 'phase' IS DISTINCT FROM 'quiz' THEN RAISE EXCEPTION 'no_quiz'; END IF;
  IF (SELECT defender_id FROM public.quiz_rounds WHERE id = (m.state -> 'quiz' ->> 'round')::uuid)
     IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_your_turn';
  END IF;
  PERFORM public.match_resolve(m.id, p_choice);
END $$;

-- Temps écoulé : n'importe quel joueur du match peut déclencher la résolution
CREATE OR REPLACE FUNCTION public.resolve_quiz_timeout(p_match uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.matches;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF FOUND AND m.state ->> 'phase' = 'quiz'
     AND auth.uid() IN (m.player_a_id, m.player_b_id)
     AND (m.state -> 'quiz' ->> 'expires_at')::timestamptz < now() THEN
    PERFORM public.match_resolve(m.id, NULL);
  END IF;
END $$;

-- Annuler son défi tant que personne ne l'a relevé : les 4 cartes sont libérées
CREATE OR REPLACE FUNCTION public.cancel_match(p_match uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.matches;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.status <> 'waiting' OR m.player_a_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'match_unavailable';
  END IF;
  UPDATE public.matches SET status = 'aborted', finished_at = now() WHERE id = m.id;
  UPDATE public.cards SET locked_reason = NULL
  WHERE id IN (SELECT key::uuid FROM jsonb_each(m.state -> 'cards'));
END $$;

-- Rafraîchit les cartes périmées depuis le cache vidéo (appelée côté serveur avant un match)
CREATE OR REPLACE FUNCTION public.refresh_stale_cards(p_cards uuid[]) RETURNS void
LANGUAGE sql VOLATILE SET search_path = '' AS $$
  UPDATE public.cards c SET
    snap_view_count = v.view_count, snap_like_count = v.like_count, last_updated_at = now(),
    (attack, defense) = (SELECT s.attack, s.defense FROM public.card_stats(c.rarity, c.variant, v.view_count, v.like_count) s)
  FROM public.videos v
  WHERE c.id = ANY (p_cards) AND v.id = c.video_id
    AND c.last_updated_at < now() - make_interval(hours => public.cfg('combat_stale_after_hours')::int)
$$;

REVOKE ALL ON FUNCTION public.deck_collectif(uuid[]), public.match_take_deck(uuid, uuid[]),
  public.create_match(uuid[]), public.join_match(uuid, uuid[]), public.attack(uuid, uuid, uuid),
  public.match_resolve(uuid, int), public.answer_quiz(uuid, int), public.resolve_quiz_timeout(uuid),
  public.refresh_stale_cards(uuid[]), public.cancel_match(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_match(uuid[]), public.join_match(uuid, uuid[]),
  public.attack(uuid, uuid, uuid), public.answer_quiz(uuid, int), public.resolve_quiz_timeout(uuid),
  public.cancel_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_stale_cards(uuid[]) TO service_role;

-- Les joueurs lisent leurs matchs, et les défis ouverts (pour les rejoindre)
DROP POLICY IF EXISTS "lire mes matchs et les défis ouverts" ON public.matches;
CREATE POLICY "lire mes matchs et les défis ouverts" ON public.matches FOR SELECT TO authenticated
  USING (status = 'waiting' OR (SELECT auth.uid()) IN (player_a_id, player_b_id));

COMMIT;

-- Temps réel : chaque mise à jour d'un match est poussée aux deux joueurs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'matches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
