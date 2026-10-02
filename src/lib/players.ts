/** Mécène actif (ou admin) : accès aux cosmétiques réservés. Aucun effet sur le gameplay. */
export function isPatron(u: { role: string; patron_until: string | null } | null | undefined) {
  if (!u) return false;
  return u.role === "admin" || (u.role === "patron" && (!u.patron_until || Date.parse(u.patron_until) > Date.now()));
}

/** Accepte un identifiant brut ou un lien vidéo complet (?v=ID, /ID, /shorts/ID). */
export function parseVideoId(input: string): string {
  const s = input.trim();
  try {
    const url = new URL(s);
    return url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop() ?? s;
  } catch {
    return s;
  }
}
