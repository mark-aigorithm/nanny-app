import { prisma } from '@backend/db/prisma';

const KEYS = {
  SERVICE_FEE_PERCENT: 'service_fee_percent',
} as const;

/** Returns the platform service fee % from app_settings (default 6 if not seeded). */
export async function getServiceFeePercent(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: KEYS.SERVICE_FEE_PERCENT },
  });
  return row ? parseFloat(row.value) : 6;
}
