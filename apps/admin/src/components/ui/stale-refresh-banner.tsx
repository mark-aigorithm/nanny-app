import { Button } from './button';
import { ICON_SIZE, RefreshCw } from './icon';

type StaleRefreshBannerProps = {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
};

/**
 * Non-blocking banner shown above already-rendered data when a background
 * refresh fails. Unlike `ErrorState`, it keeps the last loaded results on
 * screen instead of replacing them — so an error and stale data never render
 * as two competing full-page states at once.
 */
export function StaleRefreshBanner({ message, onRetry, retrying }: StaleRefreshBannerProps) {
  return (
    <div className="stale-refresh-banner" role="alert">
      <span>{message} Showing the last loaded results.</span>
      <Button variant="ghost" onClick={onRetry} disabled={retrying}>
        <RefreshCw size={ICON_SIZE.inline} />
        {retrying ? 'Retrying…' : 'Try again'}
      </Button>
    </div>
  );
}
