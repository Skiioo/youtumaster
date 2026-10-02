export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "goat";
export type GoatReason = "absolute_views" | "whitelist";

/** Miroir de la table `rarity_tiers` (GOAT n'a pas de seuil : jamais atteint par calcul). */
export interface RarityTier {
  rarity: Exclude<Rarity, "goat">;
  minRarityViews: number;
}

export const DEFAULT_TIERS: readonly RarityTier[] = [
  { rarity: "legendary", minRarityViews: 100_000_000 },
  { rarity: "epic", minRarityViews: 25_000_000 },
  { rarity: "rare", minRarityViews: 5_000_000 },
  { rarity: "uncommon", minRarityViews: 500_000 },
  { rarity: "common", minRarityViews: 0 },
];

export const GOAT_ABSOLUTE_VIEWS = 1_500_000_000;

export interface RarityInput {
  platformVideoId: string;
  realViews: number;
  /** Multiplicateur du pays de la chaîne ; 1 si pays inconnu. */
  countryMultiplier: number;
  isWhitelisted: boolean;
}

export interface RarityResult {
  rarity: Rarity;
  goatReason: GoatReason | null;
  rarityViews: number;
}

/**
 * Ordre strict :
 *   1. Whitelist culturelle -> GOAT
 *   2. Vues RÉELLES >= 1,5 Md -> GOAT (le multiplicateur pays ne s'applique pas)
 *   3. Sinon Vues de Rareté = vues réelles x multiplicateur, classées par paliers,
 *      plafonnées à Légendaire.
 */
export function computeRarity(
  input: RarityInput,
  tiers: readonly RarityTier[] = DEFAULT_TIERS,
  goatThreshold = GOAT_ABSOLUTE_VIEWS,
): RarityResult {
  const realViews = Math.max(0, input.realViews);

  if (input.isWhitelisted) {
    return { rarity: "goat", goatReason: "whitelist", rarityViews: realViews };
  }
  if (realViews >= goatThreshold) {
    return { rarity: "goat", goatReason: "absolute_views", rarityViews: realViews };
  }

  const multiplier = input.countryMultiplier > 0 ? input.countryMultiplier : 1;
  const rarityViews = Math.floor(realViews * multiplier);
  const sorted = [...tiers].sort((a, b) => b.minRarityViews - a.minRarityViews);
  const tier = sorted.find((t) => rarityViews >= t.minRarityViews);

  return { rarity: tier?.rarity ?? "common", goatReason: null, rarityViews };
}
