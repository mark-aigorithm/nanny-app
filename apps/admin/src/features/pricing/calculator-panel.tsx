import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Card, Feedback, Gift, ICON_SIZE, Skeleton } from '@admin/components/ui';
import { calculatePricePreview, fetchRewardConfig, fetchSkills } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatAmount } from '@admin/lib/format';

const HOUR_PRESETS = [1, 2, 3, 4, 6, 8];
const CHILD_PRESETS = [1, 2, 3, 4];

function feeLabel(feeType: 'FLAT' | 'PERCENTAGE' | null, feeValue: number): string {
  if (feeType === 'FLAT') return `+EGP ${formatAmount(feeValue)}/hr`;
  if (feeType === 'PERCENTAGE') return `+${feeValue}%`;
  return 'included';
}

export function CalculatorPanel() {
  const { data: skills } = useQuery({ queryKey: ['skills'], queryFn: fetchSkills });
  const { data: rewardConfig } = useQuery({
    queryKey: ['reward-config'],
    queryFn: fetchRewardConfig,
  });
  const activeSkills = useMemo(
    () => (skills ?? []).filter((s) => s.isActive),
    [skills],
  );

  const [hours, setHours] = useState(3);
  const [childrenCount, setChildrenCount] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);

  const skillIds = useMemo(() => [...selected].sort(), [selected]);

  const {
    data: breakdown,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['price-preview', hours, childrenCount, skillIds],
    queryFn: () => calculatePricePreview({ durationHours: hours, childrenCount, skillIds }),
    placeholderData: keepPreviousData,
  });

  function toggleSkill(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  return (
    <>
      <Card title="Scenario">
        <div className="calc-controls">
          <div className="calc-control">
            <span className="field-label">Hours booked</span>
            <div className="hour-presets">
              {HOUR_PRESETS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`hour-chip${hours === h ? ' selected' : ''}`}
                  onClick={() => setHours(h)}
                >
                  {h}h
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="24"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
                className="hour-input"
                aria-label="Custom hours"
              />
            </div>
          </div>

          <div className="calc-control">
            <span className="field-label">Children</span>
            <div className="hour-presets">
              {CHILD_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`hour-chip${childrenCount === c ? ' selected' : ''}`}
                  onClick={() => setChildrenCount(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="calc-control calc-control--wide">
            <span className="field-label">Skill add-ons</span>
            {activeSkills.length === 0 ? (
              <p className="field-hint">No active skills. Add some on the Skills page.</p>
            ) : (
              <div className="addon-list">
                {activeSkills.map((skill) => {
                  const on = selected.includes(skill.id);
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      className={`addon-chip${on ? ' selected' : ''}`}
                      onClick={() => toggleSkill(skill.id)}
                      aria-pressed={on}
                    >
                      <span className="addon-name">{skill.name}</span>
                      <span className="addon-fee">{feeLabel(skill.feeType, skill.feeValue)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="What everyone sees">
        {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
        {!breakdown && !error && <BreakdownSkeleton />}
        {breakdown && (
          <div className={`breakdown${isFetching ? ' breakdown--stale' : ''}`}>
            <div className="result-hero">
              <div className="result-hero-text">
                <span className="result-hero-label">The parent pays</span>
                <span className="result-hero-meta">
                  EGP {formatAmount(breakdown.effectiveHourlyRate)} / hr ×{' '}
                  {formatAmount(breakdown.durationHours)} hours
                  {breakdown.durationMultiplier !== 1 &&
                    ` · duration tier ×${breakdown.durationMultiplier}`}
                </span>
              </div>
              <strong className="result-hero-value">
                EGP {formatAmount(breakdown.totalAmount)}
              </strong>
            </div>

            <div className="result-cols">
              <section className="result-col">
                <h4 className="section-eyebrow">How it adds up</h4>

                <div className="breakdown-row">
                  <span>Base rate</span>
                  <span>EGP {formatAmount(breakdown.baseRate)} / hr</span>
                </div>

                {breakdown.extraChildren > 0 && (
                  <div className="breakdown-row breakdown-row--addon">
                    <span>
                      + {breakdown.extraChildren} extra child
                      {breakdown.extraChildren === 1 ? '' : 'ren'} ·{' '}
                      {breakdown.includedChildren} included
                    </span>
                    <span>+EGP {formatAmount(breakdown.extraChildFeePerHour)} / hr</span>
                  </div>
                )}

                {breakdown.skillAddOns.map((addon) => (
                  <div className="breakdown-row breakdown-row--addon" key={addon.id}>
                    <span>+ {addon.name}</span>
                    <span>+EGP {formatAmount(addon.amountPerHour)} / hr</span>
                  </div>
                ))}

                <div className="breakdown-row breakdown-row--sub">
                  <span>Effective rate</span>
                  <span>EGP {formatAmount(breakdown.effectiveHourlyRate)} / hr</span>
                </div>

                <div className="breakdown-row">
                  <span>× {formatAmount(breakdown.durationHours)} hours</span>
                  <span>
                    EGP {formatAmount(breakdown.effectiveHourlyRate * breakdown.durationHours)}
                  </span>
                </div>

                {breakdown.durationMultiplier !== 1 && (
                  <div className="breakdown-row breakdown-row--discount">
                    <span>Duration tier · ×{breakdown.durationMultiplier}</span>
                    <span>
                      −EGP{' '}
                      {formatAmount(
                        breakdown.effectiveHourlyRate * breakdown.durationHours -
                          breakdown.subtotal,
                      )}
                    </span>
                  </div>
                )}

                {breakdown.discountAmount > 0 && (
                  <div className="breakdown-row breakdown-row--discount">
                    <span>Promo discount</span>
                    <span>−EGP {formatAmount(breakdown.discountAmount)}</span>
                  </div>
                )}
              </section>

              <section className="result-col">
                <h4 className="section-eyebrow">Where the money goes</h4>

                <div className="split-viz">
                  <div
                    className="split-bar"
                    role="img"
                    aria-label={`Nanny earns ${breakdown.nannyPercent}%, platform keeps ${breakdown.platformPercent}%`}
                  >
                    <div
                      className="split-bar-nanny"
                      style={{ width: `${breakdown.nannyPercent}%` }}
                    >
                      {breakdown.nannyPercent >= 12 && <span>{breakdown.nannyPercent}%</span>}
                    </div>
                    <div
                      className="split-bar-platform"
                      style={{ width: `${breakdown.platformPercent}%` }}
                    >
                      {breakdown.platformPercent >= 12 && <span>{breakdown.platformPercent}%</span>}
                    </div>
                  </div>
                  <div className="split-amounts">
                    <div className="split-amount">
                      <span className="split-amount-label">
                        <span className="dot dot--nanny" /> Nanny earns
                      </span>
                      <strong className="text-nanny">
                        EGP {formatAmount(breakdown.nannyAmount)}
                      </strong>
                    </div>
                    <div className="split-amount split-amount--right">
                      <span className="split-amount-label">
                        <span className="dot dot--platform" /> Platform keeps
                      </span>
                      <strong className="text-platform">
                        EGP {formatAmount(breakdown.platformAmount)}
                      </strong>
                    </div>
                  </div>
                  <p className="split-note">
                    The nanny only sees her earnings. The parent sees the full breakdown.
                  </p>
                </div>

                {rewardConfig?.enabled && rewardConfig.pointsPerBookedHour > 0 && (
                  <div className="calc-reward">
                    <span className="calc-reward-icon" aria-hidden>
                      <Gift size={ICON_SIZE.inline} />
                    </span>
                    <div className="calc-reward-body">
                      <span className="calc-reward-title">Care Points earned</span>
                      <span className="calc-reward-sub">
                        {rewardConfig.redemptionPointsPerHour} pts = 1 free hour · redeemable at
                        checkout
                      </span>
                    </div>
                    <strong className="calc-reward-points">
                      +{Math.round(breakdown.durationHours * rewardConfig.pointsPerBookedHour)}
                    </strong>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

/** Placeholder shaped like the price breakdown while the preview loads. */
function BreakdownSkeleton() {
  return (
    <div role="status" aria-label="Calculating price…">
      <div className="result-hero">
        <Skeleton width={160} height={22} />
        <Skeleton width={190} height={30} />
      </div>
      <div className="result-cols">
        <div className="result-col calc-skeleton">
          {[70, 55, 62, 48].map((labelWidth, i) => (
            <div className="calc-skeleton-row" key={i}>
              <Skeleton width={`${labelWidth}%`} height={13} />
              <Skeleton width={64} height={13} />
            </div>
          ))}
        </div>
        <div className="result-col calc-skeleton">
          <Skeleton height={38} radius="999px" />
          <div className="calc-skeleton-row">
            <Skeleton width={110} height={13} />
            <Skeleton width={110} height={13} />
          </div>
          <Skeleton height={58} radius="12px" />
        </div>
      </div>
    </div>
  );
}
