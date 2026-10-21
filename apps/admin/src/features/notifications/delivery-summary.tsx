import type { NotificationTemplate } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  BellRing,
  Card,
  ICON_SIZE,
  Link2,
  TriangleAlert,
  Users,
  type LucideIcon,
} from '@admin/components/ui';
import { previewNotificationAudience } from '@admin/lib/api';
import { useCanManage } from '@admin/lib/permissions';

import { CHANNEL_HINT, CHANNEL_LABEL, formatCount, mothersLabel } from './notification-labels';
import { SavedAudience } from './template-audience-fields';

function DeliveryRow({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="delivery-summary-row">
      <span className="delivery-summary-icon" aria-hidden>
        <Icon size={ICON_SIZE.inline} />
      </span>
      <div className="delivery-summary-body">
        <h3 className="delivery-summary-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** How many of the audience the push can reach, and a warning when it reaches nobody. */
function AudienceReach({ template }: { template: NotificationTemplate }) {
  const reach = useQuery({
    queryKey: ['notification-audience-preview', template.audience],
    queryFn: () => previewNotificationAudience(template.audience),
  });
  if (reach.isError)
    return <p className="delivery-summary-note">We couldn’t count this audience.</p>;
  if (!reach.data) return <p className="delivery-summary-note">Counting mothers…</p>;

  const { mothers, withPushDevice } = reach.data;
  const sendsPush = template.channel !== 'IN_APP';
  return (
    <>
      <div className="delivery-summary-chips">
        {/* Picked mothers are already counted in the line above; a group's size is news. */}
        {template.audience.type === 'GROUPS' && (
          <span className="delivery-summary-chip">{mothersLabel(mothers)}</span>
        )}
        {sendsPush && (
          <span className="delivery-summary-chip">
            {formatCount(withPushDevice)} with push enabled
          </span>
        )}
      </div>
      {sendsPush && mothers > 0 && withPushDevice === 0 && (
        <p className="delivery-summary-warning">
          <TriangleAlert size={ICON_SIZE.inline} aria-hidden />
          {template.channel === 'PUSH'
            ? 'None of them has push turned on, so nobody will get this.'
            : 'None of them has push turned on, so it only reaches the inbox.'}
        </p>
      )}
    </>
  );
}

/** Where a tap leads, worded to follow "Tapping it opens". */
function linkDestination(template: NotificationTemplate): string {
  if (template.targetType === 'PACKAGE') {
    return `The ${template.package?.name ?? `#${template.packageId ?? ''}`} package`;
  }
  if (template.targetType === 'PROMO_CODE') {
    return `A booking with code ${template.promoCode?.code ?? `#${template.promoCodeId ?? ''}`}`;
  }
  return 'The app (no link set)';
}

/** Who a saved template goes to, how it arrives, and what a tap opens. */
export function DeliverySummary({ template }: { template: NotificationTemplate }) {
  // Counting the audience needs manage access, so a view-only operator sees the names only.
  const canManage = useCanManage('notifications');
  return (
    <Card title="Delivery" className="delivery-summary">
      <DeliveryRow icon={Users} title="Who gets it">
        <div className="delivery-summary-value">
          <SavedAudience
            value={template.audience}
            saved={{ groups: template.audienceGroups, mothers: template.audienceMothers }}
          />
        </div>
        {canManage && <AudienceReach template={template} />}
      </DeliveryRow>
      <DeliveryRow icon={BellRing} title="How it arrives">
        <p className="delivery-summary-value">{CHANNEL_LABEL[template.channel]}</p>
        <p className="delivery-summary-note">{CHANNEL_HINT[template.channel]}</p>
      </DeliveryRow>
      <DeliveryRow icon={Link2} title="Tapping it opens">
        <p className="delivery-summary-value">{linkDestination(template)}</p>
      </DeliveryRow>
    </Card>
  );
}
