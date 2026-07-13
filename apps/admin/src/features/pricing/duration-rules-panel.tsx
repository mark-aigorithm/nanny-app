import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { CreateDurationRuleSchema, type DurationRule, type UpdateDurationRuleInput } from '@nanny-app/shared';

import { Badge, Button, Card, Feedback, Field, Select, TableSkeleton, type SelectOption } from '@admin/components/ui';
import {
  createDurationRule,
  deleteDurationRule,
  fetchDurationRules,
  updateDurationRule,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type Mode = 'discount' | 'multiplier';

const MODE_OPTIONS: SelectOption[] = [
  { value: 'discount', label: 'Discount %' },
  { value: 'multiplier', label: 'Multiplier' },
];

/** Percent discount a multiplier represents, e.g. 0.9 → "10% off". */
function discountLabel(multiplier: number): string {
  const pct = Math.round((1 - multiplier) * 1000) / 10;
  if (pct > 0) return `${pct}% off`;
  if (pct < 0) return `${Math.abs(pct)}% surcharge`;
  return 'no change';
}

function CreateRuleForm() {
  const queryClient = useQueryClient();
  const [minHours, setMinHours] = useState('3');
  const [mode, setMode] = useState<Mode>('discount');
  const [amount, setAmount] = useState('10');
  const [label, setLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createDurationRule,
    onSuccess: () => {
      setAmount(mode === 'discount' ? '10' : '0.9');
      setLabel('');
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['duration-rules'] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const raw = Number(amount);
    const multiplier =
      mode === 'discount' ? Math.round((1 - raw / 100) * 10000) / 10000 : raw;
    const parsed = CreateDurationRuleSchema.safeParse({
      minHours: Number(minHours),
      multiplier,
      label: label.trim() || undefined,
      isActive: true,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <Card title="Add a duration tier">
      <p className="panel-lead">
        Reward longer bookings. When a booking reaches the minimum hours, its subtotal is
        scaled — a 10% discount on a 3-hour booking, for example. The highest matching tier
        wins.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Applies from (hours)" hint="Bookings at or above this length.">
            <input
              type="number"
              min="1"
              max="24"
              value={minHours}
              onChange={(e) => setMinHours(e.target.value)}
              required
            />
          </Field>
          <Field label="Adjustment" hint="Discount is easiest; use multiplier for surcharges.">
            <Select
              value={mode}
              options={MODE_OPTIONS}
              onChange={(next) => setMode(next as Mode)}
            />
          </Field>
          <Field
            label={mode === 'discount' ? 'Discount (%)' : 'Multiplier'}
            hint={mode === 'discount' ? 'e.g. 10 = 10% off' : 'e.g. 0.9 = 10% off, 1.1 = surcharge'}
          >
            <input
              type="number"
              min="0"
              step={mode === 'discount' ? '1' : '0.05'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Label" hint="Optional — shown for your reference.">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Half-day rate"
            />
          </Field>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Adding…' : 'Add tier'}
        </Button>
      </form>
    </Card>
  );
}

function RuleRow({ rule }: { rule: DurationRule }) {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['duration-rules'] });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateDurationRuleInput) => updateDurationRule(rule.id, input),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({ mutationFn: deleteDurationRule, onSuccess: invalidate });

  return (
    <tr>
      <td className="cell-nowrap">
        <strong>≥ {rule.minHours}h</strong>
      </td>
      <td>{rule.label ?? '—'}</td>
      <td>
        <code>×{rule.multiplier}</code>
      </td>
      <td>
        <Badge tone={rule.multiplier < 1 ? 'success' : 'neutral'}>
          {discountLabel(rule.multiplier)}
        </Badge>
      </td>
      <td>
        <Badge tone={rule.isActive ? 'success' : 'neutral'}>
          {rule.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </td>
      <td>
        <div className="row-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateMutation.mutate({ isActive: !rule.isActive })}
            disabled={updateMutation.isPending}
          >
            {rule.isActive ? 'Disable' : 'Enable'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (window.confirm(`Delete the ≥ ${rule.minHours}h tier?`)) {
                deleteMutation.mutate(rule.id);
              }
            }}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function DurationRulesPanel() {
  const { data: rules, isLoading, error } = useQuery({
    queryKey: ['duration-rules'],
    queryFn: fetchDurationRules,
  });

  return (
    <>
      <CreateRuleForm />
      {isLoading && <TableSkeleton rows={4} columns={6} />}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {rules && rules.length === 0 && (
        <Card>
          <p className="empty-state">
            No duration tiers yet — longer bookings are priced at the standard rate.
          </p>
        </Card>
      )}
      {rules && rules.length > 0 && (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Applies from</th>
                  <th>Label</th>
                  <th>Multiplier</th>
                  <th>Effect</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
