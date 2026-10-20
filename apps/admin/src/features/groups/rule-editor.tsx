import type { DynamicGroupRule, DynamicGroupRuleField, DynamicGroupRules } from '@nanny-app/shared';
import {
  DYNAMIC_RULE_DAYS_MAX,
  DynamicGroupRuleSchema,
  DynamicGroupRulesSchema,
  describeDynamicRules,
} from '@nanny-app/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId } from 'react';

import {
  Button,
  ICON_SIZE,
  Input,
  Menu,
  MenuItem,
  Plus,
  Select,
  Trash2,
  type SelectOption,
} from '@admin/components/ui';
import { previewGroupRules } from '@admin/lib/api';
import { useDebouncedValue } from '@admin/lib/use-debounced-value';

type RuleField = DynamicGroupRuleField;

export const RULE_FIELD_LABEL: Record<RuleField, string> = {
  lastAppOpenAt: 'Last app open',
  lastLoginAt: 'Last sign-in',
  lastBookingAt: 'Last completed booking',
  createdAt: 'Signed up',
  completedBookings: 'Completed bookings',
  totalSpent: 'Total spent',
};

/** The order fields are offered in "Add rule": the re-engagement ones first. */
const FIELD_ORDER: readonly RuleField[] = [
  'lastAppOpenAt',
  'lastLoginAt',
  'lastBookingAt',
  'createdAt',
  'completedBookings',
  'totalSpent',
];

/** A sensible first value for each field, so a new row is already a valid rule. */
const DEFAULT_RULE: Record<RuleField, DynamicGroupRule> = {
  lastAppOpenAt: { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
  lastLoginAt: { field: 'lastLoginAt', op: 'notWithinDays', days: 30 },
  lastBookingAt: { field: 'lastBookingAt', op: 'notWithinDays', days: 60 },
  createdAt: { field: 'createdAt', op: 'withinDays', days: 30 },
  completedBookings: { field: 'completedBookings', op: 'gte', value: 1 },
  totalSpent: { field: 'totalSpent', op: 'gte', value: 1000 },
};

function opOptions(field: RuleField): SelectOption[] {
  if (field === 'completedBookings' || field === 'totalSpent') {
    return [
      { value: 'gte', label: 'at least' },
      { value: 'lte', label: 'at most' },
    ];
  }
  if (field === 'createdAt') {
    return [
      { value: 'withinDays', label: 'within the last' },
      { value: 'notWithinDays', label: 'more than' },
    ];
  }
  return [
    { value: 'withinDays', label: 'within the last' },
    { value: 'notWithinDays', label: 'not in the last' },
  ];
}

/** The word after the amount, so each row reads as a sentence. */
function unitOf(rule: DynamicGroupRule): string {
  if (rule.field === 'createdAt') return rule.op === 'notWithinDays' ? 'days ago' : 'days';
  if ('days' in rule) return rule.op === 'notWithinDays' ? 'days (or never)' : 'days';
  if (rule.field === 'totalSpent') return 'EGP';
  return rule.value === 1 ? 'booking' : 'bookings';
}

function amountLabel(rule: DynamicGroupRule): string {
  const field = RULE_FIELD_LABEL[rule.field];
  if ('days' in rule) return `${field}: days`;
  return `${field}: ${rule.field === 'totalSpent' ? 'amount in EGP' : 'number of bookings'}`;
}

function withOp(rule: DynamicGroupRule, op: string): DynamicGroupRule {
  return 'days' in rule
    ? { ...rule, op: op === 'withinDays' ? 'withinDays' : 'notWithinDays' }
    : { ...rule, op: op === 'lte' ? 'lte' : 'gte' };
}

/** An emptied box is NaN: it shows as empty and fails validation, rather than reading as 0. */
function withAmount(rule: DynamicGroupRule, raw: string): DynamicGroupRule {
  const n = raw.trim() === '' ? Number.NaN : Number(raw);
  return 'days' in rule ? { ...rule, days: n } : { ...rule, value: n };
}

function ruleError(rule: DynamicGroupRule): string | undefined {
  if (DynamicGroupRuleSchema.safeParse(rule).success) return undefined;
  if ('days' in rule) return `Enter whole days from 1 to ${DYNAMIC_RULE_DAYS_MAX.toLocaleString('en-US')}.`;
  return rule.field === 'completedBookings' ? 'Enter a whole number, 0 or more.' : 'Enter an amount, 0 or more.';
}

type RuleEditorProps = {
  value: DynamicGroupRules;
  onChange: (next: DynamicGroupRules) => void;
  /** Locks every control, e.g. while the rules are being saved. */
  disabled?: boolean;
};

/**
 * A dynamic group's rules, AND-ed: one row per field (field · condition ·
 * amount · remove), fields added from a menu that only offers unused ones.
 * Under them, the rules in words and how many mothers they match right now.
 */
export function RuleEditor({ value, onChange, disabled = false }: RuleEditorProps) {
  const baseId = useId();
  const valid = DynamicGroupRulesSchema.safeParse(value).success;
  const debounced = useDebouncedValue(value, 400);
  const count = useQuery({
    queryKey: ['group-rules-preview', debounced],
    queryFn: () => previewGroupRules(debounced),
    enabled: DynamicGroupRulesSchema.safeParse(debounced).success,
    placeholderData: keepPreviousData,
  });

  const used = new Set(value.map((r) => r.field));
  const unused = FIELD_ORDER.filter((field) => !used.has(field));
  const replace = (index: number, rule: DynamicGroupRule) =>
    onChange(value.map((r, i) => (i === index ? rule : r)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  // The summary describes the rows that are valid, so a half-typed amount never reads "NaN".
  const describable = value.filter((r) => DynamicGroupRuleSchema.safeParse(r).success);
  const settled = debounced === value && !count.isPlaceholderData;
  const countText = !valid
    ? 'Fix the rules above to see how many mothers match.'
    : count.isError
      ? 'We couldn’t count the matching mothers.'
      : !count.data || !settled
        ? 'Counting mothers…'
        : `${count.data.count.toLocaleString('en-US')} ${count.data.count === 1 ? 'mother matches' : 'mothers match'} right now`;

  return (
    <div className="rule-editor">
      {value.length === 0 ? (
        <p className="field-hint">No rules yet, so this group is every active mother. Add a rule to narrow it.</p>
      ) : (
        <ul className="rule-list" aria-label="Rules">
          {value.map((rule, index) => {
            const label = RULE_FIELD_LABEL[rule.field];
            const error = ruleError(rule);
            const errorId = `${baseId}-${rule.field}-error`;
            const amount = 'days' in rule ? rule.days : rule.value;
            return (
              <li key={rule.field} className="rule-row">
                <span className="rule-row-field">{label}</span>
                <Select
                  compact
                  value={rule.op}
                  options={opOptions(rule.field)}
                  onChange={(op) => replace(index, withOp(rule, op))}
                  aria-label={`${label}: condition`}
                  disabled={disabled}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={'days' in rule ? 1 : 0}
                  max={'days' in rule ? DYNAMIC_RULE_DAYS_MAX : undefined}
                  step={rule.field === 'totalSpent' ? 'any' : 1}
                  className="rule-row-amount"
                  value={Number.isNaN(amount) ? '' : String(amount)}
                  onChange={(e) => replace(index, withAmount(rule, e.target.value))}
                  aria-label={amountLabel(rule)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  disabled={disabled}
                />
                <span className="rule-row-unit">{unitOf(rule)}</span>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rule-row-remove"
                    aria-label={`Remove rule: ${label}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={ICON_SIZE.inline} aria-hidden />
                  </Button>
                )}
                {error && (
                  <span className="field-error rule-row-error" id={errorId}>
                    {error}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!disabled && unused.length > 0 && (
        <Menu
          trigger={
            <>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add rule
            </>
          }
          triggerLabel="Add rule"
          triggerClassName="btn btn--ghost btn--sm"
          placement="bottom-start"
        >
          {unused.map((field) => (
            <MenuItem key={field} onSelect={() => onChange([...value, DEFAULT_RULE[field]])}>
              {RULE_FIELD_LABEL[field]}
            </MenuItem>
          ))}
        </Menu>
      )}
      <div className="rule-summary">
        <span className="rule-summary-label">Matches</span>
        <p>{describeDynamicRules(describable)}</p>
      </div>
      <p className="rule-count" role="status">
        {countText}
      </p>
    </div>
  );
}
