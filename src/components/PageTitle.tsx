import type { ReactNode } from "react";
import { ADMIN_NAV, NAV } from "@/lib/nav";

/** Titre de page précédé de l'icône de la page dans la sidebar. */
export function PageTitle({ href, children }: { href: string; children: ReactNode }) {
  const Icon = [...NAV, ADMIN_NAV].find((n) => n.href === href)?.icon;
  return (
    <h1 className="flex items-center gap-2">
      {Icon && <Icon className="size-7 shrink-0" aria-hidden />}
      {children}
    </h1>
  );
}
