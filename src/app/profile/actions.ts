"use server";

import { redirect } from "next/navigation";
import { isPatron } from "@/lib/players";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SLOTS = { badge: "badge_id", name_color: "name_color_id", card_back: "card_back_id" } as const;

export async function equipCosmetics(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("users").select("role, patron_until").eq("id", user?.id ?? "").maybeSingle();
  if (!isPatron(me)) redirect("/profile");

  const db = createAdminClient();
  const { data: cosmetics } = await db.from("cosmetics").select("id, kind");
  const update: Record<string, number | null> = {};
  for (const [kind, column] of Object.entries(SLOTS)) {
    const id = Number(formData.get(kind)) || null;
    // Seul un cosmétique existant du bon type est accepté
    update[column] = id && cosmetics?.some((c) => c.id === id && c.kind === kind) ? id : null;
  }
  await db.from("users").update(update).eq("id", user!.id);
  redirect("/profile?saved=1");
}
