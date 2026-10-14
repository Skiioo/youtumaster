"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** "83" -> "1:23" */
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Paquets disponibles + décompte du prochain, à la seconde. À zéro, la page est rafraîchie :
 * le serveur recalcule le stock (le bouton Ouvrir se réactive). nextIn = null : stock plein.
 */
export function BoosterCountdown({ available, nextIn }: { available: number; nextIn: number | null }) {
  const router = useRouter();
  const [left, setLeft] = useState(nextIn);

  useEffect(() => {
    if (nextIn == null) return;
    const end = Date.now() + nextIn * 1000;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(tick);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [nextIn, router]);

  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">{available}</span> paquet{available > 1 ? "s" : ""} à ouvrir
      {nextIn == null ? (
        <> · stock plein</>
      ) : (
        <>
          {" "}· prochain dans <span className="font-semibold text-foreground tabular-nums">{mmss(left ?? nextIn)}</span>
        </>
      )}
    </p>
  );
}
