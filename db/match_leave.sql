-- =============================================================================
-- Quitter une partie l'annule (pas de reprise possible) :
--   - recherche / défi d'ami en attente  -> partie annulée, cartes libérées
--   - partie en cours                    -> abandon : l'adversaire gagne
-- Chaque joueur envoie un signal toutes les 15 s depuis l'écran du match ; sans signal
-- depuis 45 s (onglet fermé, retour arrière…), on considère qu'il a quitté.
-- À exécuter une fois dans le SQL Editor, après matchmaking.sql (relançable).
-- =============================================================================
BEGIN;

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS last_seen_b timestamptz NOT NULL DEFAULT now();

-- Au démarrage de la partie, les deux joueurs repartent avec un signal "frais"
CREATE OR REPLACE FUNCTION public.match_started_seen() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'waiting' AND NEW.status = 'in_progress' THEN
    NEW.last_seen_at := now();  -- joueur A (créateur)
    NEW.last_seen_b := now();   -- joueur B
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS match_started_seen ON public.matches;
CREATE TRIGGER match_started_seen BEFORE UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.match_started_seen();

-- Fin de partie par abandon de p_loser : l'adversaire gagne (et ses ViewCoins), cartes libérées
CREATE OR REPLACE FUNCTION public.match_forfeit(p_match uuid, p_loser uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE m public.matches; v_winner uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.status <> 'in_progress' THEN RETURN; END IF;
  v_winner := CASE WHEN p_loser = m.player_a_id THEN m.player_b_id ELSE m.player_a_id END;
  UPDATE public.matches
  SET status = 'finished', winner_id = v_winner, finished_at = now(),
      state = (m.state - 'quiz') || jsonb_build_object('phase', 'finished', 'forfeit', p_loser)
  WHERE id = m.id;
  UPDATE public.cards SET locked_reason = NULL WHERE id IN (SELECT key::uuid FROM jsonb_each(m.state -> 'cards'));
  UPDATE public.users SET viewcoins = viewcoins + public.cfg('coins_per_win') WHERE id = v_winner;
  INSERT INTO public.coin_ledger (user_id, delta, reason, ref_id) VALUES (v_winner, public.cfg('coins_per_win'), 'match_win', m.id);
END $$;

-- Annulation d'une partie en attente (recherche ou défi d'ami) : cartes libérées
CREATE OR REPLACE FUNCTION public.match_abort(p_match uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE m public.matches;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.status <> 'waiting' THEN RETURN; END IF;
  UPDATE public.matches SET status = 'aborted', finished_at = now() WHERE id = m.id;
  UPDATE public.cards SET locked_reason = NULL WHERE id IN (SELECT key::uuid FROM jsonb_each(m.state -> 'cards'));
END $$;

-- L'abandon volontaire passe par la même fin de partie
CREATE OR REPLACE FUNCTION public.forfeit_match(p_match uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.matches;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match;
  IF NOT FOUND OR m.status <> 'in_progress' OR auth.uid() NOT IN (m.player_a_id, m.player_b_id) THEN
    RAISE EXCEPTION 'match_not_running';
  END IF;
  PERFORM public.match_forfeit(m.id, auth.uid());
END $$;

-- Quitter la partie (navigation confirmée, onglet fermé) : annulation ou abandon selon l'état
CREATE OR REPLACE FUNCTION public.leave_match(p_match uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); m public.matches;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match;
  IF NOT FOUND OR uid IS NULL OR uid NOT IN (m.player_a_id, coalesce(m.player_b_id, m.player_a_id)) THEN RETURN; END IF;
  IF m.status = 'waiting' AND m.player_a_id = uid THEN PERFORM public.match_abort(m.id);
  ELSIF m.status = 'in_progress' THEN PERFORM public.match_forfeit(m.id, uid);
  END IF;
END $$;

-- Retire les parties en attente dont le créateur n'envoie plus de signal (recherche ET défi d'ami)
CREATE OR REPLACE FUNCTION public.abort_stale_searches() RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.matches
              WHERE status = 'waiting' AND last_seen_at < now() - interval '45 seconds'
              FOR UPDATE SKIP LOCKED LOOP
    PERFORM public.match_abort(v_id);
  END LOOP;
END $$;

-- Signal de l'écran d'un match (toutes les 15 s). Renvoie le match où aller, NULL si la partie
-- n'existe plus pour ce joueur. En cours de partie, un adversaire silencieux depuis 45 s a quitté.
CREATE OR REPLACE FUNCTION public.search_heartbeat(p_match uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); mine public.matches; other public.matches; v_cards uuid[];
BEGIN
  SELECT * INTO mine FROM public.matches WHERE id = p_match AND uid IN (player_a_id, player_b_id) FOR UPDATE;
  IF NOT FOUND OR mine.status = 'aborted' THEN RETURN NULL; END IF;
  IF mine.status = 'finished' THEN RETURN mine.id; END IF;

  -- Partie en cours : mon signal, puis l'adversaire a-t-il quitté ?
  IF mine.status = 'in_progress' THEN
    IF uid = mine.player_a_id THEN
      UPDATE public.matches SET last_seen_at = now() WHERE id = mine.id;
      IF mine.last_seen_b < now() - interval '45 seconds' THEN PERFORM public.match_forfeit(mine.id, mine.player_b_id); END IF;
    ELSE
      UPDATE public.matches SET last_seen_b = now() WHERE id = mine.id;
      IF mine.last_seen_at < now() - interval '45 seconds' THEN PERFORM public.match_forfeit(mine.id, mine.player_a_id); END IF;
    END IF;
    RETURN mine.id;
  END IF;

  -- En attente : seul le créateur maintient la partie
  IF uid <> mine.player_a_id THEN RETURN mine.id; END IF;
  UPDATE public.matches SET last_seen_at = now() WHERE id = mine.id;
  IF mine.invited_id IS NOT NULL THEN RETURN mine.id; END IF;

  -- Recherche : rattrapage de deux recherches lancées au même instant (la plus récente rejoint l'autre)
  SELECT * INTO other FROM public.matches
  WHERE status = 'waiting' AND invited_id IS NULL AND player_a_id <> uid
    AND last_seen_at > now() - interval '45 seconds' AND created_at < mine.created_at
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN RETURN mine.id; END IF;

  v_cards := ARRAY(SELECT key::uuid FROM jsonb_each(mine.state -> 'cards'));
  UPDATE public.cards SET locked_reason = NULL WHERE id = ANY (v_cards);
  UPDATE public.matches SET status = 'aborted', finished_at = now() WHERE id = mine.id;
  PERFORM public.join_match(other.id, v_cards);
  RETURN other.id;
END $$;

-- Relever un défi d'ami : refusé si le créateur a quitté (plus de signal)
CREATE OR REPLACE FUNCTION public.join_match_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'waiting' AND NEW.status = 'in_progress' AND OLD.last_seen_at < now() - interval '45 seconds' THEN
    RAISE EXCEPTION 'match_unavailable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS join_match_guard ON public.matches;
CREATE TRIGGER join_match_guard BEFORE UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.join_match_guard();

REVOKE ALL ON FUNCTION public.match_forfeit(uuid, uuid), public.match_abort(uuid), public.abort_stale_searches(),
  public.match_started_seen(), public.join_match_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_match(uuid), public.forfeit_match(uuid), public.search_heartbeat(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
