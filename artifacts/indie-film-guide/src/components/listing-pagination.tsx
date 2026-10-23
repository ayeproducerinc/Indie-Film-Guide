interface ListingPaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  busy: boolean;
  label: string;
  testId: string;
  onPage: (page: number) => void;
}

export function focusListingResults(id: string) {
  requestAnimationFrame(() => {
    const heading = document.getElementById(id);
    if (!heading) return;
    const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 56;
    const categoriesHeight = id === 'directory-results'
      ? document.querySelector('[data-directory-categories]')?.getBoundingClientRect().height ?? 0 : 0;
    window.scrollTo({ top: window.scrollY + heading.getBoundingClientRect().top - headerHeight - categoriesHeight - 16, behavior: 'instant' });
    heading?.focus({ preventScroll: true });
  });
}

export function ListingPagination({ page, pageCount, pageSize, total, busy, label, testId, onPage }: ListingPaginationProps) {
  if (!total) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav aria-label={label} data-testid={testId} className="mt-5 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground" aria-live="polite" data-testid={`${testId}-range`}>
        Showing {start}–{end} of {total}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-outline min-h-11 disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || page <= 1}
          data-testid={`${testId}-prev`} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="text-sm font-semibold" data-testid={`${testId}-page`} aria-live="polite">Page {page} of {pageCount}</span>
        <button type="button" className="btn-outline min-h-11 disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || page >= pageCount}
          data-testid={`${testId}-next`} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </nav>
  );
}
