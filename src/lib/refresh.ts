import "server-only";
import { computeRarity } from "@/lib/game/rarity";
import { createAdminClient } from "@/lib/supabase/admin";

type ApiStats = { id: string; statistics: { viewCount?: string; likeCount?: string } };
type VideoRow = { platform_video_id: string; creators: { countries: { rarity_multiplier: number } | null } | null };

/**
 * Met à jour stats + rareté théorique de vidéos en 1 appel API (≤ 50 ids).
 * Renvoie false si l'API a échoué (quota épuisé…) : l'appelant garde alors le cache existant.
 */
export async function updateVideosFromApi(platformIds: string[]): Promise<boolean> {
  if (platformIds.length === 0) return true;
  const params = new URLSearchParams({ part: "statistics", id: platformIds.join(","), key: process.env.VIDEO_API_KEY! });
  const res = await fetch(`${process.env.VIDEO_API_BASE_URL}/videos?${params}`);
  if (!res.ok) return false;
  const { items } = (await res.json()) as { items: ApiStats[] };

  const db = createAdminClient();
  const [{ data: rows }, { data: whitelist }] = await Promise.all([
    db.from("videos").select("platform_video_id, creators(countries(rarity_multiplier))").in("platform_video_id", platformIds).returns<VideoRow[]>(),
    db.from("goat_whitelist").select("platform_video_id").in("platform_video_id", platformIds),
  ]);
  const multiplier = new Map(rows?.map((r) => [r.platform_video_id, Number(r.creators?.countries?.rarity_multiplier ?? 1)]));
  const whitelisted = new Set(whitelist?.map((w) => w.platform_video_id));
  const now = new Date().toISOString();

  await Promise.all(
    items.map((it) => {
      const views = Number(it.statistics.viewCount ?? 0);
      return db
        .from("videos")
        .update({
          view_count: views,
          like_count: it.statistics.likeCount != null ? Number(it.statistics.likeCount) : null,
          stats_fetched_at: now,
          current_rarity: computeRarity({
            platformVideoId: it.id,
            realViews: views,
            countryMultiplier: multiplier.get(it.id) ?? 1,
            isWhitelisted: whitelisted.has(it.id),
          }).rarity,
        })
        .eq("platform_video_id", it.id);
    }),
  );
  return true;
}

type StaleCard = { videos: { platform_video_id: string; stats_fetched_at: string } };

/**
 * Anti-triche avant un combat : les cartes dont les stats ont plus de X heures sont remises
 * à jour. Le cache vidéo est réutilisé s'il est récent, sinon 1 seul appel API.
 */
export async function refreshStaleCards(cardIds: string[]) {
  const db = createAdminClient();
  const { data: cfg } = await db.from("game_config").select("value").eq("key", "combat_stale_after_hours").single();
  const cutoff = Date.now() - Number(cfg?.value ?? 168) * 3_600_000;

  const { data: cards } = await db
    .from("cards")
    .select("videos(platform_video_id, stats_fetched_at)")
    .in("id", cardIds)
    .lt("last_updated_at", new Date(cutoff).toISOString())
    .returns<StaleCard[]>();
  const staleVideos = (cards ?? []).map((c) => c.videos).filter((v) => Date.parse(v.stats_fetched_at) < cutoff);

  await updateVideosFromApi(staleVideos.map((v) => v.platform_video_id));
  await db.rpc("refresh_stale_cards", { p_cards: cardIds });
}
