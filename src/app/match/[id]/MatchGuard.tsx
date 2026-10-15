"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { leaveMatch, searchHeartbeat } from "../actions";

const HEARTBEAT_MS = 15_000;

/**
 * Garde d'un match actif (recherche, défi en attente, partie en cours). Quitter = annuler :
 *  - tout lien cliqué ouvre une confirmation (double validation) avant de quitter ;
 *  - fermer / recharger l'onglet : avertissement du navigateur, puis la partie est quittée ;
 *  - signal toutes les 15 s : sans signal depuis 45 s, le serveur considère que le joueur est parti.
 */
export function MatchGuard({ matchId, inProgress }: { matchId: string; inProgress: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null); // destination en attente de confirmation
  const leaving = useRef(false);

  // Signal + redirections décidées par le serveur (recherche fusionnée, partie disparue)
  useEffect(() => {
    const beat = async () => {
      const next = await searchHeartbeat(matchId);
      if (leaving.current) return;
      if (next === null) router.replace("/play");
      else if (next !== matchId) router.replace(`/match/${next}`);
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [matchId, router]);

  // Interception des liens internes (sidebar, liens de la page…) avant que Next ne navigue
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a[href]");
      if (!a || leaving.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(a.getAttribute("href")!, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault(); // le lien Next ignore un clic déjà intercepté
      setTarget(url.pathname + url.search);
    };
    // Fermeture / rechargement : avertissement natif, puis départ signalé au serveur
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leaving.current) e.preventDefault();
    };
    const onPageHide = () => {
      if (!leaving.current) navigator.sendBeacon("/api/match/leave", matchId);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [matchId]);

  const confirmLeave = async () => {
    leaving.current = true;
    await leaveMatch(matchId);
    router.push(target ?? "/play");
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setTarget("/play")}>
        <LogOut /> Quitter la partie
      </Button>
      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitter la partie ?</DialogTitle>
            <DialogDescription>
              {inProgress
                ? "Tu ne pourras pas revenir : quitter compte comme un abandon et ton adversaire gagne la partie."
                : "Tu ne pourras pas revenir : la partie sera annulée et tes cartes libérées."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Rester</DialogClose>
            <Button variant="destructive" onClick={confirmLeave}>
              Quitter la partie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
