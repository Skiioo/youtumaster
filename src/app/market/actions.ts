"use server";

import { redirect } from "next/navigation";
import { safeReturnTo, withParams } from "@/lib/cardFilters";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  market_locked: "Le marché s'ouvre après 20 boosters ouverts.",
  invalid_price: "Prix invalide.",
  invalid_duration: "Durée de vente invalide.",
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
    p_hours: Number(formData.get("hours")) || null,
  });
  // Erreur : retour à la popup de la carte avec le message ; succès : direction le marché
  if (error) redirect(withParams(safeReturnTo(formData.get("returnTo")), { error: ERRORS[error.message] ?? error.message }));
  redirect("/market");
}

export async function placeBid(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("place_bid", {
    p_listing: String(formData.get("listingId")),
    p_amount: Number(formData.get("amount")),
  });
  // Retour sur le marché avec la même recherche (filtres, tri, page)
  redirect(withParams(safeReturnTo(formData.get("returnTo"), "/market"), { error: error ? decodeURIComponent(message(error)) : null }));
}
