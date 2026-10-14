-- =============================================================================
-- Amis : ID joueur unique, recherche par ID, demandes d'ami (en attente -> acceptée).
-- Une seule relation par paire de joueurs, quel que soit le sens.
-- À exécuter une fois dans le SQL Editor (relançable).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.friendships (
  requester_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
-- A -> B et B -> A sont la même relation
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair
  ON public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friendships_addressee ON public.friendships (addressee_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lire mes relations" ON public.friendships;
CREATE POLICY "lire mes relations" ON public.friendships FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (requester_id, addressee_id));

-- Relation entre le joueur connecté et un autre : none | sent | received | friends
CREATE OR REPLACE FUNCTION public.friend_relation(p_other uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce((
    SELECT CASE WHEN f.status = 'accepted' THEN 'friends'
                WHEN f.requester_id = auth.uid() THEN 'sent'
                ELSE 'received' END
    FROM public.friendships f
    WHERE (f.requester_id = auth.uid() AND f.addressee_id = p_other)
       OR (f.requester_id = p_other AND f.addressee_id = auth.uid())), 'none')
$$;

-- ID joueur : code unique de 8 caractères (affiché ABCD-2345), sans caractères ambigus
-- (pas de O/0, I/1). 32^8 ≈ 1 100 milliards de codes.
CREATE OR REPLACE FUNCTION public.new_friend_code() RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $fc$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE friend_code = code);
  END LOOP;
  RETURN code;
END $fc$;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS friend_code text;
UPDATE public.users SET friend_code = public.new_friend_code() WHERE friend_code IS NULL;  -- joueurs existants
ALTER TABLE public.users ALTER COLUMN friend_code SET DEFAULT public.new_friend_code();     -- nouveaux joueurs
ALTER TABLE public.users ALTER COLUMN friend_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_friend_code ON public.users (friend_code);

-- Recherche d'un joueur par son ID uniquement (tirets, espaces et minuscules tolérés) : 0 ou 1 résultat.
-- Pas de recherche par pseudo : on ne peut pas parcourir la liste des joueurs.
CREATE OR REPLACE FUNCTION public.search_players(p_q text)
RETURNS TABLE (id uuid, username text, relation text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id, u.username, public.friend_relation(u.id)
  FROM public.users u
  WHERE auth.uid() IS NOT NULL AND u.id <> auth.uid()
    AND u.friend_code = upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g'))
$$;

-- Toutes mes relations (amis, demandes reçues, demandes envoyées) avec les pseudos
CREATE OR REPLACE FUNCTION public.my_friendships()
RETURNS TABLE (id uuid, username text, relation text, since timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id, u.username,
         CASE WHEN f.status = 'accepted' THEN 'friends'
              WHEN f.requester_id = auth.uid() THEN 'sent'
              ELSE 'received' END,
         f.created_at
  FROM public.friendships f
  JOIN public.users u ON u.id = CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END
  WHERE auth.uid() IN (f.requester_id, f.addressee_id)
  ORDER BY u.username
$$;

-- Envoyer une demande. Si l'autre m'avait déjà demandé, on devient amis directement.
CREATE OR REPLACE FUNCTION public.send_friend_request(p_user uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_user = uid OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'invalid_player';
  END IF;
  UPDATE public.friendships SET status = 'accepted'
  WHERE requester_id = p_user AND addressee_id = uid AND status = 'pending';
  IF FOUND THEN RETURN 'friends'; END IF;
  INSERT INTO public.friendships (requester_id, addressee_id) VALUES (uid, p_user)
  ON CONFLICT DO NOTHING;  -- relation déjà existante : rien à faire
  RETURN public.friend_relation(p_user);
END $$;

-- Répondre à une demande reçue : accepter, ou refuser (la demande est supprimée)
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_user uuid, p_accept boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_accept THEN
    UPDATE public.friendships SET status = 'accepted'
    WHERE requester_id = p_user AND addressee_id = auth.uid() AND status = 'pending';
  ELSE
    DELETE FROM public.friendships
    WHERE requester_id = p_user AND addressee_id = auth.uid() AND status = 'pending';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_request'; END IF;
END $$;

-- Retirer un ami ou annuler une demande envoyée
CREATE OR REPLACE FUNCTION public.remove_friend(p_user uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.friendships
  WHERE (requester_id = auth.uid() AND addressee_id = p_user)
     OR (requester_id = p_user AND addressee_id = auth.uid() AND status = 'accepted')
$$;

REVOKE ALL ON FUNCTION public.friend_relation(uuid), public.new_friend_code(), public.search_players(text), public.my_friendships(),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean), public.remove_friend(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_players(text), public.my_friendships(),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean), public.remove_friend(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.friend_relation(uuid), public.new_friend_code() FROM authenticated;
GRANT SELECT ON public.friendships TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
