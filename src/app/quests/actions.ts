"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setActiveTitle(formData: FormData) {
  const title = formData.get("title");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_title", { p_title: title ? Number(title) : null });
  redirect(error ? `/quests?error=${encodeURIComponent("Tu ne possèdes pas ce titre.")}` : "/quests");
}
