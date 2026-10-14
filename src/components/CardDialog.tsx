"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Popup de détail d'une carte, pilotée par l'URL (?card=…) : la fermer revient à closeHref. */
export function CardDialog({ closeHref, title, children }: { closeHref: string; title: string; children: ReactNode }) {
  const router = useRouter();
  return (
    // Un clic sur le fond grisé, en dehors de la popup, ferme le détail
    <Dialog open onOpenChange={(open) => !open && router.replace(closeHref, { scroll: false })}>
      <DialogContent showCloseButton={false} className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Croix de fermeture, placée où l'on veut dans la popup (en haut à droite de la section de détails). */
export function CardDialogClose() {
  return (
    // Marges négatives : la croix se cale dans le coin, au-delà du rembourrage de la section
    <DialogClose render={<Button variant="ghost" size="icon-sm" className="-mt-3 -mr-3" />}>
      <XIcon />
      <span className="sr-only">Fermer</span>
    </DialogClose>
  );
}
