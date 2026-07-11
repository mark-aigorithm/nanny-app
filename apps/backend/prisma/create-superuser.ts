/**
 * Bootstrap the root SUPERUSER account (idempotent).
 *
 * Usage:
 *   SUPERUSER_EMAIL=root@example.com SUPERUSER_PASSWORD=... SUPERUSER_NAME="Root Admin" \
 *     pnpm db:create-superuser
 *
 * Creates the Firebase Auth account if missing, then upserts the DB user with
 * role SUPERUSER. Safe to re-run: an existing account is promoted, not duplicated.
 */
import { prisma } from '../src/db/prisma';
import { firebaseAuth } from '../src/lib/firebase';

async function main(): Promise<void> {
  const email = process.env['SUPERUSER_EMAIL']?.toLowerCase();
  const password = process.env['SUPERUSER_PASSWORD'];
  const name = process.env['SUPERUSER_NAME'] ?? 'Super User';

  if (!email || !password) {
    throw new Error('SUPERUSER_EMAIL and SUPERUSER_PASSWORD are required.');
  }

  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(' ') || '-';

  const firebaseUser = await firebaseAuth.getUserByEmail(email).catch(async () =>
    firebaseAuth.createUser({ email, password, displayName: name, emailVerified: true }),
  );

  const user = await prisma.user.upsert({
    where: { firebaseUid: firebaseUser.uid },
    create: {
      firebaseUid: firebaseUser.uid,
      email,
      firstName: firstName ?? name,
      lastName,
      role: 'SUPERUSER',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    update: { role: 'SUPERUSER', deletedAt: null },
  });

  console.log(`Superuser ready: ${user.email} (user id ${user.id}, firebase uid ${firebaseUser.uid})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
