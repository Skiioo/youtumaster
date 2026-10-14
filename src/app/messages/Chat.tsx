"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeToChanges } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { markRead, sendMessage, type ChatMessage } from "./actions";

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Conversation avec un ami : historique, réception instantanée, envoi. */
export function Chat({ me, friend, initial }: { me: string; friend: { id: string; username: string }; initial: ChatMessage[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  // Messages reçus en direct : ceux de cet ami s'affichent (et sont marqués lus),
  // ceux des autres amis rafraîchissent la liste des conversations (non-lus)
  useEffect(
    () =>
      subscribeToChanges("INSERT", "messages", `recipient_id=eq.${me}`, (row) => {
        const m = row as ChatMessage;
        if (m.sender_id === friend.id) {
          setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
          markRead(friend.id);
        } else {
          router.refresh();
        }
      }),
    [me, friend.id, router],
  );

  // Toujours afficher le dernier message.
  // Bloc { } obligatoire : scrollIntoView renvoie une Promise dans les navigateurs récents,
  // et un effet ne doit renvoyer qu'une fonction de nettoyage (sinon React plante).
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = () => {
    const body = text.trim();
    if (!body || pending) return;
    startTransition(async () => {
      const res = await sendMessage(friend.id, body);
      if (res.error) return setError(res.error);
      setError(null);
      setText("");
      setMessages((list) => [...list, res.message!]);
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3 font-semibold">{friend.username}</div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">Aucun message. Dis bonjour à {friend.username} 👋</p>
        )}
        <ul className="grid gap-2">
          {messages.map((m) => {
            const mine = m.sender_id === me;
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                    mine ? "rounded-br-sm bg-ring text-white" : "rounded-bl-sm bg-muted",
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">{m.body}</p>
                  <p className={cn("mt-1 text-right text-[10px]", mine ? "text-white/70" : "text-muted-foreground")} suppressHydrationWarning>
                    {time(m.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottom} />
      </div>

      <form
        className="grid gap-1 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Écrire à ${friend.username}…`}
            maxLength={1000}
            aria-label="Message"
            autoFocus
          />
          <Button type="submit" size="icon" disabled={!text.trim() || pending} aria-label="Envoyer">
            <SendHorizontal />
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Sans conversation ouverte : rafraîchit la liste (non-lus) à chaque message reçu. */
export function InboxLive({ me }: { me: string }) {
  const router = useRouter();
  useEffect(() => subscribeToChanges("INSERT", "messages", `recipient_id=eq.${me}`, () => router.refresh()), [me, router]);
  return null;
}
