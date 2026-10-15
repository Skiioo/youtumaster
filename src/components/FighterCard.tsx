import { Heart, Sword } from "lucide-react";
import { RARITY_BG, thumbnailUrl } from "@/components/Card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Fighter = {
  owner: string;
  video: string;
  title: string;
  rarity: string;
  faction: number | null;
  attack: number;
  hp: number;
  max_hp: number;
};

/** Carte d'un combat : miniature, faction, barre de PV colorée selon la vie restante. */
export function FighterCard({ c, factionName, selected, className }: {
  c: Fighter;
  factionName?: string;
  selected?: boolean;
  className?: string;
}) {
  const pct = Math.round((c.hp / c.max_hp) * 100);
  const ko = c.hp <= 0;
  return (
    <div
      className={cn(
        "flex h-60 w-44 flex-col gap-1.5 overflow-hidden rounded-xl p-2 text-left text-zinc-900 ring-1 ring-foreground/10 transition-all",
        RARITY_BG[c.rarity] ?? RARITY_BG.common,
        ko && "opacity-35 grayscale",
        selected && "ring-4 ring-ring",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- miniature externe */}
      <img src={thumbnailUrl(c.video)} alt={c.title} className="aspect-video w-full rounded-md object-cover" />
      {factionName && (
        <Badge variant="outline" className="border-zinc-900/20 text-zinc-900">
          {factionName}
        </Badge>
      )}
      <p className="line-clamp-2 text-xs font-medium">{c.title}</p>
      <div className="mt-auto grid gap-1">
        <div className="h-2 overflow-hidden rounded-full bg-zinc-900/15" role="meter" aria-valuenow={c.hp} aria-valuemin={0} aria-valuemax={c.max_hp} aria-label="Points de vie">
          <div
            className={cn("h-full rounded-full transition-all", pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : "bg-red-500")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="flex items-center gap-2 text-xs text-zinc-700 [&_svg]:size-3.5">
          <span className="flex items-center gap-1">
            <Heart className="text-red-500" /> {c.hp}/{c.max_hp}
          </span>
          <span className="flex items-center gap-1">
            <Sword className="text-red-500" /> {c.attack}
          </span>
          {ko && <span className="ml-auto font-bold">K.O.</span>}
        </p>
      </div>
    </div>
  );
}
