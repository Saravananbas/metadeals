import { ChevronLeft, ChevronRight } from "lucide-react";

/** 1 … 4 5 6 … 20: the first and last page, the current page and one either side. */
function pagesToShow(page: number, total: number): (number | "gap")[] {
  const keep = new Set([1, total, page - 1, page, page + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...keep].sort((a, b) => a - b), out: (number | "gap")[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) out.push("gap"); out.push(n); });
  return out;
}

export function Pagination({ page, totalPages, onPage, disabled = false }: { page: number; totalPages: number; onPage: (page: number) => void; disabled?: boolean }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label="Deal pages">
      <button type="button" className="pager-btn" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={18} aria-hidden /><span>Previous</span></button>
      <ol className="pager-list">
        {pagesToShow(page, totalPages).map((n, i) => n === "gap"
          ? <li key={`g${i}`} aria-hidden="true" className="pager-gap">…</li>
          : <li key={n}><button type="button" className="pager-num" aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined} disabled={disabled} onClick={() => onPage(n)}>{n}</button></li>)}
      </ol>
      <button type="button" className="pager-btn" disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><span>Next</span><ChevronRight size={18} aria-hidden /></button>
    </nav>
  );
}
