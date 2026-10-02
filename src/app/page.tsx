import Link from "next/link";
import { openBooster } from "@/app/booster/actions";
import { BoosterPack } from "@/components/BoosterPack";
import { createClient } from "@/lib/supabase/server";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <Link href="/login">Se connecter / S&apos;inscrire</Link>
      </main>
    );
  }

  const { data: boosters } = await supabase.rpc("booster_state").single<{ available: number; next_in_seconds: number | null }>();
  const available = boosters?.available ?? 0;

  return (
    <main className="flex min-h-[calc(100svh-3rem)] flex-col items-center justify-center gap-6 p-6 text-center md:min-h-svh">
      <div className="grid gap-1">
        <h1 className="text-3xl">Ouvrir un paquet</h1>
        <p className="text-muted-foreground">Découvrez 5 cartes Youtube</p>
      </div>

      {error && <p role="alert" className="text-destructive">{error}</p>}

      <form action={openBooster}>
        {/* data-slot : sort ce bouton du style de bouton par défaut */}
        <button type="submit" data-slot="booster-pack" disabled={!available} className="group grid cursor-pointer justify-items-center gap-3 disabled:cursor-not-allowed">
          <BoosterPack />
          <span className="text-lg font-semibold group-disabled:text-muted-foreground">Ouvrir</span>
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{available}</span> paquet{available > 1 ? "s" : ""} à ouvrir
        {boosters?.next_in_seconds != null && <> · prochain dans {boosters.next_in_seconds} s</>}
      </p>
    </main>
  );
}
