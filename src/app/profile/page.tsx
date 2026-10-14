import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/CopyButton";
import { formatFriendCode, isPatron } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { equipCosmetics, setActiveTitle } from "./actions";

const KINDS = [
  { kind: "badge", column: "badge_id", label: "Badge" },
  { kind: "name_color", column: "name_color_id", label: "Couleur du pseudo" },
  { kind: "card_back", column: "card_back_id", label: "Dos de carte" },
] as const;

type OwnedTitle = { titles: { id: number; name: string } };

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: me }, { data: cosmetics }, { data: owned }] = await Promise.all([
    supabase
      .from("users")
      .select("username, role, patron_until, badge_id, name_color_id, card_back_id, active_title_id, friend_code")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    supabase.from("cosmetics").select("id, kind, name").eq("patron_only", true).order("id"),
    supabase.from("user_titles").select("titles(id, name)").returns<OwnedTitle[]>(),
  ]);

  return (
    <main className="p-6">
      <PageTitle href="/profile">Profil de {me?.username}</PageTitle>
      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Mon ID joueur</CardTitle>
            <CardDescription>Donne-le à tes amis pour qu&apos;ils puissent t&apos;ajouter.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <span className="font-mono font-semibold">{formatFriendCode(me?.friend_code)}</span>
            {me?.friend_code && <CopyButton text={formatFriendCode(me.friend_code)} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mon titre affiché</CardTitle>
            <CardDescription>Le titre qui accompagne ton pseudo.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {owned?.length ? (
              <form action={setActiveTitle} className="flex gap-2">
                <select name="title" defaultValue={me?.active_title_id ?? ""} className="flex-1" aria-label="Titre affiché">
                  <option value="">Aucun</option>
                  {owned.map(({ titles: t }) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button type="submit">Afficher</Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tu n&apos;as pas encore de titre : termine une <Link href="/quests">quête</Link> pour en débloquer un.
              </p>
            )}
            {saved === "title" && <p role="status" className="text-sm">✅ Titre enregistré</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cosmétiques de mécène</CardTitle>
            <CardDescription>
              {isPatron(me)
                ? "Merci pour ton soutien 💜 Choisis tes cosmétiques."
                : "Le jeu est gratuit et financé par les dons. Les mécènes reçoivent des cosmétiques exclusifs (badge, couleur de pseudo, dos de carte), sans aucun avantage en jeu."}
            </CardDescription>
          </CardHeader>
          {isPatron(me) && (
            <CardContent>
              <form action={equipCosmetics} className="grid gap-3">
                {KINDS.map(({ kind, column, label }) => (
                  <label key={kind} className="flex items-center justify-between gap-4 text-sm">
                    {label}
                    <select name={kind} defaultValue={me?.[column] ?? ""} className="w-48">
                      <option value="">Aucun</option>
                      {cosmetics
                        ?.filter((c) => c.kind === kind)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                <Button type="submit" className="w-fit">
                  Enregistrer
                </Button>
                {saved === "1" && <p role="status" className="text-sm">✅ Enregistré</p>}
              </form>
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  );
}
