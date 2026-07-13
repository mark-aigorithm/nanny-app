import type { ReactNode } from 'react';

export type DescriptionItem = {
  label: ReactNode;
  value: ReactNode;
  /** Let this item span the full width of the grid (e.g. long notes). */
  wide?: boolean;
};

type DescriptionListProps = {
  items: DescriptionItem[];
};

/**
 * Read-only key/value grid for detail pages. Labels use the small uppercase
 * table-header treatment; values sit beneath. Compose several inside <Card>s.
 */
export function DescriptionList({ items }: DescriptionListProps) {
  return (
    <dl className="desc-list">
      {items.map((item, index) => (
        <div
          key={index}
          className={`desc-item${item.wide ? ' desc-item--wide' : ''}`}
        >
          <dt className="desc-label">{item.label}</dt>
          <dd className="desc-value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
