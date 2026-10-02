import Link from "next/link";
import { openBooster } from "@/app/booster/actions";
import { createClient } from "@/lib/supabase/server";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/login">Se connecter / S&apos;inscrire</Link>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("username, role, viewcoins, boosters_opened, titles(name), badge:badge_id(name), color:name_color_id(asset_path)")
    .eq("id", user.id)
    .single<{
      username: string;
      role: string;
      viewcoins: number;
      boosters_opened: number;
      titles: { name: string } | null;
      badge: { name: string } | null;
      color: { asset_path: string } | null;
    }>();
  const { data: boosters } = await supabase.rpc("booster_state").single<{ available: number; next_in_seconds: number | null }>();

  return (
    <main className="grid gap-4 p-6">
      <h1>
        Salut <span style={{ color: profile?.color?.asset_path }}>{profile?.username ?? user.email}</span>
        {profile?.badge && <small> {profile.badge.name}</small>}
        {profile?.titles && <small> · {profile.titles.name}</small>}
      </h1>
      <p>{profile?.viewcoins ?? 0} ViewCoins · {profile?.boosters_opened ?? 0} boosters ouverts</p>
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      <form action={openBooster}>
        <button disabled={!boosters?.available}>
          Ouvrir un booster ({boosters?.available ?? 0} dispo)
        </button>
        {boosters?.next_in_seconds != null && <small> · prochain dans {boosters.next_in_seconds} s</small>}
      </form>
    </main>
  );
}
