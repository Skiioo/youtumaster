import Link from "next/link";
import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { createClient } from "@/lib/supabase/server";

export default async function CollectionPage({ searchParams }: PageProps<"/collection">) {
  const { sort } = await searchParams;
  const byRecent = sort === "recent";
  const supabase = await createClient();

  let query = supabase.from("cards").select(CARD_SELECT);
  query = byRecent
    ? query.order("obtained_at", { ascending: false })
    : query.order("rarity", { ascending: false }).order("attack", { ascending: false });
  // ponytail: plafond fixe, paginer quand une collection dépassera 500 cartes
  const { data } = await query.limit(500).returns<CardData[]>();
  // Tri par faction en JS : PostgREST ne trie pas une table par la colonne d'une table jointe
  const cards = sort === "faction"
    ? data?.toSorted((a, b) => (a.videos.factions?.id ?? 99) - (b.videos.factions?.id ?? 99))
    : data;

  return (
    <main style={{ padding: 24 }}>
      <h1>Ma collection ({cards?.length ?? 0})</h1>
      <p>
        Trier : <Link href="/collection">rareté</Link> · <Link href="/collection?sort=faction">faction</Link> ·{" "}
        <Link href="/collection?sort=recent">plus récentes</Link>
      </p>
      <ul className="card-grid">
        {cards?.map((c) => (
          <li key={c.id}>
            <Link href={`/card/${c.id}`}>
              <Card card={c} />
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/">← Retour</Link>
    </main>
  );
}
