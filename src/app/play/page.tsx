import Link from "next/link";
import { Swords } from "lucide-react";
import { createMatch } from "@/app/match/actions";
import { DeckPicker } from "@/components/DeckPicker";
import { PageTitle } from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { freshSince } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Invitation = {
  id: string;
  player_a_id: string;
  created_at: string;
  state: { names?: Record<string, string> };
};
type Friend = { id: string; username: string; relation: string };

const rel = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const ago = (iso: string) => {
  const min = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  return Math.abs(min) < 60 ? rel.format(min, "minute") : rel.format(Math.round(min / 60), "hour");
};

export default async function PlayPage({ searchParams }: PageProps<"/play">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const inviteId = typeof params.invite === "string" ? params.invite : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: invitations }, { data: rels }] = await Promise.all([
    // Défis d'amis reçus, dont le créateur attend encore (signal récent)
    supabase
      .from("matches")
      .select("id, player_a_id, created_at, state")
      .eq("status", "waiting")
      .eq("invited_id", user?.id ?? "")
      .gt("last_seen_at", freshSince())
      .order("created_at", { ascending: false })
      .returns<Invitation[]>(),
    supabase.rpc("my_friendships"),
  ]);
  const friends = ((rels ?? []) as Friend[]).filter((f) => f.relation === "friends");
  const invited = inviteId ? friends.find((f) => f.id === inviteId) : null; // duel lancé depuis la page Amis

  return (
    <main className="grid gap-6 p-6">
      <PageTitle href="/play">Combat</PageTitle>
      {error && <p role="alert" className="-mt-4 text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Défis de tes amis</CardTitle>
          <CardDescription>
            Pour défier un ami en duel, utilise le bouton « Défier » de la page <Link href="/friends">Amis</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitations?.length ? (
            <ul className="divide-y">
              {invitations.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.state.names?.[m.player_a_id] ?? "Un ami"} te défie en duel !</p>
                    <p className="text-xs text-muted-foreground">{ago(m.created_at)}</p>
                  </div>
                  <Button size="sm" nativeButton={false} render={<Link href={`/match/${m.id}`} />}>
                    Relever le défi
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun défi reçu pour l&apos;instant.</p>
          )}
        </CardContent>
      </Card>

      <Card id="create">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="size-5 text-ring" /> {invited ? `Défier ${invited.username}` : "Lancer une partie"}
          </CardTitle>
          <CardDescription>
            {invited ? (
              <>
                Choisis tes 4 cartes : {invited.username} recevra ton invitation dans sa page Combat.{" "}
                <Link href="/play">Jouer contre n&apos;importe qui</Link>
              </>
            ) : (
              "Choisis tes 4 cartes : tu rejoins la file d'attente et la partie démarre dès qu'un autre joueur cherche aussi."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeckPicker
            action={createMatch}
            label={invited ? "Envoyer le défi" : "Lancer la partie"}
            hidden={invited ? { invite: invited.id } : undefined}
          />
        </CardContent>
      </Card>
    </main>
  );
}
