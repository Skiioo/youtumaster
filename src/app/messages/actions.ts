"use server";

import { createClient } from "@/lib/supabase/server";

export type ChatMessage = { id: number; sender_id: string; recipient_id: string; body: string; created_at: string };

const ERRORS: Record<string, string> = {
  not_friends: "Vous devez être amis pour discuter.",
  invalid_message: "Le message doit faire entre 1 et 1000 caractères.",
  too_fast: "Doucement ! Attends quelques secondes avant d'envoyer d'autres messages.",
};

/** Envoie un message ; renvoie le message créé (affiché aussitôt) ou une erreur lisible. */
export async function sendMessage(friendId: string, body: string): Promise<{ message?: ChatMessage; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_message", { p_to: friendId, p_body: body });
  if (error) return { error: ERRORS[error.message] ?? error.message };
  return { message: data as ChatMessage };
}

export async function markRead(friendId: string) {
  const supabase = await createClient();
  await supabase.rpc("mark_messages_read", { p_friend: friendId });
}
