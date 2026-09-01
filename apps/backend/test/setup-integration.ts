/**
 * Per-file setup for the integration project (`setupFilesAfterEnv`).
 *
 * Every test starts from the same state: an empty database restored to its
 * seeded baseline, an Auth emulator with no accounts, and an empty mailbox.
 * Resetting them together matters — a leftover Firebase account whose `users`
 * row has been truncated is a half-state that produces order-dependent
 * failures.
 */
import { prisma } from '@backend/db/prisma';

import { clearEmulatorUsers } from './auth';
import { resetDatabase } from './db/reset';
import { resetPaymobFake } from './journeys/payment';
import { clearMailbox } from './mailpit';

beforeEach(async () => {
  await resetDatabase();
  await clearEmulatorUsers();
  // Payment ids restart with the truncated tables, so stale intentions in the
  // fake could otherwise alias a new test's merchant references.
  await resetPaymobFake();
  // Verification codes are read back out of Mailpit, so a previous test's
  // message to a recycled address must not be findable.
  await clearMailbox();
});

afterAll(async () => {
  // Without this the pool keeps the process alive and Jest reports an open
  // handle after the suite has otherwise passed.
  await prisma.$disconnect();
});
