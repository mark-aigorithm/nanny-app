import { Button } from './button';
import { ChevronLeft, ChevronRight, ICON_SIZE } from './icon';
import { Select } from './select';

type PaginationProps = {
  /** Current 1-based page. */
  page: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /** Total number of records across all pages. */
  total: number;
  /** Records shown per page. */
  limit: number;
  onPageChange: (page: number) => void;
  /** Predefined page-size choices for the limit selector. */
  limitOptions: readonly number[];
  onLimitChange: (limit: number) => void;
  /** Noun describing a record, used in the "Showing X of Y {label}" summary. */
  label?: string;
};

/**
 * Shared table footer: a "records per page" selector plus a page summary and
 * prev/next controls. Sits directly beneath any paginated <Table>.
 */
export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  limitOptions,
  onLimitChange,
  label = 'records',
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="pagination">
      <div className="pagination-size">
        <span className="pagination-size-label">Rows per page</span>
        <Select
          compact
          aria-label="Records per page"
          value={String(limit)}
          options={limitOptions.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(value) => onLimitChange(Number(value))}
        />
      </div>

      <div className="pagination-nav">
        <span className="pagination-summary">
          {total === 0 ? `No ${label}` : `${from}–${to} of ${total} ${label}`}
        </span>
        <div className="pagination-buttons">
          <Button
            variant="ghost"
            size="sm"
            disabled={!canPrev}
            aria-label="Previous page"
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={ICON_SIZE.inline} aria-hidden />
          </Button>
          <span className="pagination-page">
            Page {page} of {Math.max(totalPages, 1)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canNext}
            aria-label="Next page"
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={ICON_SIZE.inline} aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
