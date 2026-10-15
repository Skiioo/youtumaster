"use client";

import { useState, type ReactNode } from "react";
import { Heart, Swords } from "lucide-react";
import { FighterCard, type Fighter } from "@/components/FighterCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { attack } from "../actions";

type Team = [string, Fighter][];

/** Barre de vie d'un joueur : total des PV de ses cartes, couleur selon la vie restante */
function PlayerHealth({ name, team, mine }: { name: string; team: Team; mine?: boolean }) {
  const hp = team.reduce((sum, [, c]) => sum + Math.max(0, c.hp), 0);
  const max = team.reduce((sum, [, c]) => sum + c.max_hp, 0) || 1;
  const pct = Math.round((hp / max) * 100);
  return (
    <div className="mx-auto grid w-full max-w-md gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          {name}
          {mine && <span className="font-normal text-muted-foreground"> (toi)</span>}
        </span>
        <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
          <Heart className="size-3.5 text-red-500" /> {hp} / {max}
        </span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={`Vie de ${name}`}
        aria-valuenow={hp}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : "bg-red-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Plateau : équipe adverse en haut, zone centrale (quiz / statut) au milieu, mon équipe en bas.
 * Quand c'est mon tour : clic sur une de mes cartes, puis sur une cible, puis "Attaquer".
 */
export function Battlefield({ matchId, mine, theirs, factions, myName, theirName, canAttack, target, children }: {
  matchId: string;
  mine: Team;
  theirs: Team;
  factions: Record<number, string>;
  myName: string;
  theirName: string;
  canAttack: boolean;
  /** Carte visée par le quiz en cours (surlignée) */
  target?: string;
  children: ReactNode;
}) {
  const [attacker, setAttacker] = useState<string | null>(null);
  const [victim, setVictim] = useState<string | null>(null);

  const row = (team: Team, side: "mine" | "theirs") => (
    <ul className="flex flex-wrap justify-center gap-3">
      {team.map(([id, c]) => {
        const alive = c.hp > 0;
        const pickable = canAttack && alive;
        const selected = side === "mine" ? attacker === id : victim === id || target === id;
        return (
          <li key={id}>
            <button
              type="button"
              data-slot="fighter"
              disabled={!pickable}
              onClick={() => (side === "mine" ? setAttacker(id) : setVictim(id))}
              className={cn("rounded-xl", pickable && "cursor-pointer transition-transform hover:-translate-y-1")}
              aria-pressed={selected}
              aria-label={`${side === "mine" ? "Attaquer avec" : "Cibler"} ${c.title}`}
            >
              <FighterCard c={c} factionName={factions[c.faction ?? 0]} selected={selected} />
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <PlayerHealth name={theirName} team={theirs} />
        {row(theirs, "theirs")}
      </section>

      <div className="grid justify-items-center gap-3">
        {children}
        {canAttack && (
          <form action={attack} className="flex flex-wrap items-center justify-center gap-3">
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="card" value={attacker ?? ""} />
            <input type="hidden" name="target" value={victim ?? ""} />
            <p className="text-sm text-muted-foreground">
              {!attacker ? "① Choisis ta carte attaquante (en bas)" : !victim ? "② Choisis la cible (en haut)" : "③ Prêt !"}
            </p>
            <Button type="submit" disabled={!attacker || !victim}>
              <Swords /> Attaquer
            </Button>
          </form>
        )}
      </div>

      <section className="grid gap-2">
        {row(mine, "mine")}
        <PlayerHealth name={myName} team={mine} mine />
      </section>
    </div>
  );
}
