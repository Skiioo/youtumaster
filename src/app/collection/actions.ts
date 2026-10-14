"use server";

import { redirect } from "next/navigation";
import { safeReturnTo, withParams } from "@/lib/cardFilters";
import { updateVideosFromApi } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  no_refresh_token: "Tu n'as pas de Jeton de Refresh.",
  not_your_card: "Cette carte ne t'appartient pas.",
  card_locked: "Impossible pendant un combat.",
};

/** Retour à la page d'origine, popup de la carte toujours ouverte (avec ou sans message d'erreur). */
const back = (formData: FormData, error?: string) =>
  redirect(withParams(safeReturnTo(formData.get("returnTo")), { error: error ?? null }));

export async function toggleFavorite(formData: FormData) {
  const supabase = await createClient();
  await supabase.rpc("toggle_favorite", { p_card: String(formData.get("cardId")) });
  back(formData);
}

export async function applyRefreshToken(formData: FormData) {
  const cardId = String(formData.get("cardId"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: me }, { data: card }] = await Promise.all([
    supabase.from("users").select("refresh_tokens").eq("id", user?.id ?? "").maybeSingle(),
    supabase.from("cards").select("videos(platform_video_id)").eq("id", cardId).returns<{ videos: { platform_video_id: string } }[]>().maybeSingle(),
  ]);
  // Vérifié avant l'appel API pour ne pas brûler de quota sans jeton (re-vérifié en SQL)
  if (!me?.refresh_tokens) back(formData, ERRORS.no_refresh_token);
  if (!card) back(formData, ERRORS.not_your_card);

  if (!(await updateVideosFromApi([card!.videos.platform_video_id]))) {
    back(formData, "Service vidéo indisponible, ton jeton n'a pas été utilisé.");
  }
  const { error } = await supabase.rpc("use_refresh_token", { p_card: cardId });
  back(formData, error ? (ERRORS[error.message] ?? error.message) : undefined);
}
