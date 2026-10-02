import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { createListing } from "@/app/market/actions";
import { applyRefreshToken } from "./actions";
import { createClient } from "@/lib/supabase/server";

type OwnedCard = CardData & { owner_id: string; locked_reason: string | null };

export default async function CardPage({ params, searchParams }: PageProps<"/card/[id]">) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: card }, { data: me }] = await Promise.all([
    supabase.from("cards").select(`${CARD_SELECT}, owner_id, locked_reason`).eq("id", id).returns<OwnedCard[]>().maybeSingle(),
    supabase.from("users").select("refresh_tokens").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  if (!card) notFound();
  const lastSold = card.videos.last_sold_price;

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, justifyItems: "center" }}>
      <Card card={card} big />
      <small>Clique sur la miniature pour voir la vidéo</small>

      {card.owner_id === user?.id && (
        card.locked_reason === "listing" ? (
          <p>📢 En vente sur le <Link href="/market">marché</Link></p>
        ) : (
          <form action={createListing} style={{ display: "grid", gap: 8, justifyItems: "center" }}>
            <input type="hidden" name="cardId" value={card.id} />
            <small>Dernière vente de cette vidéo : {lastSold != null ? `${lastSold} ViewCoins` : "jamais vendue"}</small>
            <label>
              Prix de départ{" "}
              <input name="price" type="number" min={1} defaultValue={lastSold ?? 100} required style={{ width: 100 }} />
            </label>
            <button>Mettre en vente (24 h)</button>
          </form>
        )
      )}
      {card.owner_id === user?.id && card.locked_reason !== "match" && (
        <form action={applyRefreshToken}>
          <input type="hidden" name="cardId" value={card.id} />
          <button disabled={!me?.refresh_tokens}>🔄 Utiliser un Jeton de Refresh ({me?.refresh_tokens ?? 0})</button>
        </form>
      )}
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      <Link href="/collection">← Ma collection</Link>
    </main>
  );
}
