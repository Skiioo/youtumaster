import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import Script from "next/script";
import { Coins } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
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

  return (
    <html lang="fr" className={roboto.variable} suppressHydrationWarning>
      <body>
        {/* Avant l'affichage : thème choisi (localStorage) sinon celui du système ; .dark active le thème sombre shadcn */}
        <Script id="theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("theme");document.documentElement.classList.toggle("dark",t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches)}catch(e){}`}
        </Script>
        <TooltipProvider>
          {profile ? (
            <SidebarProvider>
              <AppSidebar isAdmin={profile.role === "admin"} />
              <SidebarInset className="relative">
                {/* Solde de ViewCoins, en haut à droite de chaque page */}
                <div className="absolute top-3 right-4 z-10 flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm font-semibold shadow-sm">
                  <Coins className="size-4 text-amber-500" />
                  {profile.viewcoins.toLocaleString("fr-FR")}
                  <span className="sr-only">ViewCoins</span>
                </div>
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
