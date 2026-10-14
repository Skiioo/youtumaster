import Link from "next/link";
import { redirect } from "next/navigation";
import { signup } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { error } = await searchParams;
  const supabase = await createClient();
  if ((await supabase.auth.getUser()).data.user) redirect("/"); // déjà connecté

  return (
    <AuthCard
      title="Créer un compte"
      description="Gratuit, sans carte bancaire. 10 paquets t'attendent dès l'inscription."
      footer={
        <p>
          Déjà un compte ? <Link href="/login" className="font-medium text-ring hover:underline">Se connecter</Link>
        </p>
      }
    >
      <form action={signup} className="grid gap-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-2">
          <Label htmlFor="username">Pseudo</Label>
          <Input id="username" name="username" required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" autoComplete="username" />
          <p className="text-xs text-muted-foreground">3 à 20 caractères : lettres, chiffres, _</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <p className="text-xs text-muted-foreground">8 caractères minimum</p>
        </div>
        <Button type="submit" className="w-full">
          Créer mon compte
        </Button>
      </form>
    </AuthCard>
  );
}
