const DEFAULT_CHECKOUT_ORIGIN = 'https://accept.paymob.com';

export function buildPaymobCheckoutUrl(publicKey: string, clientSecret: string): string {
  const params = new URLSearchParams({
    publicKey,
    clientSecret,
  });
  return `${DEFAULT_CHECKOUT_ORIGIN}/unifiedcheckout/?${params.toString()}`;
}
