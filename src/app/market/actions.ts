"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  market_locked: "Le marché s'ouvre après 20 boosters ouverts.",
  invalid_price: "Prix invalide.",
  not_your_card: "Cette carte ne t'appartient pas.",
  card_locked: "Cette carte est déjà en vente.",
  listing_closed: "Cette enchère est terminée.",
  own_listing: "Tu ne peux pas enchérir sur ta propre carte.",
  already_best_bidder: "Tu es déjà le meilleur enchérisseur.",
  bid_too_low: "Enchère trop basse.",
  not_enough_coins: "Pas assez de ViewCoins.",
};

const message = (e: { message: string }) => encodeURIComponent(ERRORS[e.message] ?? e.message);

export async function createListing(formData: FormData) {
  const cardId = String(formData.get("cardId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_listing", {
    p_card: cardId,
    p_start_price: Number(formData.get("price")),
  });
  if (error) redirect(`/card/${cardId}?error=${message(error)}`);
  redirect("/market");
}

export async function placeBid(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("place_bid", {
    p_listing: String(formData.get("listingId")),
    p_amount: Number(formData.get("amount")),
  });
  redirect(error ? `/market?error=${message(error)}` : "/market");
}
