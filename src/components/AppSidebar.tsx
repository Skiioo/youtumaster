"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, House, Layers, LogOut, ScrollText, Shield, Store, Swords, User } from "lucide-react";
import { logout } from "@/app/auth/actions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV = [
  { href: "/", label: "Accueil", icon: House, match: ["/booster"] },
  { href: "/collection", label: "Collection", icon: Layers, match: ["/card"] },
  { href: "/market", label: "Marché", icon: Store, match: [] },
  { href: "/play", label: "Combat", icon: Swords, match: ["/match"] },
  { href: "/quests", label: "Quêtes", icon: ScrollText, match: [] },
  { href: "/profile", label: "Profil", icon: User, match: [] },
];

export function AppSidebar({ username, viewcoins, isAdmin }: { username: string; viewcoins: number; isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: Shield, match: [] }] : NAV;
  const isActive = (href: string, match: string[]) =>
    href === "/" ? pathname === "/" || match.some((m) => pathname.startsWith(m)) : [href, ...match].some((m) => pathname.startsWith(m));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <span className="text-xl">🃏</span>
              <span className="font-semibold">ViewCards</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(({ href, label, icon: Icon, match }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton isActive={isActive(href, match)} tooltip={label} render={<Link href={href} />}>
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={`${viewcoins} ViewCoins`} render={<Link href="/profile" />}>
              <Coins />
              <span className="truncate">
                {username} · {viewcoins.toLocaleString("fr-FR")}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton type="submit" tooltip="Se déconnecter">
                <LogOut />
                <span>Se déconnecter</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
