import { RARITY_BG } from "@/components/Card";
import { Card as UiCard, CardContent } from "@/components/ui/card";
import { RARITY_FILTERS } from "@/lib/cardFilters";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/** Nombre de cartes disponibles dans le catalogue, au total et par rareté (de YOAT à Commune). */
export async function CatalogStats() {
  const supabase = await createClient();
  // Un comptage par rareté, en parallèle. "estimated" : exact pour les petites raretés,
  // estimation de Postgres pour les grosses (un comptage exact de 1 M+ de lignes prend des secondes)
  const counts = await Promise.all(
    RARITY_FILTERS.map(async ([rarity]) => {
      const { count } = await supabase
        .from("videos")
        .select("id", { count: "estimated", head: true })
        .eq("is_available", true)
        .eq("current_rarity", rarity);
      return count ?? 0;
    }),
  );
  const total = counts.reduce((a, b) => a + b, 0);

  // Version discrète : une ligne de texte gris, une pastille de couleur par rareté
  return (
    <UiCard className="mb-6 py-3 shadow-none">
      <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>
          ~<span className="font-semibold text-foreground">{total.toLocaleString("fr-FR")}</span> cartes disponibles
        </span>
        {RARITY_FILTERS.map(([rarity, short, label], i) => (
          <span key={rarity} className="flex items-center gap-1.5" title={label}>
            <span className={cn("size-2.5 rounded-full", RARITY_BG[rarity])} aria-hidden />
            {short} : <span className="font-medium text-foreground">{counts[i].toLocaleString("fr-FR")}</span>
          </span>
        ))}
      </CardContent>
    </UiCard>
  );
}
