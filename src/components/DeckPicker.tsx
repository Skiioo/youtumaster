import { CARD_SELECT, type CardData } from "@/components/Card";
import { DeckSelect } from "@/components/DeckSelect";
import { createClient } from "@/lib/supabase/server";

/** Choix de 4 cartes libres (ni en vente, ni en combat), les plus fortes d'abord. */
export async function DeckPicker({ action, matchId, label, hidden }: {
  action: (formData: FormData) => Promise<void>;
  matchId?: string;
  label: string;
  /** Champs cachés en plus dans le formulaire (ex. : ami invité) */
  hidden?: Record<string, string>;
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
    <form action={action} className="grid gap-4">
      {matchId && <input type="hidden" name="matchId" value={matchId} />}
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <DeckSelect cards={cards ?? []} label={label} />
    </form>
  );
}
