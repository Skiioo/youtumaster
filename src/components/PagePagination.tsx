import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

/** Numéros affichés : première, dernière, et les voisines de la page courante (… entre les trous). */
function pageNumbers(page: number, total: number): (number | "…")[] {
  const keep = [...new Set([1, page - 1, page, page + 1, total])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  return keep.flatMap((n, i) => (i > 0 && n - keep[i - 1] > 1 ? ["…" as const, n] : [n]));
}

/** Groupe de pagination : Précédent, numéros, Suivant, et "Page X sur N". */
export function PagePagination({ page, totalPages, hrefFor, more = false }: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  /** Le total est plafonné : affiche "sur N+" */
  more?: boolean;
}) {
  if (totalPages <= 1) return null;
  const off = "pointer-events-none opacity-50";

  return (
    <div className="my-6 grid justify-items-center gap-1">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              text="Précédent"
              variant="secondary"
              href={hrefFor(page - 1)}
              aria-disabled={page <= 1}
              className={cn(page <= 1 && off)}
            />
          </PaginationItem>
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "…" ? (
              <PaginationItem key={`gap-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={n}>
                <PaginationLink href={hrefFor(n)} isActive={n === page}>
                  {n}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              text="Suivant"
              variant="secondary"
              href={hrefFor(page + 1)}
              aria-disabled={page >= totalPages}
              className={cn("ml-3", page >= totalPages && off)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <p className="text-sm text-muted-foreground">
        Page {page} sur {totalPages}
        {more && "+"}
      </p>
    </div>
  );
}

/** Page demandée dans l'URL, ramenée entre 1 et le nombre de pages. */
export const parsePage = (value: unknown) => Math.max(1, Math.floor(Number(value)) || 1);
