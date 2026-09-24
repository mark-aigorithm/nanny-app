import { Prisma } from '@prisma/client';

import { uniqueClashFields } from '@backend/lib/prisma-errors';

/** The real Prisma 7 + @prisma/adapter-pg shape — see prisma-errors.ts's doc comment. */
function driverAdapterClash(constraint: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      modelName: 'User',
      driverAdapterError: Object.assign(new Error('unique'), {
        cause: { kind: 'UniqueConstraintViolation', constraint },
      }),
    },
  });
}

function legacyClash(target: string | string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('uniqueClashFields', () => {
  it('reads the column names off a driver-adapter constraint.fields', () => {
    expect(uniqueClashFields(driverAdapterClash({ fields: ['phone'] }))).toEqual(['phone']);
    expect(uniqueClashFields(driverAdapterClash({ fields: ['email', 'firebase_uid'] }))).toEqual([
      'email',
      'firebase_uid',
    ]);
  });

  it('falls back to constraint.index as a single-element array', () => {
    expect(uniqueClashFields(driverAdapterClash({ index: 'users_email_key' }))).toEqual([
      'users_email_key',
    ]);
  });

  it('falls back to a legacy meta.target string', () => {
    expect(uniqueClashFields(legacyClash('phone'))).toEqual(['phone']);
  });

  it('falls back to a legacy meta.target array', () => {
    expect(uniqueClashFields(legacyClash(['email']))).toEqual(['email']);
  });

  it('returns an empty array when a P2002 carries no identifiable column', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { modelName: 'User' },
    });
    expect(uniqueClashFields(err)).toEqual([]);
  });

  it('returns null for a Prisma error that is not P2002', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(uniqueClashFields(err)).toBeNull();
  });

  it('returns null for a non-Prisma error', () => {
    expect(uniqueClashFields(new Error('connection reset'))).toBeNull();
    expect(uniqueClashFields('nope')).toBeNull();
    expect(uniqueClashFields(null)).toBeNull();
    expect(uniqueClashFields(undefined)).toBeNull();
  });
});
