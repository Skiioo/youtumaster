import { notFound } from "next/navigation";
import { CARD_SELECT, type CardData } from "@/components/Card";
import { createClient } from "@/lib/supabase/server";
import { BoosterReveal } from "./BoosterReveal";

type Item = { slot: number; is_refresh_token: boolean; cards: CardData | null };
const ORDER = ["common", "uncommon", "rare", "epic", "legendary", "goat"];

export default async function BoosterPage({ params }: PageProps<"/booster/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data }, { data: me }] = await Promise.all([
    supabase
      .from("booster_items")
      .select(`slot, is_refresh_token, cards(${CARD_SELECT})`)
      .eq("booster_id", id)
      .returns<Item[]>(),
    supabase.from("users").select("back:card_back_id(asset_path)").eq("id", user?.id ?? "").maybeSingle<{ back: { asset_path: string } | null }>(),
  ]);
  if (!data?.length) notFound();

  // Suspense : jetons et cartes communes d'abord, la plus rare en dernier
  const items = data
    .map((i) => ({ slot: i.slot, card: i.cards }))
    .sort((a, b) => (a.card ? ORDER.indexOf(a.card.rarity) : -1) - (b.card ? ORDER.indexOf(b.card.rarity) : -1));

  return (
    <main className="flex min-h-[calc(100svh-3rem)] flex-col items-center justify-center gap-6 p-6 text-center md:min-h-svh">
      <h1 className="mb-0">Ton paquet</h1>
      <BoosterReveal items={items} cardBack={me?.back?.asset_path ?? null} />
    </main>
  );
}
