"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function fail(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function signup(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!USERNAME_RE.test(username)) fail("Pseudo : 3 à 20 caractères (lettres, chiffres, _).");
  if (password.length < 8) fail("Mot de passe : 8 caractères minimum.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  // Le trigger échoue si le pseudo existe déjà (contrainte UNIQUE)
  if (error) fail(error.message.includes("Database error") ? "Ce pseudo est déjà pris." : error.message);

  redirect("/");
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) fail("Email ou mot de passe incorrect.");

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
