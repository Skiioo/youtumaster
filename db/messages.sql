-- =============================================================================
-- Messagerie instantanée entre amis : messages privés, non-lus, temps réel, anti-spam.
-- À exécuter une fois dans le SQL Editor, après friends.sql (relançable).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.messages (
  id           bigserial PRIMARY KEY,
  sender_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz,
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS messages_pair ON public.messages
  (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at DESC);
CREATE INDEX IF NOT EXISTS messages_unread ON public.messages (recipient_id) WHERE read_at IS NULL;

-- Lecture : uniquement ses propres conversations. Aucune écriture directe (tout passe par les fonctions).
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lire mes messages" ON public.messages;
CREATE POLICY "lire mes messages" ON public.messages FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (sender_id, recipient_id));
GRANT SELECT ON public.messages TO authenticated;

-- Envoyer un message à un ami (texte nettoyé, 1 à 1000 caractères, 10 messages / 10 s maximum)
CREATE OR REPLACE FUNCTION public.send_message(p_to uuid, p_body text) RETURNS public.messages
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); v_body text := btrim(p_body); m public.messages;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.friend_relation(p_to) <> 'friends' THEN RAISE EXCEPTION 'not_friends'; END IF;
  IF v_body IS NULL OR length(v_body) = 0 OR length(v_body) > 1000 THEN RAISE EXCEPTION 'invalid_message'; END IF;
  IF (SELECT count(*) FROM public.messages
      WHERE sender_id = uid AND created_at > now() - interval '10 seconds') >= 10 THEN
    RAISE EXCEPTION 'too_fast';
  END IF;
  INSERT INTO public.messages (sender_id, recipient_id, body) VALUES (uid, p_to, v_body) RETURNING * INTO m;
  RETURN m;
END $$;

-- Marquer comme lus les messages reçus d'un ami
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_friend uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.messages SET read_at = now()
  WHERE sender_id = p_friend AND recipient_id = auth.uid() AND read_at IS NULL
$$;

-- Liste des conversations : chaque ami, son dernier message et le nombre de non-lus
CREATE OR REPLACE FUNCTION public.my_conversations()
RETURNS TABLE (friend_id uuid, username text, last_body text, last_at timestamptz, last_from_me boolean, unread int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT f.id, f.username, last.body, last.created_at, last.sender_id = auth.uid(),
         (SELECT count(*)::int FROM public.messages m
          WHERE m.sender_id = f.id AND m.recipient_id = auth.uid() AND m.read_at IS NULL)
  FROM public.my_friendships() f
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_id FROM public.messages m
    WHERE (m.sender_id = auth.uid() AND m.recipient_id = f.id)
       OR (m.sender_id = f.id AND m.recipient_id = auth.uid())
    ORDER BY m.created_at DESC, m.id DESC LIMIT 1  -- id : départage les messages de la même milliseconde
  ) last ON true
  WHERE f.relation = 'friends'
  ORDER BY last.created_at DESC NULLS LAST, f.username
$$;

REVOKE ALL ON FUNCTION public.send_message(uuid, text), public.mark_messages_read(uuid), public.my_conversations()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text), public.mark_messages_read(uuid), public.my_conversations()
  TO authenticated;

COMMIT;

-- Temps réel : les nouveaux messages sont poussés au destinataire (la RLS filtre ce que chacun reçoit)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
