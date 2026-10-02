"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  no_booster_available: "Aucun booster disponible, patiente un peu.",
  empty_catalog: "Le catalogue de vidéos est vide.",
  not_authenticated: "Connecte-toi d'abord.",
};

export async function openBooster() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_booster");
  if (error) redirect(`/?error=${encodeURIComponent(ERRORS[error.message] ?? error.message)}`);
  redirect(`/booster/${data}`);
}
