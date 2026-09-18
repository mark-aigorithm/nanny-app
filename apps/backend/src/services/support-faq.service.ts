import { SupportFaqSchema, type SupportFaq, type SupportFaqItem } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';

/**
 * The FAQ the app's Help & Support screen shows.
 *
 * One JSON `app_settings` row, like the contact channels next door: a handful
 * of entries that change together and are only ever read whole. Until an
 * operator writes the list, the questions the app shipped with are answered,
 * so a fresh environment is never blank.
 */
const KEY = 'support_faq';

const DEFAULT_ITEMS: SupportFaqItem[] = [
  {
    question: 'How are nannies vetted?',
    answer:
      'All nannies complete a comprehensive background check including identity verification, reference checks and CPR certification.',
  },
  {
    question: 'What is the cancellation policy?',
    answer:
      'You can cancel a booking up to 24 hours before the scheduled start time for a full refund. Cancellations within 24 hours may incur a fee.',
  },
  {
    question: 'How do refunds work?',
    answer:
      'Refunds are processed within 5-7 business days and returned to your original payment method.',
  },
];

/** The stored row, or the defaults when there is none or it will not parse. */
export async function getSupportFaq(): Promise<SupportFaq> {
  const row = await prisma.appSettings.findFirst({ where: { key: KEY, deletedAt: null } });
  if (!row) return { items: DEFAULT_ITEMS };

  try {
    const parsed = SupportFaqSchema.shape.items.safeParse(JSON.parse(row.value));
    return { items: parsed.success ? parsed.data : DEFAULT_ITEMS };
  } catch {
    // A hand-edited row that isn't JSON must not take the screen down.
    return { items: DEFAULT_ITEMS };
  }
}

/** Replaces the whole list — the editor always saves everything it shows. */
export async function updateSupportFaq(input: SupportFaq): Promise<SupportFaq> {
  const items = input.items.map((item) => ({
    question: item.question.trim(),
    answer: item.answer.trim(),
  }));
  const value = JSON.stringify(items);

  await prisma.appSettings.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value, deletedAt: null },
  });

  return getSupportFaq();
}
