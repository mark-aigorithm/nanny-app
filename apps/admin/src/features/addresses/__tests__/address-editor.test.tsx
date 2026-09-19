import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Address } from '@nanny-app/shared';

import { renderWithProviders } from '@admin/test/render';

/**
 * The address editor without a Google Maps key — the fallback every
 * environment without VITE_GOOGLE_MAPS_API_KEY gets: the structured parts
 * plus typed coordinates, validated with the shared schema, and saved as the
 * body PUT /admin/nannies/:id/address takes.
 */
vi.mock('@admin/lib/maps', () => ({ mapsApiKey: () => '', isMapsAvailable: () => false }));

import { AddressEditor } from '@admin/features/addresses/address-editor';

const EXISTING: Address = {
  id: 4,
  label: 'Home',
  formattedAddress: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
  governorate: 'Cairo',
  area: 'Maadi',
  street: '12 Road 9',
  building: null,
  floor: null,
  apartment: null,
  landmark: 'Behind the pharmacy',
  latitude: 29.9602,
  longitude: 31.2569,
  isDefault: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

describe('AddressEditor (no maps key)', () => {
  it('offers typed coordinates instead of a map, prefilled from the address', () => {
    renderWithProviders(<AddressEditor initial={EXISTING} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText('Latitude')).toHaveValue(29.9602);
    expect(screen.getByLabelText('Longitude')).toHaveValue(31.2569);
    // The Field's hint is part of the label text, hence the prefix match.
    expect(screen.getByLabelText(/^Landmark/)).toHaveValue('Behind the pharmacy');
    expect(screen.getByText(/no maps key/i)).toBeInTheDocument();
  });

  it('refuses to save without an address line or coordinates', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(<AddressEditor initial={null} onSave={onSave} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save address' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Search for or pin the address.')).toBeInTheDocument();
  });

  it('saves the parsed body — parts, landmark and numeric coordinates', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(<AddressEditor initial={EXISTING} onSave={onSave} onCancel={vi.fn()} />);

    await user.clear(screen.getByLabelText('Street'));
    await user.type(screen.getByLabelText('Street'), '7 Road 90');
    await user.clear(screen.getByLabelText('Latitude'));
    await user.type(screen.getByLabelText('Latitude'), '29.97');
    await user.click(screen.getByRole('button', { name: 'Save address' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      formattedAddress: EXISTING.formattedAddress,
      governorate: 'Cairo',
      street: '7 Road 90',
      landmark: 'Behind the pharmacy',
      latitude: 29.97,
      longitude: 31.2569,
    });
    expect('label' in (onSave.mock.calls[0]?.[0] as object)).toBe(false);
  });
});
