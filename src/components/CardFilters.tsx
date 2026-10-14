"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { filtersHref, RARITY_FILTERS, type RarityFilter, type Sorts } from "@/lib/cardFilters";

/**
 * Bouton de rareté actif : fond de la couleur de rareté, maintenu au survol et en mode sombre
 * (sinon les styles hover/dark de shadcn le remplacent et la lettre devient invisible).
 */
const ACTIVE: Record<RarityFilter, string> = {
  goat: "bg-linear-to-br from-red-200 via-yellow-100 to-sky-200",
  legendary: "bg-amber-200 hover:bg-amber-200 dark:hover:bg-amber-200",
  epic: "bg-violet-200 hover:bg-violet-200 dark:hover:bg-violet-200",
  rare: "bg-sky-200 hover:bg-sky-200 dark:hover:bg-sky-200",
  uncommon: "bg-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-200",
  common: "bg-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-200",
};

type Filters = { q: string; sort: string; rarity: RarityFilter | null };

/** Recherche (au fil de la frappe), tri et filtre de rareté, reflétés dans l'URL : ?q=…&sort=…&rarity=… */
/** basePath : page à mettre à jour (/collection, /cards) ; sorts : tris proposés sur cette page */
export function CardFilters({ basePath, sorts, q, sort, rarity }: Filters & { basePath: string; sorts: Sorts }) {
  const router = useRouter();
  const [text, setText] = useState(q);

  const go = (next: Partial<Filters>) =>
    router.replace(filtersHref(basePath, { q: text, sort, rarity, ...next }), { scroll: false });

  // Attend 300 ms sans frappe avant de lancer la recherche
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => go({ q: text }), 300);
    return () => clearTimeout(t);
  });

  return (
    <div className="mb-6 grid gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Rechercher une carte…"
            aria-label="Rechercher une carte"
            className="pl-8"
          />
        </div>
        <Select
          items={sorts}
          value={sort}
          onValueChange={(v) => go({ sort: v as string })}
        >
          <SelectTrigger className="w-44" aria-label="Trier par">
            <SelectValue />
          </SelectTrigger>
          {/* alignItemWithTrigger={false} : la liste s'ouvre sous le bouton au lieu de le recouvrir */}
          <SelectContent alignItemWithTrigger={false} side="bottom" align="end">
            {Object.entries(sorts).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Un clic filtre sur la rareté, un second clic retire le filtre */}
      <div className="flex gap-2" role="group" aria-label="Filtrer par rareté">
        {RARITY_FILTERS.map(([value, short, full]) => {
          const active = rarity === value;
          return (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              title={full}
              aria-label={full}
              aria-pressed={active}
              onClick={() => go({ rarity: active ? null : value })}
              className={cn(
                "min-w-9 font-bold",
                active && [ACTIVE[value], "text-zinc-900 hover:text-zinc-900"],
              )}
            >
              {short}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
