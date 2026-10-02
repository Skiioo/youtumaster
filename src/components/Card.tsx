export const CARD_SELECT =
  "id, rarity, variant, attack, defense, snap_view_count, videos(platform_video_id, title, factions(id, name))";

export type CardData = {
  id: string;
  rarity: string;
  variant: string;
  attack: number;
  defense: number;
  snap_view_count: number;
  videos: { platform_video_id: string; title: string; factions: { id: number; name: string } | null };
};

const media = (template: string | undefined, id: string) => template!.replace("{id}", id);

/** Petite carte (grille) ou grande carte (vue détaillée, miniature cliquable vers la vidéo). */
export function Card({ card, big = false }: { card: CardData; big?: boolean }) {
  const videoId = card.videos.platform_video_id;
  const thumb = (
    // eslint-disable-next-line @next/next/no-img-element -- miniature externe, jamais hébergée chez nous
    <img
      src={media(process.env.NEXT_PUBLIC_THUMBNAIL_URL_TEMPLATE, videoId)}
      alt={card.videos.title}
      style={{ width: "100%", borderRadius: 4, display: "block" }}
    />
  );

  return (
    <div style={{ border: "1px solid #888", borderRadius: 8, padding: 8, maxWidth: big ? 480 : undefined }}>
      {big ? (
        <a href={media(process.env.NEXT_PUBLIC_VIDEO_URL_TEMPLATE, videoId)} target="_blank" rel="noreferrer" title="Voir la vidéo">
          {thumb}
        </a>
      ) : (
        thumb
      )}
      <strong>
        {card.rarity.toUpperCase()}
        {card.variant !== "normal" && ` · ${card.variant}`}
      </strong>
      {card.videos.factions && <small> · {card.videos.factions.name}</small>}
      <p style={{ margin: "4px 0" }}>{card.videos.title}</p>
      <small>
        ⚔️ {card.attack} · 🛡️ {card.defense} · 👁️ {card.snap_view_count.toLocaleString("fr-FR")}
      </small>
    </div>
  );
}
