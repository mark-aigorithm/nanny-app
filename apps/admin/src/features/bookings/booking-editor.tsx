import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatChildAge } from '@nanny-app/shared';
import type {
  AdminBookingDetail,
  AdminBookingEditContext,
  AdminEditBookingInput,
  AdminEditPreviewResponse,
  AdminEditWarning,
  BookingChild,
  PublicSkill,
} from '@nanny-app/shared';

import {
  Button,
  Card,
  ConfirmDialog,
  Feedback,
  Field,
  Skeleton,
  TriangleAlert,
  useToast,
} from '@admin/components/ui';
import {
  applyBookingEdit,
  fetchBookingEditContext,
  previewBookingEdit,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatEgp, fromDateTimeLocalInput, toDateTimeLocalInput } from '@admin/lib/format';
import { RefundModal } from './refund-modal';

const MAX_CHILD_AGE = 17;

type EditorForm = {
  startTime: string; // datetime-local value
  endTime: string;
  children: BookingChild[];
  skillIds: number[];
  promoCode: string;
  usePackageHours: boolean;
  carePointsHours: number;
};

function skillFeeLabel(skill: PublicSkill): string {
  return skill.feeType === 'PERCENTAGE' ? `+${skill.feeValue}%` : `+${formatEgp(skill.feeValue)}/h`;
}

/** Turn the current form into the API's edit input, resolving promo intent. */
function toEditInput(form: EditorForm, originalPromo: string | null): AdminEditBookingInput {
  const trimmed = form.promoCode.trim();
  const original = originalPromo ?? '';
  let promo: string | null | undefined;
  if (trimmed === original) promo = undefined; // unchanged (both empty counts as unchanged)
  else if (trimmed === '') promo = null; // cleared
  else promo = trimmed; // new / changed

  return {
    startTime: fromDateTimeLocalInput(form.startTime),
    endTime: fromDateTimeLocalInput(form.endTime),
    children: form.children,
    skillIds: form.skillIds,
    usePackageHours: form.usePackageHours,
    carePointsHours: form.carePointsHours,
    ...(promo !== undefined ? { promoCode: promo } : {}),
  };
}

function seedForm(booking: AdminBookingDetail): EditorForm {
  return {
    startTime: toDateTimeLocalInput(booking.startTime),
    endTime: toDateTimeLocalInput(booking.endTime),
    children:
      booking.children.length > 0
        ? booking.children.map((c) => ({ ...c }))
        : Array.from({ length: Math.max(1, booking.childrenCount) }, () => ({
            name: null,
            ageYears: 0,
            allergies: null,
          })),
    skillIds: booking.skillAddOns.map((s) => s.id),
    promoCode: booking.promoCode ?? '',
    usePackageHours: booking.packageHoursApplied > 0,
    carePointsHours: Math.round(booking.rewardCreditHours) || 0,
  };
}

export function BookingEditor({
  booking,
  onDone,
}: {
  booking: AdminBookingDetail;
  /** Called once the edit is committed (or its refund follow-up closes) so the
   * page can swap back to the read-only view. */
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: context, isLoading: contextLoading, error: contextError } = useQuery({
    queryKey: ['booking-edit-context', booking.id],
    queryFn: () => fetchBookingEditContext(booking.id),
  });

  const [form, setForm] = useState<EditorForm>(() => seedForm(booking));
  const [ackWarnings, setAckWarnings] = useState(false);
  const [preview, setPreview] = useState<AdminEditPreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [refundFor, setRefundFor] = useState<number | null>(null);
  const [confirmBalanceDue, setConfirmBalanceDue] = useState(false);

  // Debounced live preview whenever the form changes.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewing(true);
    debounceRef.current = setTimeout(() => {
      previewBookingEdit(booking.id, toEditInput(form, booking.promoCode))
        .then((res) => setPreview(res))
        .catch((err) => toast.error('Couldn’t price this edit', apiErrorMessage(err)))
        .finally(() => setPreviewing(false));
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const blocking = preview?.warnings.filter((w) => w.severity === 'block') ?? [];
  const softs = preview?.warnings.filter((w) => w.severity === 'warn') ?? [];

  const commitMutation = useMutation({
    mutationFn: () =>
      applyBookingEdit(booking.id, {
        ...toEditInput(form, booking.promoCode),
        revision: preview!.revision,
        acknowledgeSoftWarnings: ackWarnings,
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(['booking', String(booking.id)], res.booking);
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      if (res.settlement.refundableAmount > 0) {
        // Stay mounted for the refund follow-up; onDone fires when it closes.
        setRefundFor(res.settlement.refundableAmount);
      } else if (res.settlement.balanceDueAmount > 0) {
        toast.success('Booking updated', `The mother was asked to pay ${formatEgp(res.settlement.balanceDueAmount)}.`);
        onDone?.();
      } else {
        toast.success('Booking updated', 'The new details are saved.');
        onDone?.();
      }
    },
    onError: (err) => toast.error('Couldn’t save the edit', apiErrorMessage(err)),
  });

  function handleSave() {
    if (!preview) return;
    if (preview.balanceDueAmount > 0 && preview.amountPaid > 0) {
      setConfirmBalanceDue(true);
      return;
    }
    commitMutation.mutate();
  }

  const canSave =
    preview != null &&
    blocking.length === 0 &&
    (softs.length === 0 || ackWarnings) &&
    !previewing &&
    !commitMutation.isPending;

  if (contextError) {
    return <Feedback tone="error">{apiErrorMessage(contextError)}</Feedback>;
  }

  return (
    <>
      <div className="settings-layout">
        <div className="settings-main">
          {contextLoading || !context ? (
            <EditorSkeleton />
          ) : (
            <EditorForm form={form} setForm={setForm} context={context} />
          )}
        </div>

        <aside className="settings-rail">
          <PreviewRail
            preview={preview}
            previewing={previewing}
            blocking={blocking}
            softs={softs}
            ackWarnings={ackWarnings}
            setAckWarnings={setAckWarnings}
            canSave={canSave}
            saving={commitMutation.isPending}
            onSave={handleSave}
            onReset={() => {
              setForm(seedForm(booking));
              setAckWarnings(false);
            }}
          />
        </aside>
      </div>

      {confirmBalanceDue && preview && (
        <ConfirmDialog
          title="Charge the difference?"
          message={`This raises the total to ${formatEgp(preview.new.totalAmount)}. The mother will be asked to pay the difference of ${formatEgp(preview.balanceDueAmount)} in the app. Continue?`}
          confirmLabel="Save & request payment"
          busy={commitMutation.isPending}
          onConfirm={() => {
            setConfirmBalanceDue(false);
            commitMutation.mutate();
          }}
          onCancel={() => setConfirmBalanceDue(false)}
        />
      )}

      {refundFor != null && (
        <RefundModal
          bookingId={booking.id}
          refundableAmount={refundFor}
          onClose={() => {
            setRefundFor(null);
            onDone?.();
          }}
          onRefunded={(result) => {
            queryClient.setQueryData(['booking', String(booking.id)], result.booking);
            void queryClient.invalidateQueries({ queryKey: ['bookings'] });
            setRefundFor(null);
            toast.success(
              'Refund issued',
              result.method === 'PAYMOB'
                ? `${formatEgp(result.refundedAmount ?? 0)} was refunded to the card.`
                : `${result.grantedPoints ?? 0} Care Points were granted.`,
            );
            onDone?.();
          }}
        />
      )}
    </>
  );
}

function EditorForm({
  form,
  setForm,
  context,
}: {
  form: EditorForm;
  setForm: (f: EditorForm) => void;
  context: AdminBookingEditContext;
}) {
  const maxPointsHours = Math.floor(
    context.carePoints.pointsBalance / Math.max(1, context.carePoints.redemptionPointsPerHour),
  );

  function setChildCount(count: number) {
    const next = [...form.children];
    while (next.length < count) next.push({ name: null, ageYears: 0, allergies: null });
    next.length = count;
    setForm({ ...form, children: next });
  }

  function setChildAge(index: number, age: number) {
    const next = form.children.map((c, i) => (i === index ? { ...c, ageYears: age } : c));
    setForm({ ...form, children: next });
  }

  function toggleSkill(id: number) {
    const has = form.skillIds.includes(id);
    setForm({
      ...form,
      skillIds: has ? form.skillIds.filter((s) => s !== id) : [...form.skillIds, id],
    });
  }

  return (
    <>
      <Card>
        <div className="card-header">
          <h3>Schedule</h3>
        </div>
        <div className="form-grid">
          <Field label="Starts">
            <input
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </Field>
          <Field label="Ends">
            <input
              type="datetime-local"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="card-header">
          <h3>Children</h3>
        </div>
        <Field
          label="Number of children"
          hint={`Up to ${context.maxChildrenPerBooking}; ${context.includedChildrenPerBooking} included in the base rate.`}
        >
          <div className="hour-presets">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setChildCount(Math.max(1, form.children.length - 1))}
              disabled={form.children.length <= 1}
            >
              −
            </Button>
            <strong>{form.children.length}</strong>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setChildCount(form.children.length + 1)}
              disabled={form.children.length >= context.maxChildrenPerBooking}
            >
              +
            </Button>
          </div>
        </Field>
        <div className="child-ages">
          {form.children.map((child, i) => (
            <Field key={i} label={child.name ? child.name : `Child ${i + 1}`} hint={formatChildAge(child.ageYears)}>
              <input
                className="hour-input"
                type="number"
                min="0"
                max={String(MAX_CHILD_AGE)}
                value={child.ageYears}
                onChange={(e) => setChildAge(i, Math.max(0, Math.min(MAX_CHILD_AGE, Number(e.target.value) || 0)))}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <div className="card-header">
          <h3>Skill add-ons</h3>
        </div>
        {context.skillAddOns.length === 0 ? (
          <p className="panel-lead">No paid skill add-ons are configured.</p>
        ) : (
          <div className="addon-list">
            {context.skillAddOns.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className={form.skillIds.includes(skill.id) ? 'addon-chip selected' : 'addon-chip'}
                onClick={() => toggleSkill(skill.id)}
              >
                <span className="addon-name">{skill.name}</span>
                <span className="addon-fee">{skillFeeLabel(skill)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="card-header">
          <h3>Discounts &amp; credits</h3>
        </div>
        <div className="form-grid">
          <Field label="Promo code" hint="Clear to remove. Locked once the booking is paid.">
            <input
              type="text"
              value={form.promoCode}
              onChange={(e) => setForm({ ...form, promoCode: e.target.value.toUpperCase() })}
              placeholder="None"
            />
          </Field>
          <Field
            label="Care Points hours"
            hint={`Balance covers up to ${maxPointsHours} h (${context.carePoints.pointsBalance} pts).`}
          >
            <span className="unit-input">
              <input
                type="number"
                min="0"
                step="1"
                value={form.carePointsHours}
                onChange={(e) => setForm({ ...form, carePointsHours: Math.max(0, Number(e.target.value) || 0) })}
              />
              <span className="unit-input-suffix">hours</span>
            </span>
          </Field>
        </div>
        <div className="addon-list">
          <button
            type="button"
            className={form.usePackageHours ? 'addon-chip selected' : 'addon-chip'}
            onClick={() => setForm({ ...form, usePackageHours: !form.usePackageHours })}
          >
            <span className="addon-name">Apply package hours</span>
            <span className="addon-fee">{context.availablePackageHours} h available</span>
          </button>
        </div>
      </Card>
    </>
  );
}

function PreviewRail({
  preview,
  previewing,
  blocking,
  softs,
  ackWarnings,
  setAckWarnings,
  canSave,
  saving,
  onSave,
  onReset,
}: {
  preview: AdminEditPreviewResponse | null;
  previewing: boolean;
  blocking: AdminEditWarning[];
  softs: AdminEditWarning[];
  ackWarnings: boolean;
  setAckWarnings: (v: boolean) => void;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const delta = preview?.delta ?? 0;
  const deltaLabel = useMemo(() => {
    if (!preview || delta === 0) return 'No change to the total';
    return delta > 0
      ? `Mother owes ${formatEgp(preview.balanceDueAmount)}`
      : `Refund due ${formatEgp(preview.refundableAmount)}`;
  }, [preview, delta]);

  return (
    <div className="card summary-card">
      <div>
        <h4 className="section-eyebrow">Price preview</h4>
        <p className="summary-title">What this edit changes</p>
      </div>

      {preview ? (
        <>
          <ul className="summary-list price-preview-list">
            <li>
              <span className="summary-line">
                <strong>Total</strong>
                <span>
                  {formatEgp(preview.old.totalAmount)} → <strong>{formatEgp(preview.new.totalAmount)}</strong>
                </span>
              </span>
            </li>
            <li>
              <span className="summary-line">
                <strong>Already paid</strong>
                <span>{formatEgp(preview.amountPaid)}</span>
              </span>
            </li>
            <li className={delta > 0 ? 'preview-delta preview-delta--due' : delta < 0 ? 'preview-delta preview-delta--refund' : 'preview-delta'}>
              <span className="summary-line">
                <strong>{deltaLabel}</strong>
              </span>
            </li>
          </ul>

          {blocking.length > 0 && (
            <ul className="summary-issues summary-issues--block">
              {blocking.map((w) => (
                <li key={w.code + w.message}>
                  <TriangleAlert size={14} aria-hidden />
                  {w.message}
                </li>
              ))}
            </ul>
          )}

          {softs.length > 0 && (
            <div className="preview-softwarn">
              <ul className="summary-issues">
                {softs.map((w) => (
                  <li key={w.code + w.message}>
                    <TriangleAlert size={14} aria-hidden />
                    {w.message}
                  </li>
                ))}
              </ul>
              <label className="ack-check">
                <input
                  type="checkbox"
                  checked={ackWarnings}
                  onChange={(e) => setAckWarnings(e.target.checked)}
                />
                I understand and want to save anyway
              </label>
            </div>
          )}

          <div className="rail-actions">
            <Button onClick={onSave} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>
              Reset
            </Button>
          </div>
          <p className="rail-note">
            {previewing ? 'Pricing…' : 'Prices are recalculated from the booking options.'}
          </p>
        </>
      ) : (
        <>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={i % 2 === 0 ? '90%' : '70%'} height={12} />
          ))}
          <Skeleton height={40} radius="var(--radius-full)" />
        </>
      )}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="card" role="status" aria-label="Loading editor…">
      <div className="card-header">
        <Skeleton width={120} height={19} />
      </div>
      <div className="form-grid">
        {[0, 1].map((i) => (
          <div className="field" key={i}>
            <Skeleton width={80} height={11} />
            <Skeleton height={40} radius="var(--radius-sm)" />
          </div>
        ))}
      </div>
    </div>
  );
}
