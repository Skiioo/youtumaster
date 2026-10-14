"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CONFIRM_WORD } from "./confirm";


/** Supprime définitivement le compte du joueur connecté (données de jeu puis compte de connexion). */
export async function deleteAccount(formData: FormData) {
  // Deuxième validation, côté serveur : le mot doit être tapé exactement
  if (formData.get("confirm") !== CONFIRM_WORD) redirect("/settings?error=confirm");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("delete_my_account");
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);

  await createAdminClient().auth.admin.deleteUser(user.id);
  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
