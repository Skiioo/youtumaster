import { createBrowserClient } from "@supabase/ssr";

/** Client pour les Client Components (soumis aux règles RLS de l'utilisateur connecté). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

/**
 * Écoute en temps réel les changements d'une table (filtre au format Realtime : "colonne=eq.valeur").
 * La session est chargée AVANT de s'abonner : sinon Realtime se connecte en anonyme et la RLS
 * bloque tous les événements. Renvoie la fonction de désabonnement (cleanup d'un useEffect).
 */
export function subscribeToChanges(
  event: "INSERT" | "UPDATE",
  table: string,
  filter: string,
  onChange: (row: Record<string, unknown>) => void,
) {
  const supabase = createClient();
  let cleanup = () => {};
  let cancelled = false;

  supabase.auth.getSession().then(async ({ data }) => {
    if (data.session) await supabase.realtime.setAuth(data.session.access_token);
    if (cancelled) return; // composant démonté pendant le chargement de la session
    const channel = supabase
      // Nom unique : deux composants peuvent écouter la même table avec le même filtre sans conflit
      .channel(`${table}-${event}-${filter}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event, schema: "public", table, filter }, (payload) => onChange(payload.new))
      .subscribe();
    cleanup = () => supabase.removeChannel(channel);
  });

  return () => {
    cancelled = true;
    cleanup();
  };
}

/** Écoute les mises à jour d'une ligne précise (par id). */
export const subscribeToUpdates = (table: string, id: string, onUpdate: (row: Record<string, unknown>) => void) =>
  subscribeToChanges("UPDATE", table, `id=eq.${id}`, onUpdate);
