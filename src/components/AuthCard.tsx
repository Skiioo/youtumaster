import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/** Cadre commun des pages Connexion / Inscription, centré, avec le nom du jeu au-dessus. */
export function AuthCard({ title, description, children, footer }: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="grid w-full max-w-sm gap-6">
        <Link href="/" className="text-center text-2xl font-bold">
          YoutuMaster
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
          <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>
        </Card>
      </div>
    </main>
  );
}
