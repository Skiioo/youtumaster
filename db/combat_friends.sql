-- =============================================================================
-- Combat entre amis : défi réservé à un ami, pseudos dans le match, abandon.
-- À exécuter une fois dans le SQL Editor, après combat.sql et friends.sql (relançable).
-- =============================================================================
BEGIN;

-- Défi réservé à un joueur précis (NULL = défi ouvert à tous)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS invited_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS matches_invited ON public.matches (invited_id) WHERE status = 'waiting';

-- Créer un défi, ouvert ou réservé à un ami. Les pseudos sont enregistrés dans state.names.
DROP FUNCTION IF EXISTS public.create_match(uuid[]);
CREATE OR REPLACE FUNCTION public.create_match(p_cards uuid[], p_invite uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_invite IS NOT NULL AND public.friend_relation(p_invite) <> 'friends' THEN
    RAISE EXCEPTION 'not_friends';
  END IF;
  INSERT INTO public.matches (player_a_id, invited_id, status, state)
  VALUES (uid, p_invite, 'waiting', jsonb_build_object(
    'phase', 'waiting',
    'cards', public.match_take_deck(uid, p_cards),
    'collectif', jsonb_build_object(uid::text, public.deck_collectif(p_cards)),
    'names', jsonb_build_object(uid::text, (SELECT username FROM public.users WHERE id = uid))))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Rejoindre : un défi réservé ne peut être relevé que par l'ami invité. Le créateur attaque en premier.
CREATE OR REPLACE FUNCTION public.join_match(p_match uuid, p_cards uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); m public.matches;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.status <> 'waiting' THEN RAISE EXCEPTION 'match_unavailable'; END IF;
  IF m.player_a_id = uid THEN RAISE EXCEPTION 'own_match'; END IF;
  IF m.invited_id IS NOT NULL AND m.invited_id <> uid THEN RAISE EXCEPTION 'match_unavailable'; END IF;

  UPDATE public.matches SET
    player_b_id = uid,
    status = 'in_progress',
    state = m.state || jsonb_build_object(
      'phase', 'choose',
      'turn', m.player_a_id,
      'cards', (m.state -> 'cards') || public.match_take_deck(uid, p_cards),
      'collectif', (m.state -> 'collectif') || jsonb_build_object(uid::text, public.deck_collectif(p_cards)),
      'names', coalesce(m.state -> 'names', '{}') || jsonb_build_object(uid::text, (SELECT username FROM public.users WHERE id = uid)))
  WHERE id = m.id;
END $$;

-- Abandonner un match en cours : l'adversaire gagne (et ses ViewCoins), les cartes sont libérées
CREATE OR REPLACE FUNCTION public.forfeit_match(p_match uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); m public.matches; v_winner uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.status <> 'in_progress' OR uid NOT IN (m.player_a_id, m.player_b_id) THEN
    RAISE EXCEPTION 'match_not_running';
  END IF;
  v_winner := CASE WHEN uid = m.player_a_id THEN m.player_b_id ELSE m.player_a_id END;

  UPDATE public.matches
  SET status = 'finished', winner_id = v_winner, finished_at = now(),
      state = (m.state - 'quiz') || jsonb_build_object('phase', 'finished', 'forfeit', uid)
  WHERE id = m.id;
  UPDATE public.cards SET locked_reason = NULL WHERE id IN (SELECT key::uuid FROM jsonb_each(m.state -> 'cards'));
  UPDATE public.users SET viewcoins = viewcoins + public.cfg('coins_per_win') WHERE id = v_winner;
  INSERT INTO public.coin_ledger (user_id, delta, reason, ref_id)
  VALUES (v_winner, public.cfg('coins_per_win'), 'match_win', m.id);
END $$;

REVOKE ALL ON FUNCTION public.create_match(uuid[], uuid), public.forfeit_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match(uuid[], uuid), public.join_match(uuid, uuid[]), public.forfeit_match(uuid)
  TO authenticated;

-- Lecture : ses matchs, les défis ouverts, et les défis qui nous sont réservés (pas ceux réservés aux autres)
DROP POLICY IF EXISTS "lire mes matchs et les défis ouverts" ON public.matches;
CREATE POLICY "lire mes matchs et les défis ouverts" ON public.matches FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IN (player_a_id, player_b_id)
    OR (status = 'waiting' AND (invited_id IS NULL OR invited_id = (SELECT auth.uid())))
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
