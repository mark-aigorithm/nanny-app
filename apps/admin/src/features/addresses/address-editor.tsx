import { useState } from 'react';

import {
  AdminUpsertNannyAddressSchema,
  parseAddressComponents,
  type Address,
  type AdminUpsertNannyAddressInput,
  type ParsedAddressParts,
} from '@nanny-app/shared';

import { Button, Feedback, Field } from '@admin/components/ui';
import { isMapsAvailable } from '@admin/lib/maps';

import { AddressMap, type PinPick } from './address-map';

type AddressEditorProps = {
  /** The current address, or null for an account that registered without one. */
  initial: Address | null;
  onSave: (input: AdminUpsertNannyAddressInput) => void;
  onCancel: () => void;
  saving?: boolean;
  error?: string | null;
};

type Fields = {
  formattedAddress: string;
  governorate: string;
  area: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  landmark: string;
  latitude: string;
  longitude: string;
};

function fieldsFrom(initial: Address | null): Fields {
  return {
    formattedAddress: initial?.formattedAddress ?? '',
    governorate: initial?.governorate ?? '',
    area: initial?.area ?? '',
    street: initial?.street ?? '',
    building: initial?.building ?? '',
    floor: initial?.floor ?? '',
    apartment: initial?.apartment ?? '',
    landmark: initial?.landmark ?? '',
    latitude: initial ? String(initial.latitude) : '',
    longitude: initial ? String(initial.longitude) : '',
  };
}

/** Google's parts land only where it knew something — never blanking a typed street. */
function mergeParts(fields: Fields, parts: ParsedAddressParts): Fields {
  return {
    ...fields,
    governorate: parts.governorate ?? fields.governorate,
    area: parts.area ?? fields.area,
    street: parts.street ?? fields.street,
  };
}

/** "" → undefined so an empty numeric field fails the schema as "missing", not as NaN. */
function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Edits a nanny's single address — the only way it changes after
 * registration. With a Maps key: Places search and a draggable pin, which
 * pre-fill the line and the parts Google knows. Without one: the same fields
 * plus typed coordinates. Building, floor, apartment and the landmark are
 * always typed; Google never knows them.
 */
export function AddressEditor({ initial, onSave, onCancel, saving = false, error = null }: AddressEditorProps) {
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(initial));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const mapsAvailable = isMapsAvailable();

  const set = (key: keyof Fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  function handlePick(pick: PinPick) {
    setFieldErrors({});
    setFields((current) => ({
      ...mergeParts(current, parseAddressComponents(pick.components)),
      formattedAddress: pick.formattedAddress ?? current.formattedAddress,
      latitude: String(pick.latitude),
      longitude: String(pick.longitude),
    }));
  }

  function handleSave() {
    const candidate = {
      formattedAddress: fields.formattedAddress,
      governorate: fields.governorate,
      area: fields.area,
      street: fields.street,
      building: fields.building,
      floor: fields.floor,
      apartment: fields.apartment,
      landmark: fields.landmark,
      latitude: numberOrUndefined(fields.latitude),
      longitude: numberOrUndefined(fields.longitude),
    };
    const parsed = AdminUpsertNannyAddressSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      if (next['latitude'] || next['longitude']) {
        next['formattedAddress'] = next['formattedAddress'] ?? 'Search for or pin the address.';
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    onSave(parsed.data);
  }

  const pin =
    numberOrUndefined(fields.latitude) !== undefined && numberOrUndefined(fields.longitude) !== undefined
      ? { latitude: Number(fields.latitude), longitude: Number(fields.longitude) }
      : null;

  return (
    <div className="profile-editor address-editor">
      <div className="form-section-title">Where</div>
      {mapsAvailable ? (
        <AddressMap pin={pin} onPick={handlePick} />
      ) : (
        <p className="field-hint">
          No maps key is configured (VITE_GOOGLE_MAPS_API_KEY), so the pin is typed in as
          coordinates below.
        </p>
      )}
      <Field label="Address line" hint="The one-line address parents and the nanny see.">
        <input
          value={fields.formattedAddress}
          onChange={(e) => set('formattedAddress')(e.target.value)}
          placeholder="12 Rd 9, Maadi, Cairo Governorate, Egypt"
        />
      </Field>
      {fieldErrors['formattedAddress'] && (
        <Feedback tone="error">{fieldErrors['formattedAddress']}</Feedback>
      )}
      {!mapsAvailable && (
        <div className="form-grid">
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              value={fields.latitude}
              onChange={(e) => set('latitude')(e.target.value)}
              placeholder="29.9602"
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="any"
              value={fields.longitude}
              onChange={(e) => set('longitude')(e.target.value)}
              placeholder="31.2569"
            />
          </Field>
        </div>
      )}

      <div className="form-section-title">Details</div>
      <div className="form-grid">
        <Field label="Governorate">
          <input value={fields.governorate} onChange={(e) => set('governorate')(e.target.value)} placeholder="Cairo" />
        </Field>
        <Field label="Area">
          <input value={fields.area} onChange={(e) => set('area')(e.target.value)} placeholder="Maadi" />
        </Field>
        <Field label="Street">
          <input value={fields.street} onChange={(e) => set('street')(e.target.value)} placeholder="12 Road 9" />
        </Field>
        <Field label="Building">
          <input value={fields.building} onChange={(e) => set('building')(e.target.value)} />
        </Field>
        <Field label="Floor">
          <input value={fields.floor} onChange={(e) => set('floor')(e.target.value)} />
        </Field>
        <Field label="Apartment">
          <input value={fields.apartment} onChange={(e) => set('apartment')(e.target.value)} />
        </Field>
      </div>
      <Field label="Landmark" hint="How to find the door — the line the nanny reads on the way.">
        <textarea
          className="input"
          rows={2}
          value={fields.landmark}
          onChange={(e) => set('landmark')(e.target.value)}
          placeholder="Behind Seoudi Market, gate 2, ring bell 3"
        />
      </Field>

      {error && <Feedback tone="error">{error}</Feedback>}

      <div className="row-actions">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save address'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
