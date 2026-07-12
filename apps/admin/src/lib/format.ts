/** Format an EGP amount for the admin UI, e.g. 410.4 → "EGP 410.40". */
export function formatEgp(amount: number): string {
  return `EGP ${amount.toLocaleString('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact currency without the code, e.g. 410.4 → "410.40". */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
