"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/app/auth/actions";
import { ADMIN_NAV, NAV } from "@/lib/nav";
import { createClient, subscribeToChanges } from "@/lib/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/** Boutons de menu plus grands que le défaut shadcn */
const ITEM = "h-11 gap-3 px-3 text-base [&_svg]:size-5";
/**
 * Pages : texte gris, rouge clair (--ring) pour la page en cours.
 * Icônes toujours de la couleur du texte principal : blanches en mode sombre, noires en mode clair.
 */
const NAV_ITEM = `${ITEM} text-muted-foreground data-active:text-ring data-active:hover:text-ring [&_svg]:text-sidebar-foreground`;

/**
 * Nombre de messages non lus, en direct : recompté à chaque message reçu (INSERT)
 * et à chaque message lu (UPDATE de read_at). Rien si 0, "99+" au-delà de 99.
 */
function UnreadBadge({ userId, initial }: { userId: string; initial: number }) {
  const [live, setLive] = useState<number | null>(null);
  const count = live ?? initial;

  useEffect(() => {
    const recount = async () => {
      const { count } = await createClient()
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null);
      setLive(count ?? 0);
    };
    const filter = `recipient_id=eq.${userId}`;
    const stopInserts = subscribeToChanges("INSERT", "messages", filter, recount);
    const stopUpdates = subscribeToChanges("UPDATE", "messages", filter, recount);
    return () => {
      stopInserts();
      stopUpdates();
    };
  }, [userId]);

  if (count <= 0) return null;
  return (
    <SidebarMenuBadge
      className="top-1/2! right-2 -translate-y-1/2 rounded-full bg-ring px-1.5 text-white peer-hover/menu-button:text-white peer-data-active/menu-button:text-white"
      aria-label={`${count} message${count > 1 ? "s" : ""} non lu${count > 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </SidebarMenuBadge>
  );
}

export function AppSidebar({ isAdmin, userId, unreadMessages }: { isAdmin: boolean; userId: string; unreadMessages: number }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV, ADMIN_NAV] : NAV;
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
                  <SidebarMenuButton className={NAV_ITEM} isActive={isActive(href, match)} tooltip={label} render={<Link href={href} />}>
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                  {href === "/messages" && <UnreadBadge userId={userId} initial={unreadMessages} />}
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
              <SidebarMenuButton className={`${ITEM} text-muted-foreground [&_svg]:text-sidebar-foreground`} type="submit" tooltip="Se déconnecter">
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
