import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { setActiveTitle } from "./actions";

type Progress = { album_id: number; title: string; riddle: string; owned: number; total: number; unlocked: boolean };
type OwnedTitle = { titles: { id: number; name: string } };

export default async function QuestsPage({ searchParams }: PageProps<"/quests">) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: newTitles } = await supabase.rpc("claim_albums"); // débloque les albums complétés
  const [{ data: progress }, { data: owned }, { data: me }] = await Promise.all([
    supabase.rpc("album_progress"),
    supabase.from("user_titles").select("titles(id, name)").returns<OwnedTitle[]>(),
    supabase.from("users").select("active_title_id").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  const albums = progress as Progress[] | null;

  return (
    <main style={{ padding: 24 }}>
      <h1>Quêtes</h1>
      {!!newTitles && <p role="status">🎉 {newTitles} nouveau(x) titre(s) débloqué(s) !</p>}
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {!albums?.length && <p>Aucune quête pour l&apos;instant.</p>}
      <ul style={{ display: "grid", gap: 16, listStyle: "none", padding: 0 }}>
        {albums?.map((a) => (
          <li key={a.album_id} style={{ border: "1px solid #888", borderRadius: 8, padding: 12 }}>
            <strong>{a.unlocked ? "✅" : "🔒"} Titre : {a.title}</strong>
            <p style={{ fontStyle: "italic" }}>« {a.riddle} »</p>
            <meter min={0} max={a.total} value={a.owned} /> <small>{a.owned}/{a.total} cartes</small>
          </li>
        ))}
      </ul>

      {!!owned?.length && (
        <form action={setActiveTitle}>
          <h2>Mon titre affiché</h2>
          <select name="title" defaultValue={me?.active_title_id ?? ""}>
            <option value="">Aucun</option>
            {owned.map(({ titles: t }) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>{" "}
          <button>Afficher</button>
        </form>
      )}
      <p><Link href="/">← Retour</Link></p>
    </main>
  );
}
