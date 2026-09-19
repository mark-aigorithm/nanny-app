import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { formatAddressArea, type AdminNannyDetail } from '@nanny-app/shared';

import { Button, Card, DescriptionList, useToast, type DescriptionItem } from '@admin/components/ui';
import { AddressEditor } from '@admin/features/addresses/address-editor';
import { updateNannyAddress } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

const DASH = '—';

type NannyAddressCardProps = {
  nanny: AdminNannyDetail;
  canManage: boolean;
};

/** "Building B7 · Floor 3 · Apt 12" — only the parts on file. */
function doorLine(address: NonNullable<AdminNannyDetail['address']>): string | null {
  const parts = [
    address.building ? `Building ${address.building}` : null,
    address.floor ? `Floor ${address.floor}` : null,
    address.apartment ? `Apt ${address.apartment}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function addressItems(address: AdminNannyDetail['address']): DescriptionItem[] {
  if (!address) {
    return [{ label: 'Address', value: 'No address on file — she registered without one.', wide: true }];
  }
  return [
    { label: 'Address', value: address.formattedAddress, wide: true },
    { label: 'Area', value: formatAddressArea(address) },
    { label: 'Door', value: doorLine(address) ?? DASH },
    { label: 'Landmark', value: address.landmark ?? DASH, wide: true },
    {
      label: 'Pin',
      value: (
        <code>
          {address.latitude}, {address.longitude}
        </code>
      ),
    },
  ];
}

/**
 * A nanny's home base on her detail page — what proximity matching reads and
 * the line parents see. Read-only in the app after registration, so this card
 * is the one place it changes.
 */
export function NannyAddressCard({ nanny, canManage }: NannyAddressCardProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateNannyAddress>[1]) =>
      updateNannyAddress(nanny.id, input),
    onSuccess: (address) => {
      queryClient.setQueryData<AdminNannyDetail>(['nanny', String(nanny.id)], (current) =>
        current ? { ...current, address, location: address.formattedAddress } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['nanny', String(nanny.id)] });
      void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });
      toast.success('Address updated', `${nanny.name}’s address was saved.`);
      setEditing(false);
    },
    onError: (err) => toast.error('Couldn’t save address', apiErrorMessage(err)),
  });

  return (
    <Card title="Address">
      {editing ? (
        <AddressEditor
          initial={nanny.address}
          onSave={(input) => saveMutation.mutate(input)}
          onCancel={() => setEditing(false)}
          saving={saveMutation.isPending}
          error={saveMutation.error != null ? apiErrorMessage(saveMutation.error) : null}
        />
      ) : (
        <div className="detail-skills">
          <DescriptionList items={addressItems(nanny.address)} />
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {nanny.address ? 'Edit address' : 'Add address'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
