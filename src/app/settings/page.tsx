import { PageTitle } from "@/components/PageTitle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteAccount } from "./DeleteAccount";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { error } = await searchParams;
  return (
    <main className="p-6">
      <PageTitle href="/settings">Paramètres</PageTitle>
      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Apparence</CardTitle>
            <CardDescription>Thème clair ou sombre, mémorisé dans ce navigateur.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Zone de danger</CardTitle>
            <CardDescription>La suppression de ton compte est définitive.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <DeleteAccount />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error === "confirm" ? "Le mot de confirmation est incorrect." : `La suppression a échoué : ${error}`}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
