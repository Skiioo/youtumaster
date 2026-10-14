import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, deleted } = await searchParams;
  const supabase = await createClient();
  if ((await supabase.auth.getUser()).data.user) redirect("/"); // déjà connecté

  return (
    <AuthCard
      title="Connexion"
      description="Content de te revoir ! Connecte-toi pour ouvrir tes paquets."
      footer={
        <p>
          Vous n&apos;avez pas de compte ? <Link href="/signup" className="font-medium text-ring hover:underline">S&apos;inscrire</Link>
        </p>
      }
    >
      <form action={login} className="grid gap-4">
        {deleted && <p role="status" className="text-sm">Ton compte a bien été supprimé.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full">
          Se connecter
        </Button>
      </form>
    </AuthCard>
  );
}
