import { createBrowserClient } from "@supabase/ssr";

/** Client pour les Client Components (soumis aux règles RLS de l'utilisateur connecté). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
