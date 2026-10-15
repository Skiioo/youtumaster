-- =============================================================================
-- Matchmaking : un joueur lance une recherche ; dès qu'un autre joueur cherche aussi,
-- ils sont appariés et la partie démarre. Remplace les "défis ouverts".
-- Une recherche = un match 'waiting' sans invité, maintenu en vie par un signal (last_seen_at)
-- envoyé toutes les 15 s par l'écran de recherche ; sans signal depuis 45 s, elle est abandonnée.
-- À exécuter une fois dans le SQL Editor, après combat_friends.sql (relançable).
-- =============================================================================
BEGIN;

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS matches_searching ON public.matches (created_at)
  WHERE status = 'waiting' AND invited_id IS NULL;

-- Retire de la file les recherches dont l'écran est fermé depuis 45 s (cartes libérées)
CREATE OR REPLACE FUNCTION public.abort_stale_searches() RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE m public.matches;
BEGIN
  FOR m IN SELECT * FROM public.matches
           WHERE status = 'waiting' AND invited_id IS NULL AND last_seen_at < now() - interval '45 seconds'
           FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.matches SET status = 'aborted', finished_at = now() WHERE id = m.id;
    UPDATE public.cards SET locked_reason = NULL WHERE id IN (SELECT key::uuid FROM jsonb_each(m.state -> 'cards'));
  END LOOP;
END $$;

-- Lancer une recherche : rejoint le plus ancien joueur en recherche, sinon entre dans la file.
-- Renvoie l'id du match (en cours si apparié, en attente sinon).
CREATE OR REPLACE FUNCTION public.find_match(p_cards uuid[]) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); v_id uuid; other public.matches;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.abort_stale_searches();

  -- Déjà en recherche : on reprend la même
  SELECT id INTO v_id FROM public.matches
  WHERE player_a_id = uid AND status = 'waiting' AND invited_id IS NULL LIMIT 1;
  IF FOUND THEN
    UPDATE public.matches SET last_seen_at = now() WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- Un adversaire attend : on le rejoint (SKIP LOCKED : deux joueurs ne prennent pas le même)
  SELECT * INTO other FROM public.matches
  WHERE status = 'waiting' AND invited_id IS NULL AND player_a_id <> uid
    AND last_seen_at > now() - interval '45 seconds'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF FOUND THEN
    PERFORM public.join_match(other.id, p_cards);
    RETURN other.id;
  END IF;

  -- Personne : on entre dans la file
  RETURN public.create_match(p_cards, NULL);
END $$;

-- Signal de l'écran de recherche (toutes les 15 s). Renvoie le match où aller :
-- le même (toujours en recherche ou démarré), un autre (rattrapage), ou NULL (recherche annulée).
CREATE OR REPLACE FUNCTION public.search_heartbeat(p_match uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); mine public.matches; other public.matches; v_cards uuid[];
BEGIN
  SELECT * INTO mine FROM public.matches WHERE id = p_match AND player_a_id = uid FOR UPDATE;
  IF NOT FOUND OR mine.status = 'aborted' THEN RETURN NULL; END IF;
  IF mine.status <> 'waiting' OR mine.invited_id IS NOT NULL THEN RETURN mine.id; END IF;
  UPDATE public.matches SET last_seen_at = now() WHERE id = mine.id;

  -- Rattrapage : deux recherches lancées au même instant ne se sont pas vues.
  -- La plus récente rejoint la plus ancienne (jamais l'inverse : pas de double fusion).
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

REVOKE ALL ON FUNCTION public.abort_stale_searches() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_match(uuid[]), public.search_heartbeat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_match(uuid[]), public.search_heartbeat(uuid) TO authenticated;

-- Lecture : ses matchs, et les défis d'amis qui nous sont adressés. Les recherches des autres
-- joueurs ne sont plus visibles (l'appariement se fait dans find_match).
DROP POLICY IF EXISTS "lire mes matchs et les défis ouverts" ON public.matches;
DROP POLICY IF EXISTS "lire mes matchs et mes défis" ON public.matches;
CREATE POLICY "lire mes matchs et mes défis" ON public.matches FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IN (player_a_id, player_b_id)
    OR (status = 'waiting' AND invited_id = (SELECT auth.uid()))
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
