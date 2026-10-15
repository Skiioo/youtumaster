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

/** ID joueur affiché en deux blocs : ABCD2345 -> ABCD-2345 */
export const formatFriendCode = (code: string | null | undefined) => (code ? `${code.slice(0, 4)}-${code.slice(4)}` : "");

/** Délai sans signal au-delà duquel un joueur a quitté sa partie (même règle que match_leave.sql) */
export const LEAVE_AFTER_MS = 45_000;
/** Limite à partir de laquelle un défi en attente est encore valable (créateur toujours présent) */
export const freshSince = () => new Date(Date.now() - LEAVE_AFTER_MS).toISOString();
