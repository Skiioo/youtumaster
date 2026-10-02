import Link from "next/link";
import { notFound } from "next/navigation";
import { thumbnailUrl } from "@/components/Card";
import { DeckPicker } from "@/components/DeckPicker";
import { createClient } from "@/lib/supabase/server";
import { answerQuiz, attack, cancelMatch, joinMatch } from "../actions";
import { Live } from "./Live";

type FighterCard = {
  owner: string;
  video: string;
  title: string;
  rarity: string;
  faction: number | null;
  attack: number;
  hp: number;
  max_hp: number;
};

type MatchState = {
  phase: "waiting" | "choose" | "quiz" | "finished";
  turn?: string;
  cards: Record<string, FighterCard>;
  collectif: Record<string, number>;
  quiz?: { video: string; target: string; question: string; choices: string[]; expires_at: string };
  last?: { attacker: string; target: string; correct: boolean; damage: number; answer: string };
};

function Team({ title, cards, factions }: {
  title: string;
  cards: [string, FighterCard][];
  factions: Map<number, string>;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <ul className="card-grid">
        {cards.map(([id, c]) => (
          <li key={id} style={{ opacity: c.hp > 0 ? 1 : 0.35 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- miniature externe */}
            <img src={thumbnailUrl(c.video)} alt={c.title} style={{ width: "100%", borderRadius: 4 }} />
            <strong>{c.rarity.toUpperCase()}</strong> · {factions.get(c.faction ?? 0) ?? "?"}
            <p style={{ margin: "4px 0" }}>{c.title}</p>
            <meter min={0} max={c.max_hp} value={c.hp} style={{ width: "100%" }} />
            <small>❤️ {c.hp}/{c.max_hp} · ⚔️ {c.attack}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function MatchPage({ params, searchParams }: PageProps<"/match/[id]">) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: m }, { data: { user } }, { data: factionRows }] = await Promise.all([
    supabase.from("matches").select("id, status, player_a_id, player_b_id, winner_id, state").eq("id", id).maybeSingle(),
    supabase.auth.getUser(),
    supabase.from("factions").select("id, name"),
  ]);
  if (!m || !user) notFound();

  const state = m.state as MatchState;
  const factions = new Map((factionRows ?? []).map((f) => [f.id as number, f.name as string]));
  const all = Object.entries(state.cards);
  const myCards = all.filter(([, c]) => c.owner === user.id);
  const theirCards = all.filter(([, c]) => c.owner !== user.id);
  const isPlayer = [m.player_a_id, m.player_b_id].includes(user.id);
  const myTurn = state.turn === user.id;
  const errorBox = error && <p role="alert" style={{ color: "crimson" }}>{error}</p>;

  if (m.status === "waiting") {
    return (
      <main style={{ padding: 24 }}>
        <Live matchId={m.id} />
        {errorBox}
        {isPlayer ? (
          <>
            <p>⏳ En attente d&apos;un adversaire… Partage l&apos;adresse de cette page à un ami, ou attends qu&apos;un joueur relève ton défi.</p>
            <form action={cancelMatch}>
              <input type="hidden" name="matchId" value={m.id} />
              <button>Annuler le défi</button>
            </form>
          </>
        ) : (
          <>
            <h1>Relever le défi</h1>
            <DeckPicker action={joinMatch} matchId={m.id} label="Combattre !" />
          </>
        )}
        <Link href="/play">← Combat</Link>
      </main>
    );
  }

  const last = state.last;
  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      {m.status !== "finished" && <Live matchId={m.id} expiresAt={state.quiz?.expires_at} />}
      {errorBox}

      {m.status === "finished" && (
        <h1>{m.winner_id === user.id ? "🏆 Victoire ! +100 ViewCoins" : "💀 Défaite"}</h1>
      )}

      {last && (
        <p>
          Dernier coup : {last.correct ? "✅ esquivé !" : `💥 ${last.damage} dégâts`} sur {state.cards[last.target]?.title}
          {" "}(bonne réponse : {last.answer})
        </p>
      )}

      <Team title="Adversaire" cards={theirCards} factions={factions} />

      {state.phase === "quiz" && state.quiz && (
        <section style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- miniature externe ; la carte attaquante reste cachée */}
          <img src={thumbnailUrl(state.quiz.video)} alt="Carte attaquante" style={{ maxWidth: 360, width: "100%", borderRadius: 8 }} />
          <h2>{state.quiz.question}</h2>
          <p>Cible : {state.cards[state.quiz.target]?.title}</p>
          {myTurn ? (
            <p>L&apos;adversaire réfléchit…</p>
          ) : (
            <form action={answerQuiz} style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="matchId" value={m.id} />
              {state.quiz.choices.map((choice, i) => (
                <button key={choice} name="choice" value={i + 1}>{choice}</button>
              ))}
            </form>
          )}
        </section>
      )}

      {state.phase === "choose" && (
        myTurn ? (
          <form action={attack} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="hidden" name="matchId" value={m.id} />
            <label>
              Attaquer avec{" "}
              <select name="card" required>
                {myCards.filter(([, c]) => c.hp > 0).map(([cid, c]) => <option key={cid} value={cid}>{c.title} (⚔️ {c.attack})</option>)}
              </select>
            </label>
            <label>
              la cible{" "}
              <select name="target" required>
                {theirCards.filter(([, c]) => c.hp > 0).map(([cid, c]) => <option key={cid} value={cid}>{c.title} (❤️ {c.hp})</option>)}
              </select>
            </label>
            <button>⚔️ Attaquer</button>
          </form>
        ) : (
          <p>⏳ Tour de l&apos;adversaire…</p>
        )
      )}

      <Team title={`Ton équipe (Collectif x${state.collectif[user.id] ?? 1})`} cards={myCards} factions={factions} />
      <Link href="/play">← Combat</Link>
    </main>
  );
}
