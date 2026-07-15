import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from '../src/lib/config';

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

/**
 * Must match DEFAULTS in `app-settings.service.ts`. The service falls back to
 * those for any unseeded key, so seeding is about making the values visible and
 * editable in the DB rather than about the app working at all.
 */
const APP_SETTINGS: Record<string, string> = {
  service_fee_percent: '6',
  standard_hourly_rate: '120',
  min_booking_hours: '2',
  max_booking_hours: '12',
  min_advance_booking_hours: '2',
  booking_window_start_hour: '6',
  booking_window_end_hour: '22',
};

async function main() {
  // `update: {}` keeps this idempotent — reseeding never clobbers an admin's edits.
  for (const [key, value] of Object.entries(APP_SETTINGS)) {
    await prisma.appSettings.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[seed] app_settings seeded (${Object.keys(APP_SETTINGS).length} keys)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
