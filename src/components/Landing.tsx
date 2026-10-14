import Link from "next/link";
import { Gift, PlayingCardsFan, ScrollText, Sparkles, Store, Swords, Users } from "lucide-react";
import { BoosterPack } from "@/components/BoosterPack";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RARITY_BG } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RARITY_FILTERS } from "@/lib/cardFilters";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: PlayingCardsFan,
    title: "Ouvre des paquets",
    text: "Un paquet de 5 cartes toutes les 10 minutes, gratuitement. Chaque carte est une vraie vidéo, révélée une à une.",
  },
  {
    icon: Sparkles,
    title: "Vise la YOAT",
    text: "Plus une vidéo a de vues, plus sa carte est rare : de Commune à Légendaire… jusqu'aux mythiques YOAT.",
  },
  {
    icon: Store,
    title: "Fais du commerce",
    text: "Mets tes doublons aux enchères et complète ta collection grâce aux ViewCoins gagnés en jouant.",
  },
  {
    icon: Swords,
    title: "Combats en 4 contre 4",
    text: "Chaque attaque déclenche un quiz sur la vidéo : réponds juste pour esquiver, et profite des factions.",
  },
  {
    icon: ScrollText,
    title: "Résous des énigmes",
    text: "Devine quelles cartes réunir pour compléter les quêtes et débloquer des titres à afficher.",
  },
  {
    icon: Users,
    title: "Joue entre amis",
    text: "Ajoute tes amis grâce à leur ID joueur et compare vos collections.",
  },
];

/** Page d'accueil des visiteurs non connectés : présentation du jeu et accès à la connexion. */
export function Landing() {
  const cta = (
    <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
      Se connecter
    </Button>
  );

  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <span className="text-xl font-bold">YoutuMaster</span>
        <ThemeToggle iconOnly />
      </header>

      <main className="mx-auto grid max-w-6xl gap-24 px-6 pb-24">
        {/* Présentation */}
        <section className="grid items-center gap-12 pt-8 md:grid-cols-2">
          <div className="grid gap-6">
            <h1 className="text-4xl leading-tight font-bold tracking-tight md:text-5xl">
              Collectionne les vidéos qui ont marqué le web
            </h1>
            <p className="text-lg text-muted-foreground">
              Ouvre des paquets, découvre des cartes tirées de plus d&apos;un million de vidéos, échange-les et
              affronte tes amis dans des combats-quiz.
            </p>
            {/* Les raretés, de la plus haute à la plus basse */}
            <ul className="flex flex-wrap gap-2" aria-label="Raretés">
              {RARITY_FILTERS.map(([rarity, , label]) => (
                <li key={rarity} className={cn("rounded-full px-3 py-1 text-xs font-semibold text-zinc-900", RARITY_BG[rarity])}>
                  {label}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-4">
              {cta}
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Gift className="size-4 text-ring" /> 10 paquets offerts à l&apos;inscription
              </span>
            </div>
          </div>
          <div className="group flex justify-center" aria-hidden>
            <div className="rotate-3 transition-transform duration-500 group-hover:rotate-0">
              <BoosterPack />
            </div>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section className="grid gap-8">
          <h2 className="text-center text-3xl font-bold">Comment on joue ?</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <Card key={title}>
                <CardHeader className="gap-3">
                  <Icon className="size-8 text-ring" aria-hidden />
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* Dernier appel */}
        <section className="grid justify-items-center gap-4 rounded-2xl border bg-muted/40 px-6 py-12 text-center">
          <h2 className="text-3xl font-bold">100 % gratuit, 0 % pay-to-win</h2>
          <p className="max-w-xl text-muted-foreground">
            Tout le monde joue avec les mêmes règles. Le jeu vit grâce aux dons, qui ne donnent que des cosmétiques.
          </p>
          {cta}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        YoutuMaster — fan-game gratuit. Les miniatures et vidéos restent hébergées par leur plateforme d&apos;origine.
      </footer>
    </div>
  );
}
