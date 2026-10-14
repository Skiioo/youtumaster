import { ExternalLink, Shield, Sword } from "lucide-react";
import { Card, videoUrl, type CardData } from "@/components/Card";
import { CardDialog, CardDialogClose } from "@/components/CardDialog";
import { Button } from "@/components/ui/button";
import { Card as UiCard, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";

type VideoRow = {
  id: string;
  platform_video_id: string;
  title: string;
  current_rarity: string;
  view_count: number;
  like_count: number | null;
  last_sold_price: number | null;
  published_at: string;
  factions: { id: number; name: string } | null;
  creators: { name: string } | null;
};

/** Popup de détail d'une vidéo du catalogue (pas de carte possédée : infos seulement). */
export async function CatalogCardDetail({ videoId, closeHref }: { videoId: string; closeHref: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: v } = await supabase
    .from("videos")
    .select("id, platform_video_id, title, current_rarity, view_count, like_count, last_sold_price, published_at, factions(id, name), creators(name)")
    .eq("id", videoId)
    .returns<VideoRow[]>()
    .maybeSingle();

  if (!v) {
    return (
      <CardDialog closeHref={closeHref} title="Carte introuvable">
        <div className="flex items-center justify-between gap-2">
          <p>Cette carte n&apos;existe pas ou n&apos;est plus disponible.</p>
          <CardDialogClose />
        </div>
      </CardDialog>
    );
  }

  const [{ data: stats }, { count: owned }] = await Promise.all([
    supabase
      .rpc("card_stats", { p_rarity: v.current_rarity, p_variant: "normal", p_views: v.view_count, p_likes: v.like_count })
      .single<{ attack: number; defense: number }>(),
    supabase.from("cards").select("id", { count: "exact", head: true }).eq("owner_id", user?.id ?? "").eq("video_id", v.id),
  ]);

  const card: CardData = {
    id: v.id,
    rarity: v.current_rarity,
    variant: "normal",
    attack: stats?.attack ?? 0,
    defense: stats?.defense ?? 0,
    snap_view_count: v.view_count,
    is_favorite: false,
    videos: { platform_video_id: v.platform_video_id, title: v.title, last_sold_price: v.last_sold_price, factions: v.factions, creators: v.creators },
  };
  const row = (label: string, value: string) => (
    <p className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </p>
  );

  return (
    <CardDialog closeHref={closeHref} title={v.title}>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        {/* Carte plus étroite : la colonne de détails prend le reste de la place */}
        <Card card={card} big className="h-[24rem] w-64 shrink-0" />

        <UiCard className="w-full sm:flex-1">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Détails</CardTitle>
              <CardDialogClose />
            </div>
            <p className="text-sm text-muted-foreground">Stats de base d&apos;un exemplaire normal.</p>
          </CardHeader>
          <CardContent className="grid gap-3">
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
            {row("Chaîne", v.creators?.name ?? "—")}
            {row("Publiée le", new Date(v.published_at).toLocaleDateString("fr-FR"))}
            {row("Vues", v.view_count.toLocaleString("fr-FR"))}
            {v.like_count != null && row("Likes", v.like_count.toLocaleString("fr-FR"))}
            {row("Dernière vente", v.last_sold_price != null ? `${v.last_sold_price.toLocaleString("fr-FR")} ViewCoins` : "jamais vendue")}
            <Separator />
            {row("Dans ta collection", owned ? `${owned} exemplaire${owned > 1 ? "s" : ""}` : "aucun")}
            <Button variant="outline" nativeButton={false} render={<a href={videoUrl(v.platform_video_id)} target="_blank" rel="noreferrer" />}>
              <ExternalLink /> Voir la vidéo
            </Button>
          </CardContent>
        </UiCard>
      </div>
    </CardDialog>
  );
}
