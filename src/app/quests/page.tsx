import Link from "next/link";
import { Lock, Trophy } from "lucide-react";
import { PageTitle } from "@/components/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/server";

type AlbumProgress = { album_id: number; title: string; riddle: string; owned: number; total: number; unlocked: boolean };

export default async function QuestsPage({ searchParams }: PageProps<"/quests">) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: newTitles } = await supabase.rpc("claim_albums"); // débloque les albums complétés
  const { data: progress } = await supabase.rpc("album_progress");
  const albums = (progress ?? []) as AlbumProgress[];

  return (
    <main className="p-6">
      <PageTitle href="/quests">Quêtes</PageTitle>
      {/* Quêtes sur 3 colonnes (2 sur tablette, 1 sur mobile) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!!newTitles && (
          <p role="status" className="col-span-full font-medium">
            🎉 {newTitles} nouveau{newTitles > 1 ? "x" : ""} titre{newTitles > 1 ? "s" : ""} débloqué{newTitles > 1 ? "s" : ""} ! Affiche-le dans ton <Link href="/profile">profil</Link>.
          </p>
        )}
        {error && <p role="alert" className="col-span-full text-destructive">{error}</p>}

        {/* Une carte par quête : titre à gagner, énigme, progression */}
        {albums.map((a) => (
          <Card key={a.album_id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  {a.unlocked ? <Trophy className="size-4 text-amber-500" /> : <Lock className="size-4 text-muted-foreground" />}
                  {a.title}
                </CardTitle>
                {a.unlocked && <Badge variant="secondary">Titre débloqué</Badge>}
              </div>
              <CardDescription className="italic">« {a.riddle} »</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Progress value={(a.owned / a.total) * 100} aria-label={`Progression : ${a.owned} sur ${a.total}`} />
              <p className="text-xs text-muted-foreground">
                {a.owned} / {a.total} cartes trouvées
              </p>
            </CardContent>
          </Card>
        ))}

        {albums.length === 0 && (
          <Card className="col-span-full">
            <CardHeader>
              <CardTitle>Aucune quête pour l&apos;instant</CardTitle>
              <CardDescription>Les prochaines énigmes arrivent bientôt : reviens plus tard !</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </main>
  );
}
