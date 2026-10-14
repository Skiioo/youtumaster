// Fichier neutre (ni client ni serveur) : importé par la page serveur ET le composant client.
// Une valeur exportée d'un fichier "use client" n'est qu'une référence opaque côté serveur.
/** Tris proposés par page ; "rarity" est le tri par défaut partout */
export const COLLECTION_SORTS = { rarity: "Rareté", name: "Nom", favorites: "Favoris", recent: "Date d'ajout" };
export const CATALOG_SORTS = { rarity: "Rareté", name: "Nom", views: "Vues", recent: "Date de publication" };
export const MARKET_SORTS = {
  rarity: "Rareté",
  ending: "Fin proche",
  price_asc: "Prix croissant",
  price_desc: "Prix décroissant",
  recent: "Mises en vente récentes",
};
export type Sorts = Record<string, string>;

export const parseSort = (sorts: Sorts, value: unknown): string =>
  typeof value === "string" && Object.hasOwn(sorts, value) ? value : "rarity";

/** Filtres de rareté, de la plus haute à la plus basse : [valeur, libellé du bouton, nom complet] */
export const RARITY_FILTERS = [
  ["goat", "YOAT", "YOAT"],
  ["legendary", "L", "Légendaire"],
  ["epic", "E", "Epic"],
  ["rare", "R", "Rare"],
  ["uncommon", "P", "Peu commune"],
  ["common", "C", "Commune"],
] as const;
export type RarityFilter = (typeof RARITY_FILTERS)[number][0];

export const parseRarity = (value: unknown): RarityFilter | null =>
  RARITY_FILTERS.find(([r]) => r === value)?.[0] ?? null;

/** Adresse d'une page filtrée : ?q=…&sort=…&rarity=…&page=… (valeurs par défaut omises) */
export function filtersHref(
  basePath: string,
  f: { q: string; sort: string; rarity: RarityFilter | null; page?: number },
): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.sort !== "rarity") p.set("sort", f.sort);
  if (f.rarity) p.set("rarity", f.rarity);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  return `${basePath}${p.size ? `?${p}` : ""}`;
}

/** Nombre de cartes par page (collection et catalogue) */
export const PAGE_SIZE = 60;

/** Ajoute, remplace (valeur) ou retire (null) des paramètres d'une adresse relative. */
export function withParams(href: string, params: Record<string, string | null>): string {
  const url = new URL(href, "http://local");
  for (const [k, v] of Object.entries(params)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  return url.pathname + url.search;
}

/** Adresse de retour reçue d'un formulaire : uniquement un chemin interne (pas de redirection ouverte). */
export const safeReturnTo = (value: unknown, fallback = "/collection"): string =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
