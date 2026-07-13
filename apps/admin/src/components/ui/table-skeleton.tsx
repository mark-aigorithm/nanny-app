import { Card } from './card';
import { Skeleton } from './skeleton';

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
};

/** Placeholder rows shown inside a Card while a table's data loads. */
export function TableSkeleton({ rows = 5, columns = 5 }: TableSkeletonProps) {
  return (
    <Card flush>
      <div className="table-skeleton" role="status" aria-label="Loading data">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div className="table-skeleton-row" key={rowIndex}>
            {Array.from({ length: columns }).map((__, colIndex) => (
              <Skeleton
                key={colIndex}
                className="table-skeleton-cell"
                width={colIndex === 0 ? '55%' : '80%'}
              />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
