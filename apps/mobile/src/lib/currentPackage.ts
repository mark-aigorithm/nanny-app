import type { PackageHoursBalance, PackagePurchase } from '@nanny-app/shared';

/**
 * The packages her care hours can actually be drawn from: active, not yet
 * expired, with hours left. The server returns buckets soonest-to-expire
 * first — the order it redeems them in — so the first one here is the
 * package her next booking uses.
 */
export function usablePackages(balance: PackageHoursBalance, now: Date = new Date()): PackagePurchase[] {
  return balance.buckets.filter(
    (b) =>
      b.status === 'ACTIVE' &&
      b.hoursRemaining > 0 &&
      (b.expiresAt === null || new Date(b.expiresAt) > now),
  );
}

/**
 * One line naming the package her hours come from: its name, "+ N more" when
 * she holds others, or "No active package".
 */
export function currentPackageLabel(balance: PackageHoursBalance, now: Date = new Date()): string {
  const [current, ...rest] = usablePackages(balance, now);
  if (!current) return 'No active package';
  return rest.length > 0 ? `${current.packageName} + ${rest.length} more` : current.packageName;
}
