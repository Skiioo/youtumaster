"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveTimeout } from "../actions";

/** Recharge la page à chaque coup de l'adversaire (temps réel) + chrono du quiz. */
export function Live({ matchId, expiresAt }: { matchId: string; expiresAt?: string }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`match-${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, router]);

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

  return expiresAt && left != null ? <p style={{ fontSize: 24 }}>⏱️ {left} s</p> : null;
}
