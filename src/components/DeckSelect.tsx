"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Card, type CardData } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DECK_SIZE = 4;

/** Grille de cartes cliquables : on en sélectionne exactement 4 (envoyées en champs "card"). */
export function DeckSelect({ cards, label }: { cards: CardData[]; label: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < DECK_SIZE ? [...p, id] : p));

  if (cards.length < DECK_SIZE) {
    return <p className="text-sm text-muted-foreground">Il te faut au moins 4 cartes libres (ni en vente, ni en combat).</p>;
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background/90 p-3 backdrop-blur">
        <span className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{picked.length}</span> / {DECK_SIZE} cartes
        </span>
        <Button type="submit" disabled={picked.length !== DECK_SIZE} className="ml-auto">
          {label}
        </Button>
      </div>
      {picked.map((id) => (
        <input key={id} type="hidden" name="card" value={id} />
      ))}
      <ul className="card-grid justify-center [--card-w:12rem]">
        {cards.map((c) => {
          const on = picked.includes(c.id);
          const full = !on && picked.length >= DECK_SIZE;
          return (
            <li key={c.id}>
              <button
                type="button"
                data-slot="deck-card"
                onClick={() => toggle(c.id)}
                disabled={full}
                aria-pressed={on}
                className={cn(
                  "relative block rounded-xl transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100",
                  on && "ring-4 ring-ring",
                )}
              >
                <Card card={c} small />
                {on && (
                  <span className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-ring text-white shadow">
                    <Check className="size-4" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
