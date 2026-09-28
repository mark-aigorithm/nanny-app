import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { PromoCode } from '@nanny-app/shared';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  Check,
  type Column,
  idColumn,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  Power,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { PromoCodeFormModal } from '@admin/features/promo-codes/promo-code-form';
import { deletePromoCode, updatePromoCode } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

type PromoCodeSortKey =
  | 'id'
  | 'code'
  | 'discount'
  | 'used'
  | 'max'
  | 'maxUser'
  | 'expires'
  | 'status'
  | 'created';

type PromoCodeTableProps = {
  promoCodes: PromoCode[];
};

function discountLabel(promo: PromoCode): string {
  return promo.discountType === 'PERCENTAGE' ? `${promo.value}%` : `${promo.value} EGP`;
}

export function PromoCodeTable({ promoCodes }: PromoCodeTableProps) {
  const canManage = useCanManage('promoCodes');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState<PromoCode | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['promo-codes'] });

  // The API lists newest first, so that is the default. Discounts group by type
  // (flat, then percentage) and order by value within it; an unlimited cap
  // sorts as the biggest, and a code with no expiry sorts last either way.
  const { rows, sort, onSortChange } = useClientSort<PromoCode, PromoCodeSortKey>(
    promoCodes,
    {
      id: (row) => row.id,
      code: (promo) => promo.code,
      discount: (promo) => `${promo.discountType} ${promo.value.toFixed(2).padStart(12, '0')}`,
      used: (promo) => promo.usageCount,
      max: (promo) => promo.maxUsage ?? Number.POSITIVE_INFINITY,
      maxUser: (promo) => promo.maxUsagePerUser ?? Number.POSITIVE_INFINITY,
      expires: (promo) => (promo.expiresAt ? Date.parse(promo.expiresAt) : null),
      status: (promo) => (promo.isActive ? 'Active' : 'Inactive'),
      created: (promo) => Date.parse(promo.createdAt),
    },
    { sortBy: 'created', sortDir: 'desc' },
  );

  const toggleMutation = useMutation({
    mutationFn: (promo: PromoCode) => updatePromoCode(promo.id, { isActive: !promo.isActive }),
    onSuccess: (updated) => {
      invalidate();
      toast.success(
        updated.isActive ? 'Promo code activated' : 'Promo code deactivated',
        updated.code,
      );
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

  const columns: Column<PromoCode, PromoCodeSortKey>[] = [
    idColumn((row) => row.id, 'id'),
    { key: 'code', header: 'Code', sortKey: 'code', render: (promo) => <code>{promo.code}</code> },
    {
      key: 'discount',
      header: 'Discount',
      sortKey: 'discount',
      sortFirst: 'desc',
      render: discountLabel,
    },
    {
      key: 'used',
      header: 'Used',
      align: 'right',
      sortKey: 'used',
      sortFirst: 'desc',
      render: (promo) => promo.usageCount,
    },
    {
      key: 'max',
      header: 'Max total',
      align: 'right',
      sortKey: 'max',
      sortFirst: 'desc',
      render: (promo) => promo.maxUsage ?? '∞',
    },
    {
      key: 'maxUser',
      header: 'Max / user',
      align: 'right',
      sortKey: 'maxUser',
      sortFirst: 'desc',
      render: (promo) => promo.maxUsagePerUser ?? '∞',
    },
    {
      key: 'expires',
      header: 'Expires',
      sortKey: 'expires',
      sortFirst: 'desc',
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
      sortKey: 'status',
      render: (promo) => (
        <Badge tone={promo.isActive ? 'success' : 'neutral'}>
          {promo.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      sortKey: 'created',
      sortFirst: 'desc',
      render: (promo) => new Date(promo.createdAt).toLocaleString(),
    },
    actionsColumn((promo) => (
      <ActionMenu label={`Actions for promo code ${promo.code}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(promo)}>
          Edit
        </MenuItem>
        <MenuItem
          icon={promo.isActive ? <Power size={ICON_SIZE.menu} /> : <Check size={ICON_SIZE.menu} />}
          disabled={toggleMutation.isPending}
          onSelect={() => toggleMutation.mutate(promo)}
        >
          {promo.isActive ? 'Deactivate' : 'Activate'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 size={ICON_SIZE.menu} />}
          onSelect={() => setDeleting(promo)}
        >
          Delete
        </MenuItem>
      </ActionMenu>
    )),
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={rows ?? []}
        rowKey={(promo) => promo.id}
        empty="No promo codes yet — add the first one with “Add promo code”."
        sort={sort}
        onSortChange={onSortChange}
      />

      {editing && <PromoCodeFormModal promoCode={editing} onClose={() => setEditing(null)} />}

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
