import type {
  CampaignTargetType,
  NotificationTemplate,
  NotificationTemplateInput,
  Package,
  PromoCode,
} from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import { SegmentedControl, Select, type SegmentedOption, type SelectOption } from '@admin/components/ui';
import { fetchPackages, fetchPromoCodes } from '@admin/lib/api';
import { usePermissions } from '@admin/lib/permissions';

import { linkActionLabel } from './notification-labels';
import { TEMPLATE_FIELD_ID } from './template-issues';

export type LinkValue = Pick<NotificationTemplateInput, 'targetType' | 'packageId' | 'promoCodeId'>;
// The input schema defaults these, so they may be absent; the editor always sets them.
type SavedLink = Pick<NotificationTemplate, 'package' | 'promoCode'>;
type LinkKind = 'NONE' | CampaignTargetType;

const KIND_OPTIONS: readonly SegmentedOption<LinkKind>[] = [
  { value: 'NONE', label: 'None' },
  { value: 'PACKAGE', label: 'Package' },
  { value: 'PROMO_CODE', label: 'Promo code' },
];

/** Can a mother still use it? Publish refuses anything else, so only these are offered. */
const isLivePackage = (p: Package) =>
  p.isActive && (p.expiresAt === null || Date.parse(p.expiresAt) > Date.now());
const isLivePromo = (c: PromoCode) =>
  c.isActive &&
  (c.expiresAt === null || Date.parse(c.expiresAt) > Date.now()) &&
  (c.maxUsage === null || c.usageCount < c.maxUsage);

/**
 * The package and promo-code lists, loaded only for the kind being chosen and
 * only for an admin who may read those sections (they are not opened to the
 * notifications section on the API).
 */
function useLinkCatalog(targetType: CampaignTargetType | null, readOnly: boolean) {
  const { can } = usePermissions();
  const packagesAllowed = can('packages', 'VIEW');
  const promosAllowed = can('promoCodes', 'VIEW');
  const packages = useQuery({
    queryKey: ['packages'],
    queryFn: fetchPackages,
    enabled: !readOnly && packagesAllowed && targetType === 'PACKAGE',
  });
  const promoCodes = useQuery({
    queryKey: ['promo-codes'],
    queryFn: fetchPromoCodes,
    enabled: !readOnly && promosAllowed && targetType === 'PROMO_CODE',
  });
  return { packages, promoCodes, packagesAllowed, promosAllowed };
}

/** The action line for the inbox-card preview ("Book with code SAVE20"). */
export function useLinkActionLabel(value: LinkValue, saved: SavedLink, readOnly: boolean): string | null {
  const targetType = value.targetType ?? null;
  const { promoCodes } = useLinkCatalog(targetType, readOnly);
  if (targetType !== 'PROMO_CODE') return linkActionLabel(targetType, null);
  const code =
    promoCodes.data?.find((c) => c.id === value.promoCodeId)?.code ??
    (saved.promoCode && saved.promoCode.id === value.promoCodeId ? saved.promoCode.code : null);
  return linkActionLabel('PROMO_CODE', code);
}

type TemplateLinkFieldsProps = {
  value: LinkValue;
  onChange: (next: LinkValue) => void;
  /** The names the saved template resolved, shown when the lists can't be loaded. */
  saved: SavedLink;
  readOnly: boolean;
  /** Locked while a save is in flight (unlike readOnly, still the editable rendering). */
  disabled?: boolean;
  error?: string;
};

/** None / Package / Promo code, then which one. Exactly one id is ever set. */
export function TemplateLinkFields({ value, onChange, saved, readOnly, disabled = false, error }: TemplateLinkFieldsProps) {
  const { packages, promoCodes, packagesAllowed, promosAllowed } = useLinkCatalog(value.targetType ?? null, readOnly);
  const kind: LinkKind = value.targetType ?? 'NONE';
  const id = TEMPLATE_FIELD_ID.link;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  if (readOnly) {
    return (
      <p className="link-summary">
        {kind === 'PACKAGE'
          ? `Opens package: ${saved.package?.name ?? `#${value.packageId ?? ''}`}`
          : kind === 'PROMO_CODE'
            ? `Starts a booking with code ${saved.promoCode?.code ?? `#${value.promoCodeId ?? ''}`}`
            : 'No link. Tapping it opens the app.'}
      </p>
    );
  }

  const setKind = (next: LinkKind) =>
    onChange({ targetType: next === 'NONE' ? null : next, packageId: null, promoCodeId: null });

  const isPackage = kind === 'PACKAGE';
  let options: SelectOption<number>[] = [];
  let allowed = true;
  if (kind === 'PACKAGE') {
    allowed = packagesAllowed;
    options = packagesAllowed
      ? (packages.data ?? [])
          .filter((p) => isLivePackage(p) || p.id === value.packageId)
          .map((p) => ({ value: p.id, label: isLivePackage(p) ? p.name : `${p.name} (no longer available)` }))
      : saved.package
        ? [{ value: saved.package.id, label: saved.package.name }]
        : [];
  } else if (kind === 'PROMO_CODE') {
    allowed = promosAllowed;
    options = promosAllowed
      ? (promoCodes.data ?? [])
          .filter((c) => isLivePromo(c) || c.id === value.promoCodeId)
          .map((c) => ({ value: c.id, label: isLivePromo(c) ? c.code : `${c.code} (no longer usable)` }))
      : saved.promoCode
        ? [{ value: saved.promoCode.id, label: saved.promoCode.code }]
        : [];
  }

  const hint = !allowed
    ? `You need access to ${isPackage ? 'Packages' : 'Promo Codes'} to choose a different one.`
    : isPackage
      ? 'Tapping it opens this package, ready to buy. Only packages on sale are listed.'
      : 'Tapping it starts a booking with this code already applied. Only codes that can still be used are listed.';

  return (
    <div className="link-fields">
      <SegmentedControl legend="Link" hideLegend value={kind} options={KIND_OPTIONS} onChange={setKind} disabled={disabled} />
      {kind === 'NONE' ? (
        <p className="field-hint">No link. Tapping the notification opens the app.</p>
      ) : (
        <div className="field">
          <span className="field-label">{isPackage ? 'Package' : 'Promo code'}</span>
          <Select<number>
            id={id}
            disabled={disabled}
            aria-label={isPackage ? 'Linked package' : 'Linked promo code'}
            value={(isPackage ? value.packageId : value.promoCodeId) ?? 0}
            options={[{ value: 0, label: isPackage ? 'Choose a package…' : 'Choose a promo code…' }, ...options]}
            onChange={(picked) =>
              onChange(
                isPackage
                  ? { targetType: 'PACKAGE', packageId: picked === 0 ? null : picked, promoCodeId: null }
                  : { targetType: 'PROMO_CODE', packageId: null, promoCodeId: picked === 0 ? null : picked },
              )
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(' ')}
          />
          <span className="field-hint" id={hintId}>
            {hint}
          </span>
          {error && (
            <span className="field-error" id={errorId}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
