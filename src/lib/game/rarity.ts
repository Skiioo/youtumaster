export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "goat";
export type Variant = "normal" | "gold" | "dark" | "rainbow";
export type GoatReason = "absolute_views" | "whitelist";

export const RARITY_ORDER: readonly Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "goat",
];

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

/** Une carte rafraîchie ne peut jamais perdre de rareté (ex : vues purgées par la plateforme). */
export function maxRarity(a: Rarity, b: Rarity): Rarity {
  return RARITY_ORDER.indexOf(a) >= RARITY_ORDER.indexOf(b) ? a : b;
}

export const VARIANT_CHANCES = {
  legendary: { gold: 0.08, dark: 0.04 },
  goat: { gold: 0.1, dark: 0.05 },
} as const;

/** Tirage de variante au moment du drop. `rng` injectable pour les tests / la reproductibilité. */
export function rollVariant(rarity: Rarity, rng: () => number = Math.random): Variant {
  if (rarity !== "legendary" && rarity !== "goat") return "normal";
  const { gold, dark } = VARIANT_CHANCES[rarity];
  const roll = rng();
  if (roll < dark) return "dark";
  if (roll < dark + gold) return "gold";
  return rarity === "goat" ? "rainbow" : "normal";
}

const BASE_STATS: Record<Rarity, number> = {
  common: 10,
  uncommon: 20,
  rare: 35,
  epic: 55,
  legendary: 80,
  goat: 120,
};

const VARIANT_BOOST: Record<Variant, number> = {
  normal: 1,
  rainbow: 1,
  gold: 1.15,
  dark: 1.25,
};

/**
 * Attaque/Défense : base du palier + bonus logarithmique sur les vues réelles,
 * pour que 2 Md de vues ne fassent pas 1000x plus mal que 2 M.
 * La répartition ATK/DEF dépend du ratio likes/vues (vidéo "aimée" = plus défensive).
 */
export function computeStats(
  rarity: Rarity,
  variant: Variant,
  realViews: number,
  likes: number | null,
): { attack: number; defense: number } {
  const power = BASE_STATS[rarity] + Math.log10(Math.max(realViews, 1)) * 3;
  const likeRatio = likes && realViews > 0 ? Math.min(likes / realViews, 0.1) : 0.03;
  const defenseShare = 0.4 + likeRatio * 2; // 0.40 .. 0.60
  const boost = VARIANT_BOOST[variant];
  return {
    attack: Math.round(power * (1 - defenseShare) * 2 * boost),
    defense: Math.round(power * defenseShare * 2 * boost),
  };
}
