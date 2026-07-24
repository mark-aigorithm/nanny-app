const APP_SCHEME_PREFIX = 'nanny-app://';

/** Must match backend `PAYMOB_RETURN_PATH`. */
export const PAYMOB_RETURN_PATH = '/paymob/return';

export type PaymobRedirectHint = 'success' | 'failure' | 'return';

function parsePaymobQueryHint(params: URLSearchParams): PaymobRedirectHint {
  const success = params.get('success')?.toLowerCase();
  const pending = params.get('pending')?.toLowerCase();
  const txnCode = params.get('txn_response_code')?.toUpperCase() ?? '';
  const errorOccured = params.get('error_occured')?.toLowerCase() === 'true';

  if (success === 'false' || errorOccured || txnCode === 'DECLINED') {
    return 'failure';
  }

  if (success === 'true' && pending !== 'true') {
    return 'success';
  }

  return 'return';
}

function isPaymobReturnPath(pathname: string): boolean {
  return pathname === PAYMOB_RETURN_PATH || pathname.endsWith(`${PAYMOB_RETURN_PATH}/`);
}

/**
 * Detect when Paymob redirects back after checkout.
 * Matches our backend `/paymob/return` URL (WebView can intercept HTTP).
 */
export function isPaymobPaymentRedirect(url: string): PaymobRedirectHint | null {
  const lower = url.toLowerCase();

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (!isPaymobReturnPath(parsed.pathname)) {
        return null;
      }
      return parsePaymobQueryHint(parsed.searchParams);
    } catch {
      return null;
    }
  }

  // Legacy deep link (WebView often cannot open custom schemes on Android).
  if (!lower.startsWith(APP_SCHEME_PREFIX)) {
    return null;
  }

  if (!lower.includes('payment-result') && !lower.includes('payment-return')) {
    return null;
  }

  try {
    const parsed = new URL(url.replace(APP_SCHEME_PREFIX, 'https://app/'));
    return parsePaymobQueryHint(parsed.searchParams);
  } catch {
    return 'return';
  }
}

/**
 * The extension id the backend puts on the return URL alongside `bookingId`
 * when the payment was for extra hours. Null for an ordinary booking payment.
 */
export function extractExtensionIdFromRedirect(url: string): string | null {
  try {
    const parsed = url.startsWith('http')
      ? new URL(url)
      : new URL(url.replace(APP_SCHEME_PREFIX, 'https://app/'));
    return parsed.searchParams.get('extensionId') ?? parsed.searchParams.get('extension_id');
  } catch {
    const match = url.match(/[?&]extensionId=([^&]+)/i) ?? url.match(/[?&]extension_id=([^&]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}

export function extractBookingIdFromRedirect(url: string): string | null {
  try {
    const parsed = url.startsWith('http')
      ? new URL(url)
      : new URL(url.replace(APP_SCHEME_PREFIX, 'https://app/'));
    return parsed.searchParams.get('bookingId') ?? parsed.searchParams.get('booking_id');
  } catch {
    const match = url.match(/[?&]bookingId=([^&]+)/i) ?? url.match(/[?&]booking_id=([^&]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}
