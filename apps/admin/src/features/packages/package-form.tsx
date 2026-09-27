import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CreatePackageSchema, UpdatePackageSchema, type Package } from '@nanny-app/shared';

import { Field, FormModal, Input, Select, useToast } from '@admin/components/ui';
import { createPackage, updatePackage } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';

type PackageFormModalProps = {
  /** The package to edit; omit to add a new one. */
  pkg?: Package;
  onClose: () => void;
};

/** An ISO datetime (or null) → a `<input type="date">` value (YYYY-MM-DD). */
function isoToDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/** A `<input type="date">` value (YYYY-MM-DD) → an ISO 8601 datetime, or undefined when blank. */
function dateInputToIso(value: string): string | undefined {
  return value ? `${value}T00:00:00.000Z` : undefined;
}

/** A number input's value → a number, or undefined when blank (so a schema default applies). */
function optionalNumber(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value);
}

/** Add a package, or edit one — the Packages page's one dialog for both. */
export function PackageFormModal({ pkg, onClose }: PackageFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(pkg?.name ?? '');
  const [description, setDescription] = useState(pkg?.description ?? '');
  const [hours, setHours] = useState(pkg ? String(pkg.hours) : '');
  const [price, setPrice] = useState(pkg ? String(pkg.price) : '');
  const [validityDays, setValidityDays] = useState(pkg ? String(pkg.validityDays) : '');
  const [maxSkills, setMaxSkills] = useState(pkg ? String(pkg.maxSkills) : '');
  const [expiresAt, setExpiresAt] = useState(isoToDateInput(pkg?.expiresAt));
  const [isActive, setIsActive] = useState(pkg?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<Package>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['packages'] });
      toast.success(pkg ? 'Package updated' : 'Package added', saved.name);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function submit() {
    setFormError(null);
    const fields = {
      name: name.trim(),
      description: description.trim() || undefined,
      hours: Number(hours),
      price: Number(price),
      // Left blank means "use the schema default" on create and "leave as is" on
      // edit — Number('') would be 0 and fail validation instead.
      validityDays: optionalNumber(validityDays),
      maxSkills: optionalNumber(maxSkills),
      isActive,
    };
    if (pkg) {
      // A cleared date removes a previously-set expiry.
      const parsed = UpdatePackageSchema.safeParse({
        ...fields,
        expiresAt: dateInputToIso(expiresAt) ?? null,
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => updatePackage(pkg.id, parsed.data));
    } else {
      const parsed = CreatePackageSchema.safeParse({
        ...fields,
        expiresAt: dateInputToIso(expiresAt),
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => createPackage(parsed.data));
    }
  }

  return (
    <FormModal
      title={pkg ? 'Edit package' : 'Add package'}
      submitLabel={pkg ? 'Save changes' : 'Add package'}
      busy={saveMutation.isPending}
      submitDisabled={name.trim() === '' || hours.trim() === '' || price.trim() === ''}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label="Name">
          <Input
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="Starter Pack"
            required
          />
        </Field>
        <Field label="Description" hint="Optional — shown to admins only.">
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="50 hours of care at a discounted rate"
          />
        </Field>
        <Field label="Hours">
          <Input
            type="number"
            min={1}
            step={1}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            placeholder="50"
            required
          />
        </Field>
        <Field label="Price (EGP)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="2000"
            required
          />
        </Field>
        <Field
          label="Validity (days)"
          hint={
            pkg
              ? 'How long a parent’s hours stay usable after they buy this package.'
              : 'How long a parent’s hours stay usable after purchase. Defaults to 30.'
          }
        >
          <Input
            type="number"
            min={1}
            step={1}
            value={validityDays}
            onChange={(event) => setValidityDays(event.target.value)}
            placeholder="90"
          />
        </Field>
        <Field
          label="Free skills"
          hint={
            pkg
              ? 'Skill add-ons covered free on a booking paid with this package.'
              : 'Skill add-ons covered free on a booking paid with this package. Defaults to 0.'
          }
        >
          <Input
            type="number"
            min={0}
            step={1}
            value={maxSkills}
            onChange={(event) => setMaxSkills(event.target.value)}
            placeholder="2"
          />
        </Field>
        <Field
          label="Expires at"
          hint="Optional — the date this package stops being offered. Blank means it never expires."
        >
          <Input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </Field>
        <Field label="Status" hint="Inactive packages aren’t offered to parents.">
          <Select
            value={isActive ? 'active' : 'inactive'}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            onChange={(value) => setIsActive(value === 'active')}
          />
        </Field>
      </div>
    </FormModal>
  );
}
