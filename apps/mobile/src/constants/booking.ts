export const PROMO_CODE_VALUE = 'FIRST20';
export const PROMO_DISCOUNT_PERCENT = 0.2;
export const PLATFORM_FEE_PERCENT = 0.06;

export const BOOKING_DURATION_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

export const PAYMENT_TYPES: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};
