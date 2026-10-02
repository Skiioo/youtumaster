"use server";

import { redirect } from "next/navigation";
import { parseVideoId } from "@/lib/players";
import { updateVideosFromApi } from "@/lib/refresh";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Toute action admin passe par ici : vérification du rôle côté serveur, puis client à clé secrète. */
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("users").select("role").eq("id", user?.id ?? "").maybeSingle();
  if (me?.role !== "admin") redirect("/");
  return { db: createAdminClient(), userId: user!.id };
}

const done = (message: string) => redirect(`/admin?msg=${encodeURIComponent(message)}`);

export async function addGoat(formData: FormData) {
  const { db, userId } = await requireAdmin();
  const id = parseVideoId(String(formData.get("video")));
  const reason = String(formData.get("reason")).trim();
  const { error } = await db.from("goat_whitelist").upsert({ platform_video_id: id, reason, added_by: userId });
  if (error) done(`Erreur : ${error.message}`);
  // La vidéo peut sortir en GOAT dans les boosters ; les cartes existantes passent GOAT via un Jeton de Refresh
  await db.from("videos").update({ current_rarity: "goat" }).eq("platform_video_id", id);
  done(`${id} ajoutée à la whitelist YAOT.`);
}

export async function removeGoat(formData: FormData) {
  const { db } = await requireAdmin();
  const id = String(formData.get("video"));
  await db.from("goat_whitelist").delete().eq("platform_video_id", id);
  await updateVideosFromApi([id]); // recalcule sa rareté normale
  done(`${id} retirée de la whitelist YAOT.`);
}

export async function createAlbum(formData: FormData) {
  const { db } = await requireAdmin();
  const name = String(formData.get("title")).trim();
  const riddle = String(formData.get("riddle")).trim();
  const ids = String(formData.get("videos")).split(/[\s,]+/).filter(Boolean).map(parseVideoId);

  const { data: videos } = await db.from("videos").select("id, platform_video_id").in("platform_video_id", ids);
  const missing = ids.filter((id) => !videos?.some((v) => v.platform_video_id === id));
  if (!name || !riddle || !videos?.length || missing.length) {
    done(missing.length ? `Vidéos absentes du catalogue : ${missing.join(", ")}` : "Titre, énigme et vidéos sont obligatoires.");
  }

  const { data: title, error } = await db
    .from("titles")
    .insert({ code: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}`, name })
    .select("id")
    .single();
  if (error) done(`Erreur : ${error.message}`);
  const { data: album } = await db.from("albums").insert({ title_id: title!.id, riddle }).select("id").single();
  await db.from("album_requirements").insert(videos!.map((v) => ({ album_id: album!.id, video_id: v.id })));
  done(`Album « ${name} » créé avec ${videos!.length} cartes.`);
}

export async function setPatron(formData: FormData) {
  const { db } = await requireAdmin();
  const username = String(formData.get("username")).trim();
  const months = Number(formData.get("months") || 0);
  const remove = formData.get("remove") === "on";

  const { data: target } = await db.from("users").select("id, role").eq("username", username).maybeSingle();
  if (!target) done(`Joueur « ${username} » introuvable.`);
  if (target!.role === "admin") done("Un admin a déjà accès aux cosmétiques.");

  const until = months > 0 ? new Date(Date.now() + months * 30 * 86_400_000).toISOString() : null;
  await db
    .from("users")
    .update(remove ? { role: "player", patron_until: null } : { role: "patron", patron_since: new Date().toISOString(), patron_until: until })
    .eq("id", target!.id);
  done(remove ? `${username} n'est plus mécène.` : `${username} est mécène${until ? ` jusqu'au ${new Date(until).toLocaleDateString("fr-FR")}` : " sans limite"}.`);
}
