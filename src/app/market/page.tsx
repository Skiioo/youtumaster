import { Clock, Coins, Gavel } from "lucide-react";
import { CardFilters } from "@/components/CardFilters";
import { PagePagination, parsePage } from "@/components/PagePagination";
import { PageTitle } from "@/components/PageTitle";
import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Card as UiCard, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { filtersHref, MARKET_SORTS, PAGE_SIZE, parseRarity, parseSort } from "@/lib/cardFilters";
import { createClient } from "@/lib/supabase/server";
import { placeBid } from "./actions";

type Listing = {
  id: string;
  start_price: number;
  current_bid: number | null;
  ends_at: string;
  created_at: string;
  cards: CardData;
};

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

/** Temps restant lisible : "dans 5 heures", "dans 12 minutes"… */
function timeLeft(endsAt: string) {
  const minutes = Math.round((Date.parse(endsAt) - Date.now()) / 60_000);
  if (minutes <= 0) return "terminée";
  return minutes >= 60 ? rtf.format(Math.round(minutes / 60), "hour") : rtf.format(minutes, "minute");
}

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "goat"];
const priceOf = (l: Listing) => l.current_bid ?? l.start_price;

/** Tri en JS : PostgREST ne trie pas les annonces par une colonne de la carte ou par "prix courant" */
const SORT_FNS: Record<string, (a: Listing, b: Listing) => number> = {
  rarity: (a, b) => RARITY_ORDER.indexOf(b.cards.rarity) - RARITY_ORDER.indexOf(a.cards.rarity) || a.ends_at.localeCompare(b.ends_at),
  ending: (a, b) => a.ends_at.localeCompare(b.ends_at),
  price_asc: (a, b) => priceOf(a) - priceOf(b),
  price_desc: (a, b) => priceOf(b) - priceOf(a),
  recent: (a, b) => b.created_at.localeCompare(a.created_at),
};

export default async function MarketPage({ searchParams }: PageProps<"/market">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const sort = parseSort(MARKET_SORTS, params.sort);
  const rarity = parseRarity(params.rarity);
  const page = parsePage(params.page);

  const supabase = await createClient();
  await supabase.rpc("close_expired_listings"); // filet de sécurité si pg_cron a du retard

  // !inner : filtrer sur la carte (rareté) ou la vidéo (titre) filtre bien les annonces
  const cardSelect = q ? CARD_SELECT.replace("videos(", "videos!inner(") : CARD_SELECT;
  let query = supabase
    .from("market_listings")
    .select(`id, start_price, current_bid, ends_at, created_at, cards!inner(${cardSelect})`)
    .eq("status", "active");
  if (rarity) query = query.eq("cards.rarity", rarity);
  if (q) query = query.ilike("cards.videos.title", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  // ponytail: annonces chargées puis triées/paginées ici (plafond 1000), passer en SQL si le marché grossit
  const { data } = await query.limit(1000).returns<Listing[]>();

  const all = (data ?? []).toSorted(SORT_FNS[sort]);
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const listings = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hrefFor = (n: number) => filtersHref("/market", { q, sort, rarity, page: n });
  const here = hrefFor(page);
  const pagination = <PagePagination page={page} totalPages={totalPages} hrefFor={hrefFor} />;

  return (
    <main className="p-6">
      <PageTitle href="/market">Marché ({all.length})</PageTitle>
      <CardFilters basePath="/market" sorts={MARKET_SORTS} q={q} sort={sort} rarity={rarity} />
      {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}

      {!all.length && (
        <UiCard className="max-w-2xl">
          <CardHeader>
            {q || rarity ? (
              <CardTitle>Aucune vente ne correspond à ces filtres</CardTitle>
            ) : (
              <>
                <CardTitle>Aucune carte en vente pour l&apos;instant</CardTitle>
                <CardDescription>Mets une de tes cartes aux enchères depuis ta collection.</CardDescription>
              </>
            )}
          </CardHeader>
        </UiCard>
      )}

      {pagination}

      {/* Une vente = une carte : la carte de jeu, les infos de la vente et l'enchère */}
      <ul className="card-grid justify-center [--card-w:14rem]">
        {listings.map((l) => {
          const hasBid = l.current_bid != null;
          const price = l.current_bid ?? l.start_price;
          const min = hasBid ? l.current_bid! + 1 : l.start_price;
          return (
            <li key={l.id}>
              <UiCard className="gap-3 py-3">
                <CardContent className="grid justify-items-center gap-3 px-3">
                  <Card card={l.cards} small />

                  <div className="grid w-full gap-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{hasBid ? "Enchère actuelle" : "Prix de départ"}</span>
                      <span className="flex items-center gap-1 font-semibold">
                        <Coins className="size-4 text-amber-500" />
                        {price.toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>Fin</span>
                      <span className="flex items-center gap-1" title={new Date(l.ends_at).toLocaleString("fr-FR")}>
                        <Clock className="size-4" />
                        {timeLeft(l.ends_at)}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  <form action={placeBid} className="flex w-full gap-2">
                    <input type="hidden" name="listingId" value={l.id} />
                    <input type="hidden" name="returnTo" value={here} />
                    <Input name="amount" type="number" min={min} defaultValue={min} required aria-label="Montant de l'enchère" />
                    <Button type="submit" size="sm" className="h-8">
                      <Gavel /> Enchérir
                    </Button>
                  </form>
                </CardContent>
              </UiCard>
            </li>
          );
        })}
      </ul>
      {pagination}
    </main>
  );
}
