-- =============================================================================
-- Cosmétiques de mécène (aucun avantage de jeu). Un mécène actif (ou un admin)
-- peut équiper tous les cosmétiques `patron_only`.
--   badge      : name = texte affiché à côté du pseudo
--   name_color : asset_path = couleur CSS du pseudo
--   card_back  : asset_path = image PNG du dos de carte (dans /public)
-- Se donner le rôle admin : UPDATE users SET role = 'admin' WHERE username = 'tonpseudo';
-- À exécuter une fois dans le SQL Editor.
-- =============================================================================
BEGIN;

INSERT INTO public.cosmetics (kind, code, name, asset_path) VALUES
  ('badge',      'badge_patron',  '⭐ Mécène',    NULL),
  ('badge',      'badge_heart',   '💜 Soutien',   NULL),
  ('name_color', 'color_gold',    'Or',          '#E0A800'),
  ('name_color', 'color_ruby',    'Rubis',       '#E0115F'),
  ('name_color', 'color_emerald', 'Émeraude',    '#10B981'),
  ('card_back',  'back_patron',   'Dos Mécène',  '/card-backs/patron.png')
ON CONFLICT (code) DO NOTHING;

DROP POLICY IF EXISTS "lire les cosmétiques" ON public.cosmetics;
CREATE POLICY "lire les cosmétiques" ON public.cosmetics FOR SELECT TO authenticated USING (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
