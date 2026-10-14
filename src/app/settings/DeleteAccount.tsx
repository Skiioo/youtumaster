"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteAccount } from "./actions";
import { CONFIRM_WORD } from "./confirm";

/** Double validation : ouvrir la confirmation, puis taper exactement "Supprimer". */
export function DeleteAccount() {
  const [typed, setTyped] = useState("");
  return (
    <Dialog onOpenChange={() => setTyped("")}>
      <DialogTrigger render={<Button variant="destructive" />}>
        <Trash2 /> Supprimer mon compte
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer définitivement ton compte ?</DialogTitle>
          <DialogDescription>
            Toutes tes cartes, tes ViewCoins, tes titres et tes amis seront effacés. Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>
        <form action={deleteAccount} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span>
              Pour confirmer, tape <strong>{CONFIRM_WORD}</strong> :
            </span>
            <Input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </label>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" variant="destructive" disabled={typed !== CONFIRM_WORD}>
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
