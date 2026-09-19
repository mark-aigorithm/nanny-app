import type { Address, AddressInput, UpdateAddressRequest } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';

export const ADDRESSES_KEY = 'addresses';

/**
 * The mother's address book, default first. Also read by a nanny for her one
 * (read-only) address. Every mutation below writes the server's answer into
 * this cache, so the booking picker and the Addresses screen never show a
 * stale default.
 */
export function useAddresses() {
  return useQuery({
    queryKey: [ADDRESSES_KEY],
    queryFn: () => unwrap<Address[]>(api.get('/addresses')),
  });
}

/** The entry the picker preselects: the default, else the first, else none. */
export function defaultAddressOf(addresses: readonly Address[] | undefined): Address | null {
  if (!addresses || addresses.length === 0) return null;
  return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

/** Default first, then oldest first — the order the server lists in. */
function sorted(list: Address[]): Address[] {
  return [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id - b.id);
}

/** Adds an address. The first one saved becomes the default automatically. */
export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation<Address, Error, AddressInput>({
    mutationFn: (input) => unwrap<Address>(api.post('/addresses', input)),
    onSuccess: (created) =>
      qc.setQueryData<Address[]>([ADDRESSES_KEY], (current = []) =>
        sorted([
          // A new default demotes the old one — mirror what the server did.
          ...current.map((a) => (created.isDefault ? { ...a, isDefault: false } : a)),
          created,
        ]),
      ),
  });
}

/** Patches one address; `isDefault: true` in the patch promotes it. */
export function useUpdateAddress() {
  const qc = useQueryClient();
  return useMutation<Address, Error, { id: number; patch: UpdateAddressRequest }>({
    mutationFn: ({ id, patch }) => unwrap<Address>(api.patch(`/addresses/${id}`, patch)),
    onSuccess: (updated) =>
      qc.setQueryData<Address[]>([ADDRESSES_KEY], (current = []) =>
        sorted(
          current.map((a) =>
            a.id === updated.id ? updated : updated.isDefault ? { ...a, isDefault: false } : a,
          ),
        ),
      ),
  });
}

/** Makes an address the default; the server answers with the whole list. */
export function useSetDefaultAddress() {
  const qc = useQueryClient();
  return useMutation<Address[], Error, number>({
    mutationFn: (id) => unwrap<Address[]>(api.post(`/addresses/${id}/default`)),
    onSuccess: (list) => qc.setQueryData([ADDRESSES_KEY], list),
  });
}

/** Removes an address; the server answers with what remains (default promoted if needed). */
export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation<Address[], Error, number>({
    mutationFn: (id) => unwrap<Address[]>(api.delete(`/addresses/${id}`)),
    onSuccess: (list) => qc.setQueryData([ADDRESSES_KEY], list),
  });
}
