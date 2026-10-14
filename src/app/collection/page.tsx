import Link from "next/link";
import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { PageTitle } from "@/components/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { CardFilters } from "@/components/CardFilters";
import { PagePagination, parsePage } from "@/components/PagePagination";
import { OwnedCardDetail } from "@/components/OwnedCardDetail";
import { COLLECTION_SORTS, filtersHref, PAGE_SIZE, parseRarity, parseSort, withParams } from "@/lib/cardFilters";

export default async function CollectionPage({ searchParams }: PageProps<"/collection">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const sort = parseSort(COLLECTION_SORTS, params.sort);
  const rarity = parseRarity(params.rarity);
  const page = parsePage(params.page);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // owner_id obligatoire : la RLS laisse aussi voir les cartes des autres mises en vente
  // !inner : la recherche sur le titre filtre les cartes, pas seulement la vidéo jointe
  let query = supabase
    .from("cards")
    .select(q ? CARD_SELECT.replace("videos(", "videos!inner(") : CARD_SELECT)
    .eq("owner_id", user?.id ?? "");
  if (rarity) query = query.eq("rarity", rarity);
  if (q) query = query.ilike("videos.title", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (sort === "recent") query = query.order("obtained_at", { ascending: false });
  if (sort === "favorites") query = query.order("is_favorite", { ascending: false });
  query = query.order("rarity", { ascending: false }).order("attack", { ascending: false });

  // ponytail: collection chargée en entier (plafond 2000) puis paginée ici, car le tri par nom
  // se fait en JS ; passer à une pagination SQL si des collections dépassent ce plafond
  const { data } = await query.limit(2000).returns<CardData[]>();
  // Tri par nom en JS : PostgREST ne trie pas une table par la colonne d'une table jointe
  const all = (sort === "name" ? data?.toSorted((a, b) => a.videos.title.localeCompare(b.videos.title, "fr")) : data) ?? [];
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const cards = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hrefFor = (n: number) => filtersHref("/collection", { q, sort, rarity, page: n });
  const pagination = <PagePagination page={page} totalPages={totalPages} hrefFor={hrefFor} />;
  // Popup de détail : ?card=<id> par-dessus la page courante (filtres et page conservés)
  const here = hrefFor(page);
  const openCard = typeof params.card === "string" ? params.card : null;

  return (
    <main className="p-6">
      <PageTitle href="/collection">Ma collection ({all.length})</PageTitle>
      <CardFilters basePath="/collection" sorts={COLLECTION_SORTS} q={q} sort={sort} rarity={rarity} />
      {(q || rarity) && !all.length && <p className="text-muted-foreground">Aucune carte ne correspond à ces filtres.</p>}
      {pagination}
      <ul className="card-grid justify-center [--card-w:12rem]">
        {cards.map((c) => (
          <li key={c.id}>
            <Link href={withParams(here, { card: c.id })} scroll={false} className="card-link">
              <Card card={c} small />
            </Link>
          </li>
        ))}
      </ul>
      {pagination}
      {openCard && (
        <OwnedCardDetail
          cardId={openCard}
          closeHref={here}
          returnTo={withParams(here, { card: openCard })}
          error={typeof params.error === "string" ? params.error : undefined}
        />
      )}
    </main>
  );
}
