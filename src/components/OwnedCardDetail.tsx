import Link from "next/link";
import { RotateCw, Shield, Star, Sword } from "lucide-react";
import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { CardDialog, CardDialogClose } from "@/components/CardDialog";
import { Button } from "@/components/ui/button";
import { Card as UiCard, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { applyRefreshToken, toggleFavorite } from "@/app/collection/actions";
import { createListing } from "@/app/market/actions";
import { createClient } from "@/lib/supabase/server";

type OwnedCard = CardData & { owner_id: string; locked_reason: string | null };

/** Durées de vente proposées (mêmes valeurs que celles autorisées par create_listing en SQL) */
const SALE_DURATIONS = [
  [1, "1 heure"],
  [6, "6 heures"],
  [12, "12 heures"],
  [24, "24 heures"],
  [48, "2 jours"],
  [72, "3 jours"],
] as const;

/** Popup de détail d'une carte de la collection : favoris, mise en vente, Jeton de Refresh. */
export async function OwnedCardDetail({ cardId, closeHref, returnTo, error }: {
  cardId: string;
  closeHref: string;
  returnTo: string;
  error?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: card }, { data: me }] = await Promise.all([
    supabase.from("cards").select(`${CARD_SELECT}, owner_id, locked_reason`).eq("id", cardId).returns<OwnedCard[]>().maybeSingle(),
    supabase.from("users").select("refresh_tokens").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  if (!card) {
    return (
      <CardDialog closeHref={closeHref} title="Carte introuvable">
        <div className="flex items-center justify-between gap-2">
          <p>Cette carte n&apos;existe pas ou ne t&apos;appartient plus.</p>
          <CardDialogClose />
        </div>
      </CardDialog>
    );
  }

  const lastSold = card.videos.last_sold_price;
  const isMine = card.owner_id === user?.id;
  const hidden = (
    <>
      <input type="hidden" name="cardId" value={card.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );

  return (
    <CardDialog closeHref={closeHref} title={card.videos.title}>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        {/* Carte plus étroite : la colonne de détails prend le reste de la place */}
        <Card card={card} big className="h-[24rem] w-64 shrink-0" />

        {/* Infos et actions, dans une carte à part */}
        <UiCard className="w-full sm:flex-1">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Détails</CardTitle>
              <div className="flex items-center gap-1">
                {isMine && (
                  <form action={toggleFavorite}>
                    {hidden}
                    <Button type="submit" variant="outline" size="sm">
                      <Star className={card.is_favorite ? "fill-amber-400 text-amber-500" : undefined} />
                      {card.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                    </Button>
                  </form>
                )}
                <CardDialogClose />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Clique sur la miniature pour voir la vidéo.</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <Sword className="size-5 text-red-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Attaque</p>
                  <p className="text-lg font-bold">{card.attack}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <Shield className="size-5 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Défense</p>
                  <p className="text-lg font-bold">{card.defense}</p>
                </div>
              </div>
            </div>
            <p className="text-sm">
              Dernière vente de cette vidéo :{" "}
              <span className="font-semibold">{lastSold != null ? `${lastSold.toLocaleString("fr-FR")} ViewCoins` : "jamais vendue"}</span>
            </p>

            {isMine && (
              <>
                <Separator />
                {card.locked_reason === "listing" ? (
                  <p className="text-sm">
                    📢 En vente sur le <Link href="/market">marché</Link>
                  </p>
                ) : (
                  <form action={createListing} className="grid gap-2">
                    {hidden}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor="price">Prix de départ</Label>
                        <Input id="price" name="price" type="number" min={1} defaultValue={lastSold ?? 100} required />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="hours">Durée de la vente</Label>
                        <select id="hours" name="hours" defaultValue="24">
                          {SALE_DURATIONS.map(([hours, label]) => (
                            <option key={hours} value={hours}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button type="submit">Mettre en vente</Button>
                  </form>
                )}
              </>
            )}

            {isMine && card.locked_reason !== "match" && (
              <>
                <Separator />
                <form action={applyRefreshToken}>
                  {hidden}
                  <Button type="submit" variant="outline" className="w-full" disabled={!me?.refresh_tokens}>
                    <RotateCw /> Utiliser un Jeton de Refresh ({me?.refresh_tokens ?? 0})
                  </Button>
                </form>
              </>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>
        </UiCard>
      </div>
    </CardDialog>
  );
}
