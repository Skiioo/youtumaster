import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./actions";
import { Chat, InboxLive } from "./Chat";

type Conversation = {
  friend_id: string;
  username: string;
  last_body: string | null;
  last_at: string | null;
  last_from_me: boolean | null;
  unread: number;
};

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const params = await searchParams;
  const withId = typeof params.with === "string" ? params.with : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? "";

  // Ouvrir une conversation la marque comme lue (avant de compter les non-lus)
  if (withId) await supabase.rpc("mark_messages_read", { p_friend: withId });
  const { data } = await supabase.rpc("my_conversations");
  const conversations = (data ?? []) as Conversation[];
  const active = conversations.find((c) => c.friend_id === withId) ?? null;

  // 100 derniers messages de la conversation ouverte, du plus ancien au plus récent
  const history = active
    ? (
        await supabase
          .from("messages")
          .select("id, sender_id, recipient_id, body, created_at")
          .or(`and(sender_id.eq.${me},recipient_id.eq.${active.friend_id}),and(sender_id.eq.${active.friend_id},recipient_id.eq.${me})`)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(100)
      ).data?.reverse() ?? []
    : [];

  return (
    <main className="flex h-[calc(100svh-3rem)] flex-col p-6 md:h-svh">
      <PageTitle href="/messages">Messages</PageTitle>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[18rem_1fr]">
        {/* Liste des conversations (une par ami) */}
        <Card className={cn("min-h-0 gap-0 overflow-y-auto py-0", active && "hidden md:flex")}>
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Ajoute des <Link href="/friends">amis</Link> pour pouvoir discuter avec eux.
            </p>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.friend_id}>
                  <Link
                    href={`/messages?with=${c.friend_id}`}
                    data-slot="conversation"
                    className={cn(
                      "flex items-center gap-3 border-b px-4 py-3 hover:bg-muted/60",
                      c.friend_id === active?.friend_id && "bg-muted",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.username}</p>
                      <p className={cn("truncate text-xs", c.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        {c.last_body ? `${c.last_from_me ? "Toi : " : ""}${c.last_body}` : "Pas encore de message"}
                      </p>
                    </div>
                    {c.unread > 0 && (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ring text-[10px] font-bold text-white">
                        {c.unread > 9 ? "9+" : c.unread}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Conversation ouverte */}
        <Card className={cn("min-h-0 gap-0 overflow-hidden py-0", !active && "hidden md:flex")}>
          {active ? (
            <>
              <Link href="/messages" className="border-b px-4 py-2 text-sm md:hidden">
                ← Conversations
              </Link>
              <Chat key={active.friend_id} me={me} friend={{ id: active.friend_id, username: active.username }} initial={history as ChatMessage[]} />
            </>
          ) : (
            <>
              <InboxLive me={me} />
              <p className="m-auto p-6 text-center text-sm text-muted-foreground">Choisis un ami pour commencer à discuter.</p>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
