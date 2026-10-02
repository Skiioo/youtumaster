// Remplit le catalogue `videos`.
// Usage : pnpm harvest @chaine UCxxx [--max-pages=N]   -> chaînes choisies
//         pnpm harvest --discover [--budget=N]          -> mode automatique (quotidien)
//         pnpm harvest --clean [--budget=N]             -> retire les vidéos verticales déjà en base
// Seules les vidéos horizontales ou carrées entrent dans le catalogue (pas de vertical).
// Le mode --discover trouve de nouvelles chaînes via les tendances de chaque pays, puis
// remet à jour les chaînes vieilles de 25 jours+ (règle des 30 jours de la plateforme).
// Coût quota : 1 unité par appel (jamais de recherche à 100), plafonné par --budget.
import { createClient } from "@supabase/supabase-js";
import { computeRarity } from "../src/lib/game/rarity.ts";

const API = process.env.VIDEO_API_BASE_URL!;
const KEY = process.env.VIDEO_API_KEY!;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

class BudgetExceeded extends Error {}
let units = 0;
let budget = Infinity;

async function api(path: string, params: Record<string, string>) {
  if (units >= budget) throw new BudgetExceeded();
  units++;
  const res = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key: KEY })}`);
  const json = await res.json();
  // Quota du jour épuisé côté plateforme : arrêt propre, comme le budget local
  if (json.error?.errors?.some((e: { reason: string }) => e.reason === "quotaExceeded")) throw new BudgetExceeded();
  if (!res.ok) throw new Error(`${path}: ${json.error?.message ?? res.status}`);
  return json;
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error || data == null) throw new Error(error?.message ?? "réponse vide");
  return data;
}

type ApiVideo = {
  id: string;
  snippet: { title: string; publishedAt: string; categoryId: string };
  statistics: { viewCount?: string; likeCount?: string };
  player: { embedWidth?: string; embedHeight?: string };
};

// `player` + maxWidth renvoie les dimensions du lecteur, donc le format (sans coût de quota en plus)
const PLAYER = { maxWidth: "1000" };
const notVertical = (v: Pick<ApiVideo, "player">) =>
  Number(v.player.embedWidth) >= Number(v.player.embedHeight);

async function harvestChannel(channel: string, maxPages: number) {
  const ch = (
    await api("channels", {
      part: "snippet,contentDetails",
      ...(channel.startsWith("@") ? { forHandle: channel } : { id: channel }),
    })
  ).items?.[0];
  if (!ch) throw new Error(`Chaîne introuvable : ${channel}`);

  const country: string | null = ch.snippet.country ?? null;
  if (country) await db.from("countries").upsert({ code: country, name: country }, { ignoreDuplicates: true });
  const multiplier = country
    ? Number(check(await db.from("countries").select("rarity_multiplier").eq("code", country).single()).rarity_multiplier)
    : 1;

  const creator = check(
    await db
      .from("creators")
      .upsert(
        {
          platform_channel_id: ch.id,
          name: ch.snippet.title,
          country_code: country,
          uploads_playlist_id: ch.contentDetails.relatedPlaylists.uploads,
          harvested_at: new Date().toISOString(),
        },
        { onConflict: "platform_channel_id" },
      )
      .select("id")
      .single(),
  );

  let pageToken = "";
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const list = await api("playlistItems", {
      part: "contentDetails",
      playlistId: ch.contentDetails.relatedPlaylists.uploads,
      maxResults: "50",
      ...(pageToken && { pageToken }),
    });
    const ids: string[] = list.items.map((i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId);
    if (ids.length === 0) break;

    const all: ApiVideo[] = (await api("videos", { part: "snippet,statistics,player", ...PLAYER, id: ids.join(",") })).items;
    const videos = all.filter(notVertical);
    const whitelisted = new Set(
      check(await db.from("goat_whitelist").select("platform_video_id").in("platform_video_id", ids)).map(
        (w) => w.platform_video_id,
      ),
    );

    const rows = videos.map((v) => {
      const views = Number(v.statistics.viewCount ?? 0);
      return {
        platform_video_id: v.id,
        creator_id: creator.id,
        title: v.snippet.title,
        published_at: v.snippet.publishedAt,
        platform_category_id: v.snippet.categoryId,
        view_count: views,
        like_count: v.statistics.likeCount != null ? Number(v.statistics.likeCount) : null,
        stats_fetched_at: new Date().toISOString(),
        is_available: true,
        current_rarity: computeRarity({
          platformVideoId: v.id,
          realViews: views,
          countryMultiplier: multiplier,
          isWhitelisted: whitelisted.has(v.id),
        }).rarity,
      };
    });
    if (rows.length > 0) {
      const { error } = await db.from("videos").upsert(rows, { onConflict: "platform_video_id" });
      if (error) throw new Error(error.message);
    }

    total += rows.length;
    pageToken = list.nextPageToken;
    if (!pageToken) break;
  }
  console.log(`✅ ${ch.snippet.title} (${country ?? "pays inconnu"}) : ${total} vidéos`);
}

async function discoverChannels(): Promise<string[]> {
  const regions: string[] = (await api("i18nRegions", { part: "snippet" })).items.map((r: { id: string }) => r.id);
  const found = new Set<string>();
  regions: for (const regionCode of regions) {
    let pageToken = "";
    do {
      try {
        const res = await api("videos", {
          part: "snippet",
          chart: "mostPopular",
          regionCode,
          maxResults: "50",
          ...(pageToken && { pageToken }),
        });
        for (const v of res.items) found.add(v.snippet.channelId);
        pageToken = res.nextPageToken ?? "";
      } catch (e) {
        if (e instanceof BudgetExceeded) break regions;
        pageToken = ""; // certaines régions n'ont pas de classement
      }
    } while (pageToken);
  }

  const ids = [...found];
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = check(await db.from("creators").select("platform_channel_id").in("platform_channel_id", ids.slice(i, i + 100)));
    for (const r of rows) known.add(r.platform_channel_id);
  }
  const stale = check(
    await db
      .from("creators")
      .select("platform_channel_id")
      .lt("harvested_at", new Date(Date.now() - 25 * 86_400_000).toISOString())
      .order("harvested_at")
      .limit(500),
  ).map((r) => r.platform_channel_id);

  const fresh = ids.filter((id) => !known.has(id));
  console.log(`🔎 ${fresh.length} nouvelles chaînes, ${stale.length} à rafraîchir`);
  return [...stale, ...fresh];
}

// Les vidéos déjà tirées en carte ne peuvent pas être supprimées : on les retire juste des boosters
async function cleanVertical() {
  let removed = 0; // dans la page courante
  let total = 0;
  let checked = 0;
  for (let from = 0; ; from += 1000) {
    const page = check(
      await db.from("videos").select("platform_video_id").eq("is_available", true).order("id").range(from, from + 999),
    );
    for (let i = 0; i < page.length; i += 50) {
      const ids = page.slice(i, i + 50).map((v) => v.platform_video_id);
      const items: ApiVideo[] = (await api("videos", { part: "player", ...PLAYER, id: ids.join(",") })).items;
      const keep = new Set(items.filter(notVertical).map((v) => v.id));
      const drop = ids.filter((id) => !keep.has(id)); // inclut les vidéos supprimées/privées
      if (drop.length > 0) {
        const { error } = await db.from("videos").update({ is_available: false }).in("platform_video_id", drop);
        if (error) throw new Error(error.message);
      }
      removed += drop.length;
      total += drop.length;
      checked += ids.length;
    }
    if (page.length < 1000) break;
    from -= removed; // les vidéos retirées sortent du filtre is_available : on ne saute pas de page
    removed = 0;
  }
  console.log(`🧹 ${checked} vidéos vérifiées, ${total} retirées des boosters`);
}

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const discover = args.includes("--discover");
budget = Number(flag("budget") ?? 9000); // marge sous les 10 000/jour pour les refresh en jeu
// ponytail: 20 pages = 1000 vidéos les plus récentes par chaîne en mode auto ; les vieux hits des
// très grosses chaînes manquent, ajouter un passage `--max-pages` ciblé si besoin
const maxPages = Number(flag("max-pages") ?? (discover ? 20 : Infinity));
if (args.includes("--clean")) {
  budget = Number(flag("budget") ?? 9000);
  try {
    await cleanVertical();
  } catch (e) {
    if (!(e instanceof BudgetExceeded)) throw e;
    console.log("⏸️  Quota atteint, relance --clean plus tard pour continuer.");
  }
  console.log(`Quota utilisé : ${units} unités`);
  process.exit(0);
}
const channels = discover ? await discoverChannels() : args.filter((a) => !a.startsWith("--"));
if (channels.length === 0 && !discover) {
  console.error("Usage : pnpm harvest @chaine [UCxxx...] [--max-pages=N]  |  pnpm harvest --discover [--budget=N]");
  process.exit(1);
}
for (const c of channels) {
  try {
    await harvestChannel(c, maxPages);
  } catch (e) {
    if (e instanceof BudgetExceeded) {
      console.log("⏸️  Quota atteint, la suite au prochain passage.");
      break;
    }
    console.error(`❌ ${c} : ${(e as Error).message}`);
  }
}
console.log(`Quota utilisé : ${units} unités`);
