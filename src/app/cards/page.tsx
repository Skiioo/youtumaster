import Link from "next/link";
import { Card, type CardData } from "@/components/Card";
import { CatalogCardDetail } from "@/components/CatalogCardDetail";
import { CatalogStats } from "@/components/CatalogStats";
import { CardFilters } from "@/components/CardFilters";
import { PageTitle } from "@/components/PageTitle";
import { CATALOG_SORTS, filtersHref, PAGE_SIZE, parseRarity, parseSort, withParams } from "@/lib/cardFilters";
import { PagePagination, parsePage } from "@/components/PagePagination";
import { createClient } from "@/lib/supabase/server";

type CatalogRow = {
  id: string;
  platform_video_id: string;
  title: string;
  rarity: string;
  view_count: number;
  last_sold_price: number | null;
  faction_id: number | null;
  faction_name: string | null;
  creator_name: string | null;
  attack: number;
  defense: number;
};

/** Une vidéo du catalogue affichée comme une carte (variante normale, stats de base). */
const toCard = (r: CatalogRow): CardData => ({
  id: r.id,
  rarity: r.rarity,
  variant: "normal",
  attack: r.attack,
  defense: r.defense,
  snap_view_count: r.view_count,
  is_favorite: false,
  videos: {
    platform_video_id: r.platform_video_id,
    title: r.title,
    last_sold_price: r.last_sold_price,
    factions: r.faction_id != null ? { id: r.faction_id, name: r.faction_name ?? "" } : null,
    creators: r.creator_name ? { name: r.creator_name } : null,
  },
});

/** Plafond du comptage d'une recherche : 100 pages de 60 cartes */
const COUNT_CAP = 100 * PAGE_SIZE;

export default async function CatalogPage({ searchParams }: PageProps<"/cards">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const sort = parseSort(CATALOG_SORTS, params.sort);
  const rarity = parseRarity(params.rarity);
  const page = parsePage(params.page);
  const pq = q.replace(/[\\%_]/g, "\\$&"); // échappe % et _ pour ILIKE

  const supabase = await createClient();
  const [{ data, error }, total] = await Promise.all([
    supabase.rpc("catalog_page", { p_q: pq, p_rarity: rarity, p_sort: sort, p_offset: (page - 1) * PAGE_SIZE, p_limit: PAGE_SIZE }),
    q
      ? // Recherche : comptage exact, plafonné
        supabase.rpc("catalog_count", { p_q: pq, p_rarity: rarity, p_cap: COUNT_CAP }).then((r) => Number(r.data ?? 0))
      : // Sans recherche : estimation de Postgres (instantanée, à < 1 % près)
        (rarity
          ? supabase.from("videos").select("id", { count: "estimated", head: true }).eq("is_available", true).eq("current_rarity", rarity)
          : supabase.from("videos").select("id", { count: "estimated", head: true }).eq("is_available", true)
        ).then((r) => r.count ?? 0),
  ]);
  const rows = (data ?? []) as CatalogRow[];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const capped = !!q && total >= COUNT_CAP; // plus de résultats que le plafond : "Page X sur 100+"
  const hrefFor = (n: number) => filtersHref("/cards", { q, sort, rarity, page: n });
  const pagination = <PagePagination page={page} totalPages={totalPages} hrefFor={hrefFor} more={capped} />;
  // Popup de détail : ?card=<id de la vidéo> par-dessus la page courante
  const here = hrefFor(page);
  const openCard = typeof params.card === "string" ? params.card : null;

  return (
    <main className="p-6">
      <PageTitle href="/cards">Toutes les cartes</PageTitle>
      <CatalogStats />
      <CardFilters basePath="/cards" sorts={CATALOG_SORTS} q={q} sort={sort} rarity={rarity} />

      {error && <p role="alert" className="text-destructive">Impossible de charger le catalogue : {error.message}</p>}
      {!error && rows.length === 0 && <p className="text-muted-foreground">Aucune carte ne correspond à ces filtres.</p>}

      {pagination}
      <ul className="card-grid justify-center [--card-w:12rem]">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={withParams(here, { card: r.id })} scroll={false} className="card-link">
              <Card card={toCard(r)} small />
            </Link>
          </li>
        ))}
      </ul>

      {pagination}
      {openCard && <CatalogCardDetail videoId={openCard} closeHref={here} />}
    </main>
  );
}
