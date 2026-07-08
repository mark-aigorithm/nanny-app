import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { PromoCode } from '@nanny-app/shared';

import { Badge, Button, Card } from '@admin/components/ui';
import { deletePromoCode, updatePromoCode } from '@admin/lib/api';

type PromoCodeTableProps = {
  promoCodes: PromoCode[];
};

export function PromoCodeTable({ promoCodes }: PromoCodeTableProps) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['promo-codes'] });

  const toggleMutation = useMutation({
    mutationFn: (promo: PromoCode) =>
      updatePromoCode(promo.id, { isActive: !promo.isActive }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePromoCode,
    onSuccess: invalidate,
  });

  if (promoCodes.length === 0) {
    return (
      <Card>
        <p className="empty-state">No promo codes yet — create the first one above.</p>
      </Card>
    );
  }

  return (
    <Card flush>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Used</th>
              <th>Max total</th>
              <th>Max / user</th>
              <th>Expires</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {promoCodes.map((promo) => (
              <tr key={promo.id}>
                <td>
                  <code>{promo.code}</code>
                </td>
                <td>
                  {promo.discountType === 'PERCENTAGE'
                    ? `${promo.value}%`
                    : `${promo.value} EGP`}
                </td>
                <td>{promo.usageCount}</td>
                <td>{promo.maxUsage ?? '∞'}</td>
                <td>{promo.maxUsagePerUser ?? '∞'}</td>
                <td>
                  {promo.expiresAt ? new Date(promo.expiresAt).toLocaleString() : '—'}
                </td>
                <td>
                  <Badge tone={promo.isActive ? 'success' : 'neutral'}>
                    {promo.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td>
                  <div className="row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate(promo)}
                      disabled={toggleMutation.isPending}
                    >
                      {promo.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Delete promo code ${promo.code}?`)) {
                          deleteMutation.mutate(promo.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
