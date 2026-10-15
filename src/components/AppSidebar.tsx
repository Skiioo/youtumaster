"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/app/auth/actions";
import { ADMIN_NAV, NAV } from "@/lib/nav";
import { freshSince } from "@/lib/players";
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

type SupabaseBrowser = ReturnType<typeof createClient>;

/** Sources des pastilles : que compter, et quels changements écouter en temps réel */
const BADGES = {
  // Messages non lus : recompte à chaque message reçu (INSERT) ou lu (UPDATE de read_at)
  messages: {
    table: "messages",
    filter: (u: string) => `recipient_id=eq.${u}`,
    count: (db: SupabaseBrowser, u: string) =>
      db.from("messages").select("id", { count: "exact", head: true }).eq("recipient_id", u).is("read_at", null),
    label: (n: number) => `${n} message${n > 1 ? "s" : ""} non lu${n > 1 ? "s" : ""}`,
    refreshMs: 0,
  },
  // Duels d'amis reçus et toujours valables (créateur encore présent : signal de moins de 45 s)
  duels: {
    table: "matches",
    filter: (u: string) => `invited_id=eq.${u}`,
    count: (db: SupabaseBrowser, u: string) =>
      db
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting")
        .eq("invited_id", u)
        .gt("last_seen_at", freshSince()),
    label: (n: number) => `${n} défi${n > 1 ? "s" : ""} d'ami en attente`,
    refreshMs: 30_000, // un défi expire sans événement (créateur parti) : recompte régulier
  },
} as const;

/** Pastille rouge en direct sur une entrée de la sidebar. Rien si 0, "99+" au-delà de 99. */
function LiveBadge({ kind, userId, initial }: { kind: keyof typeof BADGES; userId: string; initial: number }) {
  const [live, setLive] = useState<number | null>(null);
  const count = live ?? initial;

  useEffect(() => {
    const src = BADGES[kind];
    const recount = async () => setLive((await src.count(createClient(), userId)).count ?? 0);
    const stops = (["INSERT", "UPDATE"] as const).map((event) => subscribeToChanges(event, src.table, src.filter(userId), recount));
    const timer = src.refreshMs ? setInterval(recount, src.refreshMs) : undefined;
    return () => {
      stops.forEach((stop) => stop());
      clearInterval(timer);
    };
  }, [kind, userId]);

  if (count <= 0) return null;
  return (
    <SidebarMenuBadge
      className="top-1/2! right-2 -translate-y-1/2 rounded-full bg-ring px-1.5 text-white peer-hover/menu-button:text-white peer-data-active/menu-button:text-white"
      aria-label={BADGES[kind].label(count)}
    >
      {count > 99 ? "99+" : count}
    </SidebarMenuBadge>
  );
}

export function AppSidebar({ isAdmin, userId, unreadMessages, pendingDuels }: {
  isAdmin: boolean;
  userId: string;
  unreadMessages: number;
  pendingDuels: number;
}) {
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
                  {href === "/messages" && <LiveBadge kind="messages" userId={userId} initial={unreadMessages} />}
                  {href === "/play" && <LiveBadge kind="duels" userId={userId} initial={pendingDuels} />}
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
