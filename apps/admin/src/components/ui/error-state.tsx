import { Card } from './card';
import { Button } from './button';
import { CircleAlert, ICON_SIZE, RefreshCw } from './icon';

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
};

/**
 * Rich, centered error panel with an icon, a descriptive message, and an
 * optional Retry action. Replaces the flat one-line error text on data pages.
 */
export function ErrorState({
  title = 'We couldn’t load this',
  message,
  onRetry,
  retrying,
}: ErrorStateProps) {
  return (
    <Card>
      <div className="error-state" role="alert">
        <span className="error-state-icon">
          <CircleAlert size={ICON_SIZE.state} />
        </span>
        <p className="error-state-title">{title}</p>
        <p className="error-state-message">{message}</p>
        {onRetry && (
          <div className="error-state-actions">
            <Button variant="ghost" onClick={onRetry} disabled={retrying}>
              <RefreshCw size={ICON_SIZE.inline} />
              {retrying ? 'Retrying…' : 'Try again'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
