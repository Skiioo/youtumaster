import { Check, Search, UserMinus, UserPlus, X } from "lucide-react";
import type { ReactNode } from "react";
import { PageTitle } from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { withParams } from "@/lib/cardFilters";
import { formatFriendCode } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { removeFriend, respondFriendRequest, sendFriendRequest } from "./actions";

type Relation = "none" | "sent" | "received" | "friends";
type Player = { id: string; username: string; relation: Relation };

export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const error = typeof params.error === "string" ? params.error : null;
  const here = withParams("/friends", { q: q || null });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: results }, { data: mine }, { data: me }] = await Promise.all([
    q ? supabase.rpc("search_players", { p_q: q }) : Promise.resolve({ data: [] }),
    supabase.rpc("my_friendships"),
    supabase.from("users").select("friend_code").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  const found = (results ?? []) as Player[];
  const relations = (mine ?? []) as Player[];
  const friends = relations.filter((r) => r.relation === "friends");
  const received = relations.filter((r) => r.relation === "received");
  const sent = relations.filter((r) => r.relation === "sent");

  /** Petit formulaire d'action sur un joueur (l'adresse de retour garde la recherche) */
  const act = (action: (f: FormData) => Promise<void>, userId: string, button: ReactNode, extra?: ReactNode) => (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="returnTo" value={here} />
      {extra}
      {button}
    </form>
  );

  /** Bouton adapté à la relation avec ce joueur */
  const relationButton = (p: Player) => {
    switch (p.relation) {
      case "friends":
        return <span className="text-sm text-muted-foreground">Ami</span>;
      case "sent":
        return act(removeFriend, p.id, <Button type="submit" variant="ghost" size="sm">Annuler la demande</Button>);
      case "received":
        return act(
          respondFriendRequest,
          p.id,
          <Button type="submit" size="sm"><Check /> Accepter</Button>,
          <input type="hidden" name="accept" value="true" />,
        );
      default:
        return act(sendFriendRequest, p.id, <Button type="submit" variant="outline" size="sm"><UserPlus /> Ajouter</Button>);
    }
  };

  const row = (p: Player, actions: ReactNode) => (
    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
      <span className="truncate font-medium">{p.username}</span>
      <div className="flex shrink-0 gap-1">{actions}</div>
    </li>
  );

  return (
    <main className="p-6">
      <PageTitle href="/friends">Amis</PageTitle>
      <div className="grid max-w-2xl gap-4">
        {error && <p role="alert" className="text-destructive">{error}</p>}

        <Card>
          <CardHeader>
            <CardTitle>Ajouter un ami</CardTitle>
            <CardDescription>
              Saisis l&apos;ID joueur de ton ami (visible sur son profil). Le tien :{" "}
              <span className="font-mono font-semibold text-foreground">{formatFriendCode(me?.friend_code)}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <form className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" type="search" defaultValue={q} placeholder="ABCD-2345" aria-label="ID joueur" className="pl-8 font-mono uppercase" maxLength={12} required />
              </div>
              <Button type="submit">Rechercher</Button>
            </form>
            {q && (
              found.length ? (
                <ul className="divide-y">{found.map((p) => row(p, relationButton(p)))}</ul>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun joueur avec l&apos;ID « {q.toUpperCase()} ».</p>
              )
            )}
          </CardContent>
        </Card>

        {received.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Demandes reçues ({received.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {received.map((p) =>
                  row(
                    p,
                    <>
                      {act(respondFriendRequest, p.id, <Button type="submit" size="sm"><Check /> Accepter</Button>, <input type="hidden" name="accept" value="true" />)}
                      {act(respondFriendRequest, p.id, <Button type="submit" variant="ghost" size="sm"><X /> Refuser</Button>, <input type="hidden" name="accept" value="false" />)}
                    </>,
                  ),
                )}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Mes amis ({friends.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {friends.length ? (
              <ul className="divide-y">
                {friends.map((p) =>
                  row(p, act(removeFriend, p.id, <Button type="submit" variant="ghost" size="sm"><UserMinus /> Retirer</Button>)),
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Tu n&apos;as pas encore d&apos;amis : ajoute-les avec leur ID joueur ci-dessus.</p>
            )}
          </CardContent>
        </Card>

        {sent.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Demandes envoyées ({sent.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {sent.map((p) => row(p, act(removeFriend, p.id, <Button type="submit" variant="ghost" size="sm">Annuler</Button>)))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
