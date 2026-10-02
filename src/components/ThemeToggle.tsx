"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Bascule clair/sombre, mémorisée dans le navigateur. Icône et libellé suivent la classe .dark en CSS. */
export function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // stockage indisponible (navigation privée…) : le choix vaut pour la session
    }
  };

  return (
    <Button variant="outline" onClick={toggle} className="w-fit">
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
      <span className="dark:hidden">Passer en mode sombre</span>
      <span className="hidden dark:inline">Passer en mode clair</span>
    </Button>
  );
}
