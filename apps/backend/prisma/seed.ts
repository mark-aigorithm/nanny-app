import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from '../src/lib/config';

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.appSettings.upsert({
    where: { key: 'service_fee_percent' },
    create: { key: 'service_fee_percent', value: '6' },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log('[seed] app_settings seeded (service_fee_percent = 6)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
