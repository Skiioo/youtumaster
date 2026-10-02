import { Badge } from "@/components/ui/badge";
import { Card as UiCard, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const CARD_SELECT =
  "id, rarity, variant, attack, defense, snap_view_count, videos(platform_video_id, title, last_sold_price, factions(id, name))";

export type CardData = {
  id: string;
  rarity: string;
  variant: string;
  attack: number;
  defense: number;
  snap_view_count: number;
  videos: {
    platform_video_id: string;
    title: string;
    last_sold_price: number | null;
    factions: { id: number; name: string } | null;
  };
};

export const thumbnailUrl = (videoId: string) => process.env.NEXT_PUBLIC_THUMBNAIL_URL_TEMPLATE!.replace("{id}", videoId);
export const videoUrl = (videoId: string) => process.env.NEXT_PUBLIC_VIDEO_URL_TEMPLATE!.replace("{id}", videoId);

export const RARITY: Record<string, { label: string; className: string }> = {
  common: { label: "Commune", className: "bg-zinc-500 text-white" },
  uncommon: { label: "Peu commune", className: "bg-emerald-600 text-white" },
  rare: { label: "Rare", className: "bg-sky-600 text-white" },
  epic: { label: "Epic", className: "bg-violet-600 text-white" },
  legendary: { label: "Légendaire", className: "bg-amber-500 text-black" },
  goat: { label: "GOAT", className: "bg-linear-to-r from-red-500 via-yellow-400 to-blue-500 text-black" },
};

const VARIANT_RING: Record<string, string> = {
  gold: "ring-2 ring-amber-400",
  dark: "ring-2 ring-zinc-900",
  rainbow: "ring-2 ring-fuchsia-500",
};

/** Petite carte (grille) ou grande carte (vue détaillée, miniature cliquable vers la vidéo). */
export function Card({ card, big = false }: { card: CardData; big?: boolean }) {
  const videoId = card.videos.platform_video_id;
  const rarity = RARITY[card.rarity] ?? RARITY.common;
  const thumb = (
    // eslint-disable-next-line @next/next/no-img-element -- miniature externe, jamais hébergée chez nous
    <img src={thumbnailUrl(videoId)} alt={card.videos.title} className="aspect-video w-full rounded-md object-cover" />
  );

  return (
    <UiCard className={cn("gap-2 py-2", big && "w-full max-w-md", VARIANT_RING[card.variant])}>
      <CardContent className="grid gap-2 px-2">
        {big ? (
          <a href={videoUrl(videoId)} target="_blank" rel="noreferrer" title="Voir la vidéo">
            {thumb}
          </a>
        ) : (
          thumb
        )}
        <div className="flex flex-wrap items-center gap-1">
          <Badge className={rarity.className}>{rarity.label}</Badge>
          {card.variant !== "normal" && <Badge variant="outline">{card.variant}</Badge>}
          {card.videos.factions && <Badge variant="secondary">{card.videos.factions.name}</Badge>}
        </div>
        <p className={cn("line-clamp-2 text-sm font-medium", big && "text-base")}>{card.videos.title}</p>
        <p className="text-xs text-muted-foreground">
          ⚔️ {card.attack} · 🛡️ {card.defense} · 👁️ {card.snap_view_count.toLocaleString("fr-FR")}
        </p>
      </CardContent>
    </UiCard>
  );
}
