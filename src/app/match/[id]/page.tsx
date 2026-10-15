import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Flag, Swords, Trophy, X } from "lucide-react";
import { thumbnailUrl } from "@/components/Card";
import { DeckPicker } from "@/components/DeckPicker";
import type { Fighter } from "@/components/FighterCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { answerQuiz, joinMatch } from "../actions";
import { Battlefield } from "./Battlefield";
import { Live } from "./Live";
import { MatchGuard } from "./MatchGuard";
import { Searching } from "./Searching";

type MatchState = {
  phase: "waiting" | "choose" | "quiz" | "finished";
  turn?: string;
  cards: Record<string, Fighter>;
  collectif: Record<string, number>;
  names?: Record<string, string>;
  forfeit?: string;
  quiz?: { video: string; target: string; question: string; choices: string[]; expires_at: string };
  last?: { attacker: string; target: string; correct: boolean; damage: number; answer: string };
};

export default async function MatchPage({ params, searchParams }: PageProps<"/match/[id]">) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: m }, { data: { user } }, { data: factionRows }, { data: quizCfg }] = await Promise.all([
    supabase.from("matches").select("id, status, player_a_id, player_b_id, invited_id, winner_id, state, created_at").eq("id", id).maybeSingle(),
    supabase.auth.getUser(),
    supabase.from("factions").select("id, name"),
    supabase.from("game_config").select("value").eq("key", "quiz_seconds").maybeSingle(),
  ]);
  if (!m || !user) notFound();

  const state = m.state as MatchState;
  const factions = Object.fromEntries((factionRows ?? []).map((f) => [f.id as number, f.name as string]));
  const all = Object.entries(state.cards);
  const myCards = all.filter(([, c]) => c.owner === user.id);
  const theirCards = all.filter(([, c]) => c.owner !== user.id);
  const isPlayer = [m.player_a_id, m.player_b_id].includes(user.id);
  const opponentId = m.player_a_id === user.id ? m.player_b_id : m.player_a_id;
  const name = (uid: string | null) => (uid && state.names?.[uid]) || "Adversaire";
  const myTurn = state.turn === user.id;
  const errorBox = error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>;
  const back = (
    <Button variant="ghost" nativeButton={false} render={<Link href="/play" />} className="w-fit">
      ← Combat
    </Button>
  );

  // ---------------------------------------------------------------- En attente d'un adversaire
  if (m.status === "waiting" || m.status === "aborted") {
    return (
      <main className="grid gap-6 p-6">
        {m.status === "waiting" && <Live matchId={m.id} />}
        {/* Partie active du joueur : pas de retour libre, quitter = annuler (double validation) */}
        {m.status === "waiting" && isPlayer ? <MatchGuard matchId={m.id} inProgress={false} /> : back}
        {errorBox}
        {m.status === "aborted" ? (
          <Card className="mx-auto w-full max-w-lg">
            <CardHeader>
              <CardTitle>Partie annulée</CardTitle>
              <CardDescription>Cette partie a été quittée et n&apos;existe plus.</CardDescription>
            </CardHeader>
          </Card>
        ) : isPlayer ? (
          <Card className="mx-auto w-full max-w-lg text-center">
            <CardHeader>
              <CardTitle>{m.invited_id ? "⏳ En attente de ton ami…" : "Recherche d'un adversaire…"}</CardTitle>
              <CardDescription>
                {m.invited_id
                  ? "Ton ami retrouve ton défi dans sa page Combat. La partie démarre dès qu'il le relève."
                  : "La partie démarre automatiquement dès qu'un autre joueur cherche aussi. Garde cette page ouverte."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid justify-items-center gap-6">
              {!m.invited_id && <Searching since={m.created_at} />}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            <h1 className="text-center">Relever le défi de {name(m.player_a_id)}</h1>
            <p className="text-center text-sm text-muted-foreground">Choisis 4 cartes pour l&apos;affronter.</p>
            <DeckPicker action={joinMatch} matchId={m.id} label="Combattre !" />
          </div>
        )}
      </main>
    );
  }

  // ---------------------------------------------------------------- Match en cours ou terminé
  const finished = m.status === "finished";
  const won = m.winner_id === user.id;
  const last = state.last;
  const quiz = state.phase === "quiz" ? state.quiz : undefined;
  const iAmDefender = !!quiz && !myTurn;

  return (
    <main className="grid gap-6 p-6">
      {!finished && <Live matchId={m.id} expiresAt={quiz?.expires_at} totalSeconds={Number(quizCfg?.value ?? 20)} />}

      {/* En-tête : joueurs, statut, quitter (= abandon). Marge droite : place du compteur de ViewCoins */}
      <div className="flex flex-wrap items-center justify-between gap-3 pr-28">
        {finished ? back : <MatchGuard matchId={m.id} inProgress />}
        <div className="flex items-center gap-2 text-lg font-bold">
          <span>{name(user.id)}</span>
          <Swords className="size-5 text-ring" />
          <span>{name(opponentId)}</span>
        </div>
        {finished ? <Badge variant="secondary">Terminé</Badge> : <Badge className="bg-ring text-white">En cours</Badge>}
      </div>
      {errorBox}

      {finished && (
        <Card className={cn("mx-auto w-full max-w-lg text-center", won ? "border-amber-400" : "border-destructive/40")}>
          <CardHeader className="justify-items-center gap-2">
            {won ? <Trophy className="size-12 text-amber-500" /> : <Flag className="size-12 text-muted-foreground" />}
            <CardTitle className="text-2xl">{won ? "Victoire !" : "Défaite"}</CardTitle>
            <CardDescription>
              {state.forfeit
                ? state.forfeit === user.id
                  ? "Tu as abandonné le match."
                  : `${name(opponentId)} a abandonné.`
                : won
                  ? "Toutes les cartes adverses sont K.O."
                  : "Toutes tes cartes sont K.O."}
              {won && " +100 ViewCoins"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button nativeButton={false} render={<Link href="/play" />}>
              Nouveau combat
            </Button>
          </CardContent>
        </Card>
      )}

      <Battlefield
        matchId={m.id}
        mine={myCards}
        theirs={theirCards}
        factions={factions}
        myName={`${name(user.id)} · Collectif ×${state.collectif[user.id] ?? 1}`}
        theirName={`${name(opponentId)} · Collectif ×${(opponentId && state.collectif[opponentId]) ?? 1}`}
        canAttack={!finished && state.phase === "choose" && myTurn}
        target={quiz?.target}
      >
        {/* Résultat du dernier quiz : seulement juste / faux */}
        {last && !quiz && (
          <p
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium",
              last.correct ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400",
            )}
          >
            {last.correct ? <Check className="size-4" /> : <X className="size-4" />}
            {last.correct ? "Bonne réponse" : "Mauvaise réponse"}
          </p>
        )}

        {/* Quiz : seule la miniature de la carte attaquante est montrée */}
        {quiz && (
          <Card className="w-full max-w-xl">
            <CardContent className="grid gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- miniature externe ; la carte attaquante reste cachée */}
              <img src={thumbnailUrl(quiz.video)} alt="Carte attaquante (cachée)" className="aspect-video w-full rounded-lg object-cover" />
              <div className="grid gap-1 text-center">
                <p className="text-lg font-semibold">{quiz.question}</p>
                <p className="text-xs text-muted-foreground">
                  Cible : {state.cards[quiz.target]?.title.slice(0, 50)}
                </p>
              </div>
              {iAmDefender ? (
                <form action={answerQuiz} className="grid grid-cols-2 gap-2">
                  <input type="hidden" name="matchId" value={m.id} />
                  {quiz.choices.map((choice, i) => (
                    <Button key={choice} type="submit" name="choice" value={String(i + 1)} variant="outline" className="h-auto min-h-11 whitespace-normal">
                      {choice}
                    </Button>
                  ))}
                </form>
              ) : (
                <p className="text-center text-sm text-muted-foreground">{name(opponentId)} réfléchit…</p>
              )}
            </CardContent>
          </Card>
        )}

        {!finished && state.phase === "choose" && !myTurn && (
          <p className="text-sm text-muted-foreground">⏳ {name(opponentId)} choisit son attaque…</p>
        )}
      </Battlefield>
    </main>
  );
}
