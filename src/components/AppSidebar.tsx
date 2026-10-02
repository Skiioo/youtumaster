"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, LogOut, PlayingCardsFan, ScrollText, Shield, Store, Swords, User } from "lucide-react";
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
  { href: "/", label: "Paquet", icon: PlayingCardsFan, match: ["/booster"] },
  { href: "/collection", label: "Collection", icon: Layers, match: ["/card"] },
  { href: "/market", label: "Marché", icon: Store, match: [] },
  { href: "/play", label: "Combat", icon: Swords, match: ["/match"] },
  { href: "/quests", label: "Quêtes", icon: ScrollText, match: [] },
  { href: "/profile", label: "Profil", icon: User, match: [] },
];

/** Boutons de menu plus grands que le défaut shadcn */
const ITEM = "h-11 gap-3 px-3 text-base [&_svg]:size-5";

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: Shield, match: [] }] : NAV;
  const isActive = (href: string, match: string[]) =>
    href === "/" ? pathname === "/" || match.some((m) => pathname.startsWith(m)) : [href, ...match].some((m) => pathname.startsWith(m));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <Link href="/" className="px-3 py-2 text-xl font-bold">
          YoutuMaster
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {items.map(({ href, label, icon: Icon, match }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton className={ITEM} isActive={isActive(href, match)} tooltip={label} render={<Link href={href} />}>
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton className={ITEM} type="submit" tooltip="Se déconnecter">
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
