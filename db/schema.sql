-- =============================================================================
-- Schéma PostgreSQL — jeu de cartes à collectionner (fan-game, 100% F2P)
-- Aucune marque n'est nommée : "plateforme" = la plateforme vidéo source.
-- =============================================================================

-- Tout ou rien : si une ligne échoue, rien n'est créé (pas de base à moitié faite)
BEGIN;

SET search_path = public;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
CREATE TYPE user_role      AS ENUM ('player', 'patron', 'admin');
CREATE TYPE rarity         AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary', 'goat');
CREATE TYPE card_variant   AS ENUM ('normal', 'gold', 'dark', 'rainbow');
CREATE TYPE goat_reason    AS ENUM ('absolute_views', 'whitelist');
CREATE TYPE cosmetic_kind  AS ENUM ('badge', 'name_color', 'card_back');
CREATE TYPE synergy_kind   AS ENUM ('country', 'creator', 'year', 'theme');
CREATE TYPE listing_status AS ENUM ('active', 'sold', 'expired', 'cancelled');
CREATE TYPE match_status   AS ENUM ('waiting', 'in_progress', 'finished', 'aborted');
CREATE TYPE refresh_cause  AS ENUM ('creation', 'refresh_token', 'market', 'combat_stale', 'batch');

-- -----------------------------------------------------------------------------
-- Configuration du jeu (modifiable sans redéploiement)
-- -----------------------------------------------------------------------------
CREATE TABLE game_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO game_config (key, value) VALUES
  ('booster_interval_seconds', '120'),
  ('booster_stock_cap',        '5'),
  ('booster_size',             '5'),
  ('refresh_token_drop_rate',  '0.05'),
  ('combat_stale_after_hours', '168'),       -- 1 semaine
  ('market_tax_rate',          '0.07'),      -- entre 0.05 et 0.10
  ('market_unlock_boosters',   '20'),
  ('goat_absolute_views',      '1500000000');

-- -----------------------------------------------------------------------------
-- Cosmétiques (récompenses de mécénat, aucune stat de gameplay)
-- -----------------------------------------------------------------------------
CREATE TABLE cosmetics (
  id          serial PRIMARY KEY,
  kind        cosmetic_kind NOT NULL,
  code        text NOT NULL UNIQUE,          -- ex: 'badge_patron_2026', 'color_amber'
  name        text NOT NULL,
  asset_path  text,                          -- PNG/CSS qui nous appartient
  patron_only boolean NOT NULL DEFAULT true
);

CREATE TABLE titles (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL
);

-- -----------------------------------------------------------------------------
-- Utilisateurs
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- auth Supabase
  username           text NOT NULL UNIQUE,
  role               user_role NOT NULL DEFAULT 'player',
  patron_since       timestamptz,
  patron_until       timestamptz,               -- NULL = mécène sans échéance

  -- Économie (monnaie gratuite)
  viewcoins          bigint NOT NULL DEFAULT 0 CHECK (viewcoins >= 0),
  refresh_tokens     integer NOT NULL DEFAULT 0 CHECK (refresh_tokens >= 0),

  -- Boosters : calcul paresseux, pas de cron.
  -- dispo = min(cap, booster_stock + floor((now - booster_anchor_at) / interval))
  booster_stock      smallint NOT NULL DEFAULT 0,
  booster_anchor_at  timestamptz NOT NULL DEFAULT now(),
  boosters_opened    integer NOT NULL DEFAULT 0,   -- déverrouillage du marché

  -- Cosmétiques équipés
  badge_id           integer REFERENCES cosmetics(id),
  name_color_id      integer REFERENCES cosmetics(id),
  card_back_id       integer REFERENCES cosmetics(id),
  active_title_id    integer REFERENCES titles(id),

  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_cosmetics (
  user_id     uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cosmetic_id integer NOT NULL REFERENCES cosmetics(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cosmetic_id)
);

CREATE TABLE user_titles (
  user_id     uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id    integer NOT NULL REFERENCES titles(id),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, title_id)
);

-- Journal de toutes les variations de ViewCoins (audit anti-triche)
CREATE TABLE coin_ledger (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  delta      bigint NOT NULL,
  reason     text NOT NULL,                     -- 'bid_hold', 'bid_refund', 'sale', 'quest', ...
  ref_id     uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON coin_ledger (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Référentiels : pays, factions, raretés
-- -----------------------------------------------------------------------------
CREATE TABLE countries (
  code              char(2) PRIMARY KEY,         -- ISO 3166-1 alpha-2
  name              text NOT NULL,
  rarity_multiplier numeric(5,2) NOT NULL DEFAULT 1.00 CHECK (rarity_multiplier > 0)
);

-- 4 factions en cycle : chaque faction bat `beats_id`
CREATE TABLE factions (
  id       smallint PRIMARY KEY,
  code     text NOT NULL UNIQUE,
  name     text NOT NULL,
  beats_id smallint REFERENCES factions(id)
);

-- Catégorie de la plateforme -> faction
CREATE TABLE category_factions (
  platform_category_id text PRIMARY KEY,
  faction_id           smallint NOT NULL REFERENCES factions(id)
);

-- Seuils en "Vues de Rareté" (vues réelles x multiplicateur pays). GOAT exclu : jamais par seuil.
CREATE TABLE rarity_tiers (
  rarity          rarity PRIMARY KEY,
  min_rarity_views bigint,                       -- NULL pour 'goat'
  base_attack     integer NOT NULL,
  base_defense    integer NOT NULL,
  booster_weight  numeric(8,4) NOT NULL          -- poids de tirage dans un booster
);

INSERT INTO rarity_tiers VALUES
  ('common',              0, 10, 10, 60.0),
  ('uncommon',       500000, 20, 20, 25.0),
  ('rare',          5000000, 35, 35, 10.0),
  ('epic',         25000000, 55, 55,  4.0),
  ('legendary',   100000000, 80, 80,  0.9),
  ('goat',             NULL,120,120,  0.1);

-- -----------------------------------------------------------------------------
-- Catalogue vidéo (cache partagé, alimenté par lots — voir étape 3)
-- -----------------------------------------------------------------------------
CREATE TABLE creators (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_channel_id text NOT NULL UNIQUE,
  name                text NOT NULL,
  country_code        char(2) REFERENCES countries(code),
  uploads_playlist_id text,                       -- moissonnage à 1 unité de quota
  harvested_at        timestamptz
);

CREATE TABLE videos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_video_id    text NOT NULL UNIQUE,      -- sert à construire miniature + lien
  creator_id           uuid NOT NULL REFERENCES creators(id),
  title                text NOT NULL,
  published_at         timestamptz NOT NULL,
  platform_category_id text,
  faction_id           smallint REFERENCES factions(id),

  -- Dernières stats connues (cache partagé entre toutes les cartes de la vidéo)
  view_count           bigint NOT NULL DEFAULT 0,
  like_count           bigint,
  stats_fetched_at     timestamptz NOT NULL DEFAULT now(),
  is_available         boolean NOT NULL DEFAULT true,  -- vidéo supprimée/privée

  -- Rareté "théorique" actuelle (sert au tirage pondéré des boosters)
  current_rarity       rarity NOT NULL DEFAULT 'common',

  -- Historique de prix (dénormalisé pour l'UI de mise en vente)
  last_sold_price      bigint,
  last_sold_at         timestamptz
);
CREATE INDEX ON videos (current_rarity) WHERE is_available;
CREATE INDEX ON videos (stats_fetched_at);

-- Whitelist culturelle : force GOAT quelles que soient les vues
CREATE TABLE goat_whitelist (
  platform_video_id text PRIMARY KEY,
  reason            text NOT NULL,                -- ex: "mème fondateur 2007"
  added_by          uuid REFERENCES users(id),
  added_at          timestamptz NOT NULL DEFAULT now()
);

-- Tags de synergie (pays / créateur / année matérialisés + thèmes libres)
CREATE TABLE synergy_tags (
  id    serial PRIMARY KEY,
  kind  synergy_kind NOT NULL,
  value text NOT NULL,                            -- 'FR', '<creator uuid>', '2012', 'speedrun'
  UNIQUE (kind, value)
);

CREATE TABLE video_synergy_tags (
  video_id uuid    NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag_id   integer NOT NULL REFERENCES synergy_tags(id),
  PRIMARY KEY (video_id, tag_id)
);
CREATE INDEX ON video_synergy_tags (tag_id);

-- -----------------------------------------------------------------------------
-- Cartes (instances possédées — stats FIGÉES au moment de la génération)
-- -----------------------------------------------------------------------------
CREATE TABLE cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES users(id),
  video_id         uuid NOT NULL REFERENCES videos(id),
  rarity           rarity NOT NULL,
  variant          card_variant NOT NULL DEFAULT 'normal',
  goat_reason      goat_reason,                   -- non NULL ssi rarity = 'goat'

  -- Instantané des stats
  snap_view_count  bigint NOT NULL,
  snap_like_count  bigint,
  attack           integer NOT NULL,
  defense          integer NOT NULL,
  last_updated_at  timestamptz NOT NULL DEFAULT now(),   -- horodatage invisible

  obtained_at      timestamptz NOT NULL DEFAULT now(),
  booster_id       uuid,
  locked_reason    text,                          -- 'listing' | 'match' | NULL

  CHECK ((rarity = 'goat') = (goat_reason IS NOT NULL)),
  CHECK (variant <> 'rainbow' OR rarity = 'goat'),
  CHECK (variant NOT IN ('gold', 'dark') OR rarity IN ('legendary', 'goat'))
);
CREATE INDEX ON cards (owner_id, rarity);
CREATE INDEX ON cards (video_id);

CREATE TABLE card_refresh_log (
  id           bigserial PRIMARY KEY,
  card_id      uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  cause        refresh_cause NOT NULL,
  old_views    bigint,
  new_views    bigint NOT NULL,
  old_rarity   rarity,
  new_rarity   rarity NOT NULL,
  api_called   boolean NOT NULL,                 -- false = servi depuis le cache videos
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Boosters
-- -----------------------------------------------------------------------------
CREATE TABLE boosters (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cards ADD FOREIGN KEY (booster_id) REFERENCES boosters(id);

CREATE TABLE booster_items (
  booster_id    uuid     NOT NULL REFERENCES boosters(id) ON DELETE CASCADE,
  slot          smallint NOT NULL CHECK (slot BETWEEN 1 AND 10),
  card_id       uuid REFERENCES cards(id),
  is_refresh_token boolean NOT NULL DEFAULT false,
  PRIMARY KEY (booster_id, slot),
  CHECK ((card_id IS NOT NULL) <> is_refresh_token)
);

-- -----------------------------------------------------------------------------
-- Marketplace (enchères en ViewCoins)
-- -----------------------------------------------------------------------------
CREATE TABLE market_listings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id           uuid NOT NULL REFERENCES cards(id),
  seller_id         uuid NOT NULL REFERENCES users(id),
  start_price       bigint NOT NULL CHECK (start_price > 0),
  current_bid       bigint,
  current_bidder_id uuid REFERENCES users(id),
  tax_rate          numeric(4,3) NOT NULL,        -- figé à la création de l'annonce
  status            listing_status NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  ends_at           timestamptz NOT NULL,
  CHECK (current_bidder_id IS DISTINCT FROM seller_id)
);
-- Une carte ne peut être en vente qu'une fois à la fois
CREATE UNIQUE INDEX ON market_listings (card_id) WHERE status = 'active';
CREATE INDEX ON market_listings (ends_at) WHERE status = 'active';

CREATE TABLE bids (
  id         bigserial PRIMARY KEY,
  listing_id uuid   NOT NULL REFERENCES market_listings(id),
  bidder_id  uuid   NOT NULL REFERENCES users(id),
  amount     bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON bids (listing_id, amount DESC);

-- Historique complet des ventes (source de last_sold_price)
CREATE TABLE sales (
  id          bigserial PRIMARY KEY,
  listing_id  uuid   NOT NULL REFERENCES market_listings(id),
  video_id    uuid   NOT NULL REFERENCES videos(id),
  rarity      rarity NOT NULL,
  variant     card_variant NOT NULL,
  seller_id   uuid   NOT NULL REFERENCES users(id),
  buyer_id    uuid   NOT NULL REFERENCES users(id),
  price       bigint NOT NULL,
  tax_burned  bigint NOT NULL,                   -- ViewCoins détruits
  sold_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sales (video_id, sold_at DESC);

-- -----------------------------------------------------------------------------
-- Combat 4v4
-- -----------------------------------------------------------------------------
CREATE TABLE decks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL
);

CREATE TABLE deck_cards (
  deck_id uuid     NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  slot    smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
  card_id uuid     NOT NULL REFERENCES cards(id),
  PRIMARY KEY (deck_id, slot),
  UNIQUE (deck_id, card_id)
);

CREATE TABLE matches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_a_id  uuid NOT NULL REFERENCES users(id),
  player_b_id  uuid REFERENCES users(id),
  deck_a_id    uuid REFERENCES decks(id),
  deck_b_id    uuid REFERENCES decks(id),
  status       match_status NOT NULL DEFAULT 'waiting',
  state        jsonb NOT NULL DEFAULT '{}',       -- PV, tour courant, bonus Collectif...
  winner_id    uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

-- Un tour de quizz : la bonne réponse ne quitte jamais le serveur avant résolution
CREATE TABLE quiz_rounds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  turn             smallint NOT NULL,
  attacker_card_id uuid NOT NULL REFERENCES cards(id),
  defender_id      uuid NOT NULL REFERENCES users(id),
  question         jsonb NOT NULL,                -- énoncé + choix (sans la réponse)
  correct_choice   smallint NOT NULL,
  answered_choice  smallint,
  is_correct       boolean,
  damage_dealt     integer,
  expires_at       timestamptz NOT NULL,
  answered_at      timestamptz,
  UNIQUE (match_id, turn)
);

-- -----------------------------------------------------------------------------
-- Quêtes / Albums (énigme -> cartes à deviner -> titre)
-- -----------------------------------------------------------------------------
CREATE TABLE albums (
  id         serial PRIMARY KEY,
  title_id   integer NOT NULL REFERENCES titles(id),
  riddle     text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true
);

-- Contenu caché de l'album : jamais exposé au client
CREATE TABLE album_requirements (
  album_id integer NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  video_id uuid    NOT NULL REFERENCES videos(id),
  PRIMARY KEY (album_id, video_id)
);

-- -----------------------------------------------------------------------------
-- Sécurité Supabase : RLS activée partout. Sans policy, la clé publique ne voit
-- rien ; le serveur (clé secrète) contourne RLS. Les policies viendront par feature.
-- -----------------------------------------------------------------------------
ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_factions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rarity_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goat_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synergy_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_synergy_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_refresh_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booster_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_requirements ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Droits d'accès via l'API Supabase. La RLS ci-dessus filtre les lignes :
-- sans policy, anon/authenticated ne voient rien ; service_role (serveur) voit tout.
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

COMMIT;

-- Force l'API Supabase à voir les nouvelles tables immédiatement
NOTIFY pgrst, 'reload schema';
