import Link from "next/link";
import { logout } from "@/app/auth/actions";
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
    .select("username, viewcoins, boosters_opened")
    .eq("id", user.id)
    .single();
  const { data: boosters } = await supabase.rpc("booster_state").single<{ available: number; next_in_seconds: number | null }>();

  return (
    <main style={{ padding: 24 }}>
      <h1>Salut {profile?.username ?? user.email}</h1>
      <p>{profile?.viewcoins ?? 0} ViewCoins · {profile?.boosters_opened ?? 0} boosters ouverts</p>
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      <form action={openBooster}>
        <button disabled={!boosters?.available}>
          Ouvrir un booster ({boosters?.available ?? 0} dispo)
        </button>
        {boosters?.next_in_seconds != null && <small> · prochain dans {boosters.next_in_seconds} s</small>}
      </form>
      <p><Link href="/collection">Ma collection</Link></p>
      <form action={logout}>
        <button>Se déconnecter</button>
      </form>
    </main>
  );
}
