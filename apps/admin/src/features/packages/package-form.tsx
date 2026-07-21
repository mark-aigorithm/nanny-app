import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { CreatePackageSchema } from '@nanny-app/shared';

import { Button, Card, Feedback, Field, Select } from '@admin/components/ui';
import { createPackage } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** A bare `<input type="date">` value (YYYY-MM-DD) → an ISO 8601 datetime. */
function dateInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  return `${value}T00:00:00.000Z`;
}

export function PackageForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [price, setPrice] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [maxSkills, setMaxSkills] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createPackage,
    onSuccess: () => {
      setName('');
      setDescription('');
      setHours('');
      setPrice('');
      setValidityDays('');
      setMaxSkills('');
      setExpiresAt('');
      setIsActive(true);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreatePackageSchema.safeParse({
      name: name.trim(),
      description: description.trim() || undefined,
      hours: Number(hours),
      price: Number(price),
      // Left blank means "use the schema default" — Number('') would be 0 and
      // fail validation rather than falling back.
      validityDays: validityDays ? Number(validityDays) : undefined,
      maxSkills: maxSkills ? Number(maxSkills) : undefined,
      isActive,
      expiresAt: dateInputToIso(expiresAt),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    createMutation.mutate(parsed.data);
  }

  return (
    <Card title="Create package">
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Starter Pack"
              required
            />
          </Field>
          <Field label="Description" hint="Optional — shown to admins only.">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="50 hours of care at a discounted rate"
            />
          </Field>
          <Field label="Hours">
            <input
              type="number"
              min={1}
              step={1}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="50"
              required
            />
          </Field>
          <Field label="Price (EGP)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="2000"
              required
            />
          </Field>
          <Field
            label="Validity (days)"
            hint="How long a parent's hours stay usable after purchase. Defaults to 30."
          >
            <input
              type="number"
              min={1}
              step={1}
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              placeholder="90"
            />
          </Field>
          <Field
            label="Free skills"
            hint="Skill add-ons covered free on a booking paid with this package. Defaults to 0."
          >
            <input
              type="number"
              min={0}
              step={1}
              value={maxSkills}
              onChange={(e) => setMaxSkills(e.target.value)}
              placeholder="2"
            />
          </Field>
          <Field label="Expires at" hint="Optional — the date this package stops being offered.">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
          <div className="field">
            <span className="field-label">Status</span>
            <Select
              value={isActive ? 'active' : 'inactive'}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              onChange={(value) => setIsActive(value === 'active')}
            />
            <span className="field-hint">Inactive packages aren't offered to parents.</span>
          </div>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creating…' : 'Create package'}
        </Button>
      </form>
    </Card>
  );
}
