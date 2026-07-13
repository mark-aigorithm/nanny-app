import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { PromoCode } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Check,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Power,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deletePromoCode, updatePromoCode } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type PromoCodeTableProps = {
  promoCodes: PromoCode[];
};

function discountLabel(promo: PromoCode): string {
  return promo.discountType === 'PERCENTAGE' ? `${promo.value}%` : `${promo.value} EGP`;
}

export function PromoCodeTable({ promoCodes }: PromoCodeTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState<PromoCode | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['promo-codes'] });

  const toggleMutation = useMutation({
    mutationFn: (promo: PromoCode) => updatePromoCode(promo.id, { isActive: !promo.isActive }),
    onSuccess: (updated) => {
      invalidate();
      toast.success(updated.isActive ? 'Promo code activated' : 'Promo code deactivated', updated.code);
    },
    onError: (err) => toast.error('Couldn’t update promo code', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePromoCode,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Promo code deleted');
    },
    onError: (err) => toast.error('Couldn’t delete promo code', apiErrorMessage(err)),
  });

  const columns: Column<PromoCode>[] = [
    { key: 'code', header: 'Code', render: (promo) => <code>{promo.code}</code> },
    { key: 'discount', header: 'Discount', render: discountLabel },
    { key: 'used', header: 'Used', align: 'right', render: (promo) => promo.usageCount },
    { key: 'max', header: 'Max total', align: 'right', render: (promo) => promo.maxUsage ?? '∞' },
    {
      key: 'maxUser',
      header: 'Max / user',
      align: 'right',
      render: (promo) => promo.maxUsagePerUser ?? '∞',
    },
    {
      key: 'expires',
      header: 'Expires',
      render: (promo) =>
        promo.expiresAt ? (
          new Date(promo.expiresAt).toLocaleString()
        ) : (
          <span className="table-empty">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (promo) => (
        <Badge tone={promo.isActive ? 'success' : 'neutral'}>
          {promo.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (promo) => (
        <ActionMenu label={`Actions for promo code ${promo.code}`}>
          <MenuItem
            icon={promo.isActive ? <Power size={ICON_SIZE.menu} /> : <Check size={ICON_SIZE.menu} />}
            disabled={toggleMutation.isPending}
            onSelect={() => toggleMutation.mutate(promo)}
          >
            {promo.isActive ? 'Deactivate' : 'Activate'}
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(promo)}>
            Delete
          </MenuItem>
        </ActionMenu>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={promoCodes}
        rowKey={(promo) => promo.id}
        empty="No promo codes yet — create the first one above."
      />

      {deleting && (
        <ConfirmDialog
          title="Delete promo code"
          message={`Delete “${deleting.code}”? Parents will no longer be able to redeem it. This can’t be undone.`}
          confirmLabel="Delete code"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
