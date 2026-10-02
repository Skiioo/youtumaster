import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CARD_SELECT, type CardData } from "@/components/Card";
import { createClient } from "@/lib/supabase/server";

export default async function CardPage({ params }: PageProps<"/card/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select(CARD_SELECT).eq("id", id).returns<CardData[]>().maybeSingle();
  if (!card) notFound();

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, justifyItems: "center" }}>
      <Card card={card} big />
      <small>Clique sur la miniature pour voir la vidéo</small>
      <Link href="/collection">← Ma collection</Link>
    </main>
  );
}
