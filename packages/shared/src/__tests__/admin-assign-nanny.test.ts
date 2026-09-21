import { describe, expect, it } from 'vitest';

import {
  AdminBookingCandidateQuerySchema,
  AdminBookingCandidateSchema,
  AssignBookingNannySchema,
} from '../admin';
import { canAssignBookingNanny } from '../booking';

describe('canAssignBookingNanny', () => {
  it('allows the pre-service statuses only', () => {
    expect(canAssignBookingNanny('PENDING')).toBe(true);
    expect(canAssignBookingNanny('APPROVED')).toBe(true);
    expect(canAssignBookingNanny('CONFIRMED')).toBe(true);
  });

  it('locks a booking once the shift has started or ended', () => {
    for (const s of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'NOPE']) {
      expect(canAssignBookingNanny(s)).toBe(false);
    }
  });
});

describe('AssignBookingNannySchema', () => {
  it('needs a positive integer profile id', () => {
    expect(AssignBookingNannySchema.safeParse({ nannyProfileId: 19 }).success).toBe(true);
    expect(AssignBookingNannySchema.safeParse({ nannyProfileId: 0 }).success).toBe(false);
    expect(AssignBookingNannySchema.safeParse({ nannyProfileId: '19' }).success).toBe(false);
    expect(AssignBookingNannySchema.safeParse({}).success).toBe(false);
  });
});

describe('AdminBookingCandidateQuerySchema', () => {
  it('defaults the limit and trims the search', () => {
    const parsed = AdminBookingCandidateQuerySchema.parse({ q: '  sara ' });
    expect(parsed).toEqual({ q: 'sara', limit: 20 });
  });

  it('coerces and caps the limit, and drops an empty search', () => {
    expect(AdminBookingCandidateQuerySchema.parse({ limit: '5' }).limit).toBe(5);
    expect(AdminBookingCandidateQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(AdminBookingCandidateQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });
});

describe('AdminBookingCandidateSchema', () => {
  it('describes one picker row', () => {
    const parsed = AdminBookingCandidateSchema.safeParse({
      id: 21,
      name: 'Sara Near',
      phone: null,
      rating: 4.5,
      reviewCount: 3,
      conflict: false,
      missingSkills: ['CPR'],
      distanceKm: 1.2,
      outsideRadius: false,
    });
    expect(parsed.success).toBe(true);
  });
});
