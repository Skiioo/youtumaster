import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { createClient } from "@/lib/supabase/server";

/** Choix de 4 cartes libres (ni en vente, ni en combat). */
export async function DeckPicker({ action, matchId, label }: {
  action: (formData: FormData) => Promise<void>;
  matchId?: string;
  label: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: cards } = await supabase
    .from("cards")
    .select(CARD_SELECT)
    .eq("owner_id", user?.id ?? "")
    .is("locked_reason", null)
    .order("rarity", { ascending: false })
    .order("attack", { ascending: false })
    .limit(60)
    .returns<CardData[]>();

  return (
    <form action={action}>
      {matchId && <input type="hidden" name="matchId" value={matchId} />}
      <p>Coche exactement 4 cartes, puis : <button>{label}</button></p>
      <ul className="card-grid">
        {cards?.map((c) => (
          <li key={c.id}>
            <label>
              <input type="checkbox" name="card" value={c.id} /> Choisir
              <Card card={c} />
            </label>
          </li>
        ))}
      </ul>
    </form>
  );
}
