import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client avec la clé secrète : contourne RLS. Réservé aux jobs serveur
 * (moissonnage du catalogue, clôture des enchères, ouverture de boosters).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
