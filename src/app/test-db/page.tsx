import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Page de diagnostic : vérifie que le projet parle bien à Supabase. */
export default async function TestDbPage() {
  await connection();

  const supabase = createAdminClient();
  const [config, tiers] = await Promise.all([
    supabase.from("game_config").select("key, value"),
    supabase.from("rarity_tiers").select("rarity, min_rarity_views").order("booster_weight", { ascending: false }),
  ]);
  const error = config.error ?? tiers.error;

  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>Test connexion base de données</h1>
      {error ? (
        <p style={{ color: "crimson" }}>❌ Erreur : {error.message}</p>
      ) : (
        <>
          <p style={{ color: "green" }}>✅ Connecté à Supabase</p>
          <h2>game_config</h2>
          <pre>{JSON.stringify(config.data, null, 2)}</pre>
          <h2>rarity_tiers</h2>
          <pre>{JSON.stringify(tiers.data, null, 2)}</pre>
        </>
      )}
    </main>
  );
}
