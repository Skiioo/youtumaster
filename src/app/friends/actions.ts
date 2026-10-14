"use server";

import { redirect } from "next/navigation";
import { safeReturnTo, withParams } from "@/lib/cardFilters";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  invalid_player: "Ce joueur n'existe pas.",
  no_request: "Cette demande n'existe plus.",
};

/** Retour sur la page Amis (recherche conservée), avec un éventuel message d'erreur */
const back = (formData: FormData, error?: { message: string } | null) =>
  redirect(
    withParams(safeReturnTo(formData.get("returnTo"), "/friends"), {
      error: error ? (ERRORS[error.message] ?? error.message) : null,
    }),
  );

const target = (formData: FormData) => String(formData.get("userId"));

export async function sendFriendRequest(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_friend_request", { p_user: target(formData) });
  back(formData, error);
}

export async function respondFriendRequest(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_friend_request", {
    p_user: target(formData),
    p_accept: formData.get("accept") === "true",
  });
  back(formData, error);
}

export async function removeFriend(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_friend", { p_user: target(formData) });
  back(formData, error);
}
