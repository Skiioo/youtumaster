"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, type CardData } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RevealItem = { slot: number; card: CardData | null };

const MAX_PILE_LAYERS = 4;

/**
 * Pile de cartes face cachée : ▶ retourne la suivante, ◀ revient sur une carte déjà vue.
 * index = carte affichée (-1 : rien de révélé), seen = dernière carte révélée.
 */
export function BoosterReveal({
  items,
  cardBack,
}: {
  items: RevealItem[];
  cardBack: string | null;
}) {
  const [{ index, seen, animate }, setState] = useState({
    index: -1,
    seen: -1,
    animate: false,
  });
  const last = items.length - 1;

  const go = useCallback(
    (to: number) =>
      setState((s) => {
        if (to < 0 || to > last || to > s.seen + 1) return s;
        // Seule une carte jamais vue joue l'animation de retournement
        return { index: to, seen: Math.max(s.seen, to), animate: to > s.seen };
      }),
    [last],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const back = (
    <div
      className="absolute inset-0 grid place-items-center rounded-xl bg-linear-to-br from-violet-700 to-fuchsia-600 bg-cover bg-center text-5xl shadow-lg ring-2 ring-white/30 backface-hidden"
      style={cardBack ? { backgroundImage: `url(${cardBack})` } : undefined}
    >
      {!cardBack && "🃏"}
    </div>
  );
  const current = items[index];
  const pileLayers = Math.min(last - index, MAX_PILE_LAYERS);

  return (
    <div className="grid justify-items-center gap-5">
      <div className="relative h-80 w-56 perspective-distant">
        {/* Cartes restantes, empilées sous la carte du dessus */}
        {Array.from({ length: pileLayers }, (_, k) => {
          const depth = pileLayers - k;
          return (
            <button
              key={depth}
              type="button"
              data-slot="pile"
              onClick={() => go(index + 1)}
              aria-label="Retourner la carte suivante"
              className="absolute inset-0 cursor-pointer"
              style={{
                transform: `translate(${depth * 5}px, ${depth * 5}px) rotate(${depth * 1.5}deg)`,
              }}
            >
              {back}
            </button>
          );
        })}

        {current && (
          <div
            key={index}
            className={cn(
              "absolute inset-0 transform-3d",
              animate ? "animate-flip-in" : "rotate-y-180",
            )}
          >
            {back}
            <div className="absolute inset-0 overflow-auto rounded-xl text-left rotate-y-180 backface-hidden">
              {current.card ? (
                <Link href={`/card/${current.card.id}`} className="block h-full">
                  <Card card={current.card} className="h-full" />
                </Link>
              ) : (
                <div className="grid size-full place-items-center rounded-xl border bg-card p-4 text-center">
                  <span className="text-4xl">🔄</span>
                  <span className="font-semibold">Jeton de Refresh</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Flèches et pagination sur la même ligne : pleine = vue, anneau = carte affichée */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => go(index - 1)}
          disabled={index <= 0}
          aria-label="Carte précédente"
        >
          <ChevronLeft />
        </Button>
        <div
          className="flex gap-2"
          role="tablist"
          aria-label="Cartes du paquet"
        >
          {items.map(({ slot }, i) => (
            <button
              key={slot}
              type="button"
              data-slot="dot"
              role="tab"
              aria-selected={i === index}
              aria-label={`Carte ${i + 1}`}
              disabled={i > seen + 1}
              onClick={() => go(i)}
              className={cn(
                "size-2.5 rounded-full transition-all",
                i <= seen ? "bg-primary" : "bg-muted-foreground/30",
                i === index &&
                  "scale-125 ring-2 ring-primary ring-offset-2 ring-offset-background",
                i <= seen + 1 && "cursor-pointer",
              )}
            />
          ))}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => go(index + 1)}
          disabled={index >= last}
          aria-label="Carte suivante"
        >
          <ChevronRight />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {index < 0
          ? "Clique sur ▶ ou sur la pile pour révéler ta première carte"
          : `${index + 1} / ${items.length}`}
      </p>

      {seen === last && (
        <div className="grid w-56 gap-2">
          <Button nativeButton={false} render={<Link href="/" />}>
            Continuer
          </Button>
          <Button nativeButton={false} render={<Link href="/collection" />}>
            Voir ma collection
          </Button>
        </div>
      )}
    </div>
  );
}
