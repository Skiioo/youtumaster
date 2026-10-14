-- =============================================================================
-- Temps réel sur `users` : le compteur de ViewCoins se met à jour instantanément
-- (booster, enchère, remboursement, vente clôturée, victoire…).
-- La RLS "lire mon profil" garantit que chacun ne reçoit que sa propre ligne.
-- À exécuter une fois dans le SQL Editor (relançable).
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'users') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END $$;
