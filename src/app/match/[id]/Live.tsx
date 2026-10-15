"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { subscribeToUpdates } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { resolveTimeout } from "../actions";

/** Recharge la page à chaque coup de l'adversaire (temps réel) + chrono du quiz. */
export function Live({ matchId, expiresAt, totalSeconds = 20 }: { matchId: string; expiresAt?: string; totalSeconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => subscribeToUpdates("matches", matchId, () => router.refresh()), [matchId, router]);

  useEffect(() => {
    if (!expiresAt) return;
    const end = Date.parse(expiresAt);
    let lastCall = 0;
    const tick = setInterval(() => {
      const ms = end - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      // Temps écoulé : on demande la résolution (réessai toutes les 2 s si l'horloge locale avance)
      if (ms <= 0 && Date.now() - lastCall > 2000) {
        lastCall = Date.now();
        resolveTimeout(matchId);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt, matchId]);

  if (!expiresAt || left == null) return null;
  // Barre de temps du quiz : se vide de 100 % à 0 %, rouge dans les 5 dernières secondes
  const pct = Math.min(100, (left / totalSeconds) * 100);
  return (
    <div className="grid w-full max-w-md gap-1" role="timer" aria-label={`${left} secondes restantes`}>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-300", left <= 5 ? "bg-red-500" : "bg-ring")} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-center text-sm font-semibold tabular-nums">{left} s</p>
    </div>
  );
}
