/**
 * Keeps the payment ids an E2E run creates from repeating ones Paymob has seen.
 *
 * Every payment attempt is sent to Paymob with its `payments.id` as the order
 * reference (`merchant_order_id`), and Paymob refuses a reference it already
 * holds: "An Order with ref: 56 already exists". Production never repeats an
 * id. The test database does, every time a suite truncates it and the
 * sequence restarts at 1, while the TEST-mode sandbox account keeps every
 * order from every earlier run.
 *
 * So before a run, the sequence is moved up to the current Unix time in
 * seconds. Each run's ids then start above anything an earlier run could have
 * reached, as long as a run makes fewer payments than seconds pass, which it
 * always does. The column is a 32-bit integer, which holds Unix seconds until
 * 2038. It is harmless against the Paymob fake, which keeps no history.
 */
import { prisma } from '@backend/db/prisma';

export async function movePaymentIdsPastEarlierRuns(): Promise<void> {
  await prisma.$executeRaw`
    SELECT setval(
      pg_get_serial_sequence('payments', 'id'),
      GREATEST(
        (SELECT COALESCE(MAX(id), 0) FROM payments),
        EXTRACT(EPOCH FROM now())::bigint
      )
    )`;
}
