import { normalizePhone } from '@nanny-app/shared';
import type { SupportContact, UpdateSupportContactInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';

const KEYS = {
  WHATSAPP_NUMBER: 'support_whatsapp_number',
  PHONE_NUMBER: 'support_phone_number',
  EMAIL: 'support_email',
} as const;

/**
 * Empty means "not configured" — the app hides that channel. Defaults are
 * blank on purpose: a placeholder number would render a card that dials a
 * line nobody answers, which is worse than no card at all.
 */
const DEFAULTS: SupportContact = {
  whatsappNumber: '',
  phoneNumber: '',
  email: '',
};

/** Maps each SupportContact field to its app_settings key. */
const FIELD_TO_KEY: Record<keyof SupportContact, string> = {
  whatsappNumber: KEYS.WHATSAPP_NUMBER,
  phoneNumber: KEYS.PHONE_NUMBER,
  email: KEYS.EMAIL,
};

/**
 * Values are read as raw strings. Unlike getPlatformConfig, there is no
 * numeric parsing here — that loop is what keeps PlatformConfig numeric, and
 * it is why support contact lives in its own service.
 */
export async function getSupportContact(): Promise<SupportContact> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: Object.values(FIELD_TO_KEY) }, deletedAt: null },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const contact = { ...DEFAULTS };
  for (const field of Object.keys(FIELD_TO_KEY) as (keyof SupportContact)[]) {
    const raw = byKey.get(FIELD_TO_KEY[field]);
    if (raw !== undefined) contact[field] = raw;
  }
  return contact;
}

/**
 * Upserts the provided channels and returns the resulting full contact.
 * Numbers are normalized on the way in so one stored value serves both the
 * `tel:` and `wa.me` forms. There are no cross-field rules, so unlike
 * updatePlatformConfig there is no coherence guard.
 */
export async function updateSupportContact(
  input: UpdateSupportContactInput,
): Promise<SupportContact> {
  const writes = (Object.keys(input) as (keyof SupportContact)[])
    .filter((field) => input[field] !== undefined)
    .map((field) => {
      const key = FIELD_TO_KEY[field];
      const raw = input[field] as string;
      const value = field === 'email' ? raw.trim() : normalizePhone(raw);
      return prisma.appSettings.upsert({
        where: { key },
        create: { key, value },
        update: { value, deletedAt: null },
      });
    });

  await prisma.$transaction(writes);
  return getSupportContact();
}
