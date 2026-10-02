import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

// Branchée sur font-sans du thème shadcn via --font-roboto (voir globals.css)
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ViewCards",
  description: "Jeu de cartes à collectionner gratuit",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("username, role, viewcoins").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <html lang="fr" className={roboto.variable}>
      <body>
        <TooltipProvider>
          {profile ? (
            <SidebarProvider>
              <AppSidebar username={profile.username} viewcoins={profile.viewcoins} isAdmin={profile.role === "admin"} />
              <SidebarInset>
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
