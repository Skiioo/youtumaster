import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addGoat, createAlbum, removeGoat, setPatron } from "./actions";

const box = { border: "1px solid #888", borderRadius: 8, padding: 12, display: "grid", gap: 8, maxWidth: 600 } as const;

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { msg } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("users").select("role").eq("id", user?.id ?? "").maybeSingle();
  if (me?.role !== "admin") notFound();

  const db = createAdminClient();
  const [{ data: goats }, { data: albums }, { data: patrons }] = await Promise.all([
    db.from("goat_whitelist").select("platform_video_id, reason, added_at").order("added_at", { ascending: false }).limit(100),
    db.from("albums").select("id, riddle, titles(name), album_requirements(count)").order("id", { ascending: false }),
    db.from("users").select("username, patron_until").eq("role", "patron").order("username"),
  ]);

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <h1>Admin</h1>
      {msg && <p role="status">{msg}</p>}

      <section style={box}>
        <h2>Whitelist GOAT</h2>
        <form action={addGoat} style={{ display: "grid", gap: 8 }}>
          <input name="video" placeholder="Lien ou ID de la vidéo" required />
          <input name="reason" placeholder="Pourquoi elle est culte" required />
          <button>Ajouter</button>
        </form>
        <ul>
          {goats?.map((g) => (
            <li key={g.platform_video_id}>
              <form action={removeGoat} style={{ display: "inline" }}>
                <input type="hidden" name="video" value={g.platform_video_id} />
                <code>{g.platform_video_id}</code> — {g.reason} <button>Retirer</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section style={box}>
        <h2>Nouvel album</h2>
        <form action={createAlbum} style={{ display: "grid", gap: 8 }}>
          <input name="title" placeholder="Titre à débloquer" required />
          <input name="riddle" placeholder="Énigme" required />
          <textarea name="videos" rows={4} placeholder="Liens ou IDs des vidéos (un par ligne)" required />
          <button>Créer</button>
        </form>
        <ul>
          {albums?.map((a) => {
            const title = a.titles as unknown as { name: string } | null;
            const count = (a.album_requirements as unknown as { count: number }[])[0]?.count ?? 0;
            return <li key={a.id}><strong>{title?.name}</strong> — « {a.riddle} » ({count} cartes)</li>;
          })}
        </ul>
      </section>

      <section style={box}>
        <h2>Mécènes</h2>
        <form action={setPatron} style={{ display: "grid", gap: 8 }}>
          <input name="username" placeholder="Pseudo du joueur" required />
          <label>Durée en mois (vide = sans limite) <input name="months" type="number" min={1} style={{ width: 80 }} /></label>
          <label><input type="checkbox" name="remove" /> Retirer le statut de mécène</label>
          <button>Valider</button>
        </form>
        <ul>
          {patrons?.map((p) => (
            <li key={p.username}>
              {p.username} — {p.patron_until ? `jusqu'au ${new Date(p.patron_until).toLocaleDateString("fr-FR")}` : "sans limite"}
            </li>
          ))}
        </ul>
      </section>
      <Link href="/">← Retour</Link>
    </main>
  );
}
