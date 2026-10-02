"use server";

import { redirect } from "next/navigation";
import { refreshStaleCards } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  deck_needs_4_cards: "Choisis exactement 4 cartes.",
  cards_unavailable: "Une de ces cartes n'est pas disponible (en vente ou déjà en combat).",
  match_unavailable: "Ce défi n'est plus disponible.",
  own_match: "C'est ton propre défi.",
  match_not_running: "Ce match n'est pas en cours.",
  not_your_turn: "Ce n'est pas ton tour.",
  invalid_attacker: "Choisis une de tes cartes encore en vie.",
  invalid_target: "Choisis une cible adverse encore en vie.",
  no_quiz: "Il n'y a pas de question en cours.",
};

const withError = (path: string, e: { message: string } | null) =>
  e ? `${path}?error=${encodeURIComponent(ERRORS[e.message] ?? e.message)}` : path;

const deckFrom = (formData: FormData) => formData.getAll("card").map(String);

export async function createMatch(formData: FormData) {
  const cards = deckFrom(formData);
  if (cards.length !== 4) redirect(withError("/play", { message: "deck_needs_4_cards" }));
  await refreshStaleCards(cards);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_match", { p_cards: cards });
  redirect(error ? withError("/play", error) : `/match/${data}`);
}

export async function joinMatch(formData: FormData) {
  const matchId = String(formData.get("matchId"));
  const cards = deckFrom(formData);
  if (cards.length !== 4) redirect(withError(`/match/${matchId}`, { message: "deck_needs_4_cards" }));
  await refreshStaleCards(cards);
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_match", { p_match: matchId, p_cards: cards });
  redirect(withError(`/match/${matchId}`, error));
}

export async function attack(formData: FormData) {
  const matchId = String(formData.get("matchId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("attack", {
    p_match: matchId,
    p_card: String(formData.get("card")),
    p_target: String(formData.get("target")),
  });
  redirect(withError(`/match/${matchId}`, error));
}

export async function answerQuiz(formData: FormData) {
  const matchId = String(formData.get("matchId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_quiz", { p_match: matchId, p_choice: Number(formData.get("choice")) });
  redirect(withError(`/match/${matchId}`, error));
}

export async function cancelMatch(formData: FormData) {
  const matchId = String(formData.get("matchId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_match", { p_match: matchId });
  redirect(error ? withError(`/match/${matchId}`, error) : "/play");
}

/** Appelée par le chrono côté client quand le temps du quiz est écoulé. */
export async function resolveTimeout(matchId: string) {
  const supabase = await createClient();
  await supabase.rpc("resolve_quiz_timeout", { p_match: matchId });
}
