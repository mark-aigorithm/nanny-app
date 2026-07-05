import Constants from 'expo-constants';

const FALLBACK_CURRENCY = 'EGP';

/** Platform default — matches backend Payment.currency and Paymob settlement. */
export function getCurrencyCode(): string {
  const configured = Constants.expoConfig?.extra?.currencyCode;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().toUpperCase();
  }
  return FALLBACK_CURRENCY;
}

export const CURRENCY_CODE = getCurrencyCode();

export function formatMoney(
  amount: number,
  options?: { fractionDigits?: number; currency?: string },
): string {
  const currency =
    options?.currency?.trim().toUpperCase() || getCurrencyCode();
  const fractionDigits = options?.fractionDigits ?? 2;
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${currency} ${formatted}`;
}
export function formatHourlyRateAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return formatMoney(amount, { fractionDigits: 0 });
}

export function formatHourlyRate(amount: number | null | undefined, fallback = '—'): string {
  if (amount == null || !Number.isFinite(amount)) return fallback;
  return `${formatMoney(amount, { fractionDigits: 0 })}/hr`;
}
