"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { subscribeToUpdates } from "@/lib/supabase/client";

/** Solde de ViewCoins en direct : abonné en temps réel à la ligne du joueur. */
export function CoinCounter({ userId, initial }: { userId: string; initial: number }) {
  const [live, setLive] = useState<number | null>(null);
  const coins = live ?? initial;

  useEffect(() => subscribeToUpdates("users", userId, (row) => setLive(row.viewcoins as number)), [userId]);

  return (
    <div className="absolute top-3 right-4 z-10 flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm font-semibold shadow-sm">
      <Coins className="size-4 text-amber-500" />
      {/* key : relance la petite animation à chaque changement de solde */}
      <span key={coins} className="animate-in zoom-in-75 duration-300">
        {coins.toLocaleString("fr-FR")}
      </span>
      <span className="sr-only">ViewCoins</span>
    </div>
  );
}
