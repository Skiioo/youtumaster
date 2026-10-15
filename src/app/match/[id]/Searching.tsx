"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

/** Écran "Recherche d'un adversaire" : animation et chrono. Le signal est envoyé par MatchGuard ;
 *  quand un adversaire arrive, le temps réel (Live) recharge la page et la partie démarre. */
export function Searching({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.parse(since);
    const tick = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000))), 1000);
    return () => clearInterval(tick);
  }, [since]);

  return (
    <div className="grid justify-items-center gap-4">
      <div className="relative grid size-24 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-ring/30" />
        <span className="absolute inset-3 animate-pulse rounded-full bg-ring/20" />
        <Search className="relative size-9 text-ring" />
      </div>
      <p className="text-2xl font-bold tabular-nums">
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
      </p>
    </div>
  );
}
