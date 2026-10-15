import { createClient } from "@/lib/supabase/server";

/**
 * Quitter une partie à la fermeture / au rechargement de l'onglet (envoyé par navigator.sendBeacon).
 * Corps : l'id du match en texte brut. La fonction SQL vérifie que l'appelant est bien un joueur.
 */
export async function POST(request: Request) {
  const matchId = (await request.text()).trim();
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return new Response(null, { status: 400 });
  const supabase = await createClient();
  await supabase.rpc("leave_match", { p_match: matchId });
  return new Response(null, { status: 204 });
}
