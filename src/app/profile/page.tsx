import Link from "next/link";
import { isPatron } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { equipCosmetics } from "./actions";

const KINDS = [
  { kind: "badge", column: "badge_id", label: "Badge" },
  { kind: "name_color", column: "name_color_id", label: "Couleur du pseudo" },
  { kind: "card_back", column: "card_back_id", label: "Dos de carte" },
] as const;

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const { saved } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: me }, { data: cosmetics }] = await Promise.all([
    supabase.from("users").select("username, role, patron_until, badge_id, name_color_id, card_back_id").eq("id", user?.id ?? "").maybeSingle(),
    supabase.from("cosmetics").select("id, kind, name").eq("patron_only", true).order("id"),
  ]);

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 600 }}>
      <h1>Profil de {me?.username}</h1>
      {isPatron(me) ? (
        <form action={equipCosmetics} style={{ display: "grid", gap: 8 }}>
          <p>Merci pour ton soutien 💜 Choisis tes cosmétiques :</p>
          {KINDS.map(({ kind, column, label }) => (
            <label key={kind}>
              {label}{" "}
              <select name={kind} defaultValue={me?.[column] ?? ""}>
                <option value="">Aucun</option>
                {cosmetics?.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          ))}
          <button>Enregistrer</button>
          {saved && <p role="status">✅ Enregistré</p>}
        </form>
      ) : (
        <p>
          Le jeu est gratuit et financé par les dons. Les mécènes reçoivent des cosmétiques exclusifs
          (badge, couleur de pseudo, dos de carte), sans aucun avantage en jeu.
        </p>
      )}
      <Link href="/">← Retour</Link>
    </main>
  );
}
