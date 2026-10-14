import { Globe, Layers, MessageCircle, PlayingCardsFan, ScrollText, Settings, Shield, Store, Swords, User, Users } from "lucide-react";

/** Pages de la sidebar : la même icône sert au menu et au titre de la page. */
export const NAV = [
  { href: "/", label: "Paquet", icon: PlayingCardsFan, match: ["/booster"] },
  { href: "/collection", label: "Collection", icon: Layers, match: [] },
  { href: "/cards", label: "Toutes les cartes", icon: Globe, match: [] },
  { href: "/market", label: "Marché", icon: Store, match: [] },
  { href: "/play", label: "Combat", icon: Swords, match: ["/match"] },
  { href: "/quests", label: "Quêtes", icon: ScrollText, match: [] },
  { href: "/friends", label: "Amis", icon: Users, match: [] },
  { href: "/messages", label: "Messages", icon: MessageCircle, match: [] },
  { href: "/profile", label: "Profil", icon: User, match: [] },
  { href: "/settings", label: "Paramètres", icon: Settings, match: [] },
];
export const ADMIN_NAV = { href: "/admin", label: "Admin", icon: Shield, match: [] };
