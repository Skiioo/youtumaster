import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { createClient } from "@/lib/supabase/server";

type Item = { slot: number; is_refresh_token: boolean; cards: CardData | null };

export default async function BoosterPage({ params }: PageProps<"/booster/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("booster_items")
    .select(`slot, is_refresh_token, cards(${CARD_SELECT})`)
    .eq("booster_id", id)
    .order("slot")
    .returns<Item[]>();
  if (!data?.length) notFound();

  return (
    <main style={{ padding: 24 }}>
      <h1>Ton booster</h1>
      <ul className="card-grid">
        {data.map(({ slot, cards: c }) => (
          <li key={slot}>
            {c ? (
              <Link href={`/card/${c.id}`}>
                <Card card={c} />
              </Link>
            ) : (
              <p>🔄 Jeton de Refresh</p>
            )}
          </li>
        ))}
      </ul>
      <Link href="/">← Retour</Link> · <Link href="/collection">Ma collection</Link>
    </main>
  );
}
