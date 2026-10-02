-- =============================================================================
-- Auth : crée automatiquement la ligne public.users à chaque inscription.
-- À exécuter une fois dans le SQL Editor, après schema.sql.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', 'joueur_' || left(NEW.id::text, 8))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Un joueur peut lire son propre profil (jamais le modifier directement)
DROP POLICY IF EXISTS "lire mon profil" ON public.users;
CREATE POLICY "lire mon profil" ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

COMMIT;
