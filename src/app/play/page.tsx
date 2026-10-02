import Link from "next/link";
import { DeckPicker } from "@/components/DeckPicker";
import { createMatch } from "@/app/match/actions";
import { createClient } from "@/lib/supabase/server";

export default async function PlayPage({ searchParams }: PageProps<"/play">) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: matches } = await supabase
    .from("matches")
    .select("id, status, player_a_id, player_b_id, created_at")
    .in("status", ["waiting", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(50);

  const mine = matches?.filter((m) => [m.player_a_id, m.player_b_id].includes(user?.id)) ?? [];
  const open = matches?.filter((m) => m.status === "waiting" && m.player_a_id !== user?.id) ?? [];

  return (
    <main style={{ padding: 24 }}>
      <h1>Combat</h1>
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {mine.length > 0 && (
        <>
          <h2>Mes matchs</h2>
          <ul>
            {mine.map((m) => (
              <li key={m.id}>
                <Link href={`/match/${m.id}`}>{m.status === "waiting" ? "Défi en attente" : "Match en cours"}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Défis ouverts</h2>
      {open.length === 0 ? (
        <p>Aucun défi ouvert. Crée le tien ci-dessous !</p>
      ) : (
        <ul>
          {open.map((m) => (
            <li key={m.id}>
              <Link href={`/match/${m.id}`}>Relever le défi du {new Date(m.created_at).toLocaleString("fr-FR")}</Link>
            </li>
          ))}
        </ul>
      )}

      <h2>Créer un défi</h2>
      <DeckPicker action={createMatch} label="Créer le défi" />
    </main>
  );
}
