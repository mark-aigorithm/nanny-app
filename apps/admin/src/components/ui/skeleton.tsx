import type { CSSProperties } from 'react';

type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
};

/** Shimmering placeholder block for loading content. */
export function Skeleton({ width, height, radius, className, style }: SkeletonProps) {
  return (
    <span
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  );
}
