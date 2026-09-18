/**
 * Skill factory.
 *
 * A skill is both a catalogue entry a nanny can hold and, when it carries a
 * fee, a priced add-on a mother can request on a booking. Broadcast matching
 * keys off the skill's id — a request is only shown to, and claimable by,
 * nannies holding every add-on it was priced for — so tests of that rule need
 * a skill nobody else in the run has, which is what the unique name is for.
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';

export type SkillOverrides = Partial<Prisma.SkillCreateInput>;

let sequence = 0;

/** An active skill with no fee, unless overridden. */
export function makeSkill(overrides: SkillOverrides = {}) {
  sequence += 1;
  return prisma.skill.create({
    data: {
      name: `Test Skill ${process.pid}-${sequence}`,
      description: 'Factory-created skill.',
      isActive: true,
      ...overrides,
    },
  });
}
