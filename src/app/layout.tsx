import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import Script from "next/script";
import { AppSidebar } from "@/components/AppSidebar";
import { CoinCounter } from "@/components/CoinCounter";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { freshSince } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

// Branchée sur font-sans du thème shadcn via --font-roboto (voir globals.css)
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YoutuMaster",
  description: "Jeu de cartes à collectionner gratuit",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("users")
        .select("role, viewcoins")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const { count: unreadMessages } = user
    ? await supabase.from("messages").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).is("read_at", null)
    : { count: 0 };
  // Défis d'amis reçus dont le créateur attend encore (même règle des 45 s que côté SQL)
  const { count: pendingDuels } = user
    ? await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting")
        .eq("invited_id", user.id)
        .gt("last_seen_at", freshSince())
    : { count: 0 };

  return (
    <html lang="fr" className={roboto.variable} suppressHydrationWarning>
      {/* suppressHydrationWarning : certaines extensions (ColorZilla…) ajoutent des attributs au <body> */}
      <body suppressHydrationWarning>
        {/* Avant l'affichage : thème choisi (localStorage) sinon celui du système ; .dark active le thème sombre shadcn */}
        <Script id="theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("theme");document.documentElement.classList.toggle("dark",t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches)}catch(e){}`}
        </Script>
        <TooltipProvider>
          {profile ? (
            <SidebarProvider>
              <AppSidebar
                isAdmin={profile.role === "admin"}
                userId={user!.id}
                unreadMessages={unreadMessages ?? 0}
                pendingDuels={pendingDuels ?? 0}
              />
              <SidebarInset className="relative">
                {/* Solde de ViewCoins, en haut à droite de chaque page */}
                <CoinCounter userId={user!.id} initial={profile.viewcoins} />
                {/* Bouton menu uniquement sur mobile, où la sidebar est un panneau glissant */}
                <header className="flex h-12 items-center border-b px-3 md:hidden">
                  <SidebarTrigger />
                </header>
                {children}
              </SidebarInset>
            </SidebarProvider>
          ) : (
            children
          )}
        </TooltipProvider>
      </body>
    </html>
  );
}
