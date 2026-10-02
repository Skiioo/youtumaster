import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { createClient } from "@/lib/supabase/server";
import { placeBid } from "./actions";

type Listing = {
  id: string;
  start_price: number;
  current_bid: number | null;
  ends_at: string;
  cards: CardData;
};

export default async function MarketPage({ searchParams }: PageProps<"/market">) {
  const { error } = await searchParams;
  const supabase = await createClient();
  await supabase.rpc("close_expired_listings"); // filet de sécurité si pg_cron a du retard

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: me }, { data: listings }] = await Promise.all([
    supabase.from("users").select("viewcoins").eq("id", user?.id ?? "").maybeSingle(),
    supabase
      .from("market_listings")
      .select(`id, start_price, current_bid, ends_at, cards(${CARD_SELECT})`)
      .eq("status", "active")
      .order("ends_at")
      .limit(100)
      .returns<Listing[]>(),
  ]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Marché</h1>
      <p>Ton solde : {me?.viewcoins ?? 0} ViewCoins</p>
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      {!listings?.length && <p>Aucune carte en vente pour l&apos;instant.</p>}
      <ul className="card-grid">
        {listings?.map((l) => {
          const min = l.current_bid != null ? l.current_bid + 1 : l.start_price;
          return (
            <li key={l.id}>
              <Card card={l.cards} />
              <p>
                {l.current_bid != null ? `Enchère : ${l.current_bid}` : `Départ : ${l.start_price}`} ViewCoins
                <br />
                <small>Fin : {new Date(l.ends_at).toLocaleString("fr-FR")}</small>
              </p>
              <form action={placeBid} style={{ display: "flex", gap: 4 }}>
                <input type="hidden" name="listingId" value={l.id} />
                <input name="amount" type="number" min={min} defaultValue={min} required style={{ width: 100 }} />
                <button>Enchérir</button>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
