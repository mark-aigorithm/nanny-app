import type { Prisma } from '@prisma/client';

import type {
  NotificationAudience,
  NotificationAudiencePreview,
  NotificationBroadcast,
  NotificationTemplate,
  NotificationTemplateListItem,
  NotificationTemplateValues,
} from '@nanny-app/shared';
import { BROADCAST_STALE_MS, NotificationAudienceSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { displayName } from '@backend/lib/display-name';
import { errors } from '@backend/lib/errors';
import { receivableMotherWhere, resolveGroupMembers } from '@backend/services/group-audience.service';
import { listLiveDeviceTokens } from '@backend/services/notification.service';

const TEMPLATE_INCLUDE = {
  package: { select: { id: true, name: true } },
  promoCode: { select: { id: true, code: true } },
  // The newest publish only — for "last published"; the count comes from _count.
  broadcasts: { select: { createdAt: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
  _count: { select: { broadcasts: true } },
} satisfies Prisma.NotificationTemplateInclude;

type TemplateRow = Prisma.NotificationTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>;

export const BROADCAST_INCLUDE = {
  publishedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.NotificationBroadcastInclude;

export type BroadcastRow = Prisma.NotificationBroadcastGetPayload<{ include: typeof BROADCAST_INCLUDE }>;

function countLabel(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** "2 groups" / "1 group" / "37 mothers" / "1 mother" — the list's audience column. */
export function audienceSummary(audience: NotificationAudience): string {
  return audience.type === 'GROUPS'
    ? countLabel(audience.groupIds.length, 'group', 'groups')
    : countLabel(audience.motherIds.length, 'mother', 'mothers');
}

function linkLabel(row: TemplateRow): string | null {
  if (row.targetType === 'PACKAGE') return row.package?.name ?? null;
  if (row.targetType === 'PROMO_CODE') return row.promoCode?.code ?? null;
  return null;
}

function toListItem(row: TemplateRow): NotificationTemplateListItem {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    channel: row.channel,
    targetType: row.targetType,
    linkLabel: linkLabel(row),
    audienceSummary: audienceSummary(NotificationAudienceSchema.parse(row.audience)),
    publishCount: row._count.broadcasts,
    lastPublishedAt: row.broadcasts[0]?.createdAt.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The editor's view: the audience with group names/kinds and mother names resolved. */
async function toTemplateDto(row: TemplateRow): Promise<NotificationTemplate> {
  const audience = NotificationAudienceSchema.parse(row.audience);
  let audienceGroups: NotificationTemplate['audienceGroups'] = [];
  let audienceMothers: NotificationTemplate['audienceMothers'] = [];

  // In the template's order. A group or mother gone since saving is left out;
  // publish reports a deleted group as skipped.
  if (audience.type === 'GROUPS') {
    const groups = await prisma.userGroup.findMany({
      where: { id: { in: audience.groupIds }, deletedAt: null },
      select: { id: true, name: true, kind: true },
    });
    const byId = new Map(groups.map((g) => [g.id, g]));
    audienceGroups = audience.groupIds.flatMap((id) => {
      const group = byId.get(id);
      return group ? [{ id: group.id, name: group.name, kind: group.kind }] : [];
    });
  } else {
    const mothers = await prisma.user.findMany({
      where: { id: { in: audience.motherIds }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    const byId = new Map(mothers.map((m) => [m.id, m]));
    audienceMothers = audience.motherIds.flatMap((id) => {
      const mother = byId.get(id);
      return mother ? [{ id: mother.id, name: displayName(mother.firstName, mother.lastName) }] : [];
    });
  }

  return {
    id: row.id,
    name: row.name,
    title: row.title,
    body: row.body,
    imageUrl: row.imageUrl,
    channel: row.channel,
    targetType: row.targetType,
    packageId: row.packageId,
    promoCodeId: row.promoCodeId,
    package: row.package,
    promoCode: row.promoCode,
    audience,
    audienceGroups,
    audienceMothers,
    publishCount: row._count.broadcasts,
    lastPublishedAt: row.broadcasts[0]?.createdAt.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireTemplate(id: number): Promise<TemplateRow> {
  const row = await prisma.notificationTemplate.findFirst({ where: { id, deletedAt: null }, include: TEMPLATE_INCLUDE });
  if (!row) throw errors.notFound('Notification template not found.');
  return row;
}

/**
 * What a save checks against the database. Whether a promo is still active or
 * unexpired is checked at publish (Task 7): a template may be prepared ahead.
 */
async function assertSavable(input: NotificationTemplateValues): Promise<void> {
  // The shared schema accepts any URL scheme; a push image must be https.
  if (input.imageUrl && new URL(input.imageUrl).protocol !== 'https:') {
    throw errors.badRequest('The image must be an https URL.');
  }
  if (input.targetType === 'PACKAGE') {
    const pkg = await prisma.package.findFirst({ where: { id: input.packageId ?? -1, deletedAt: null }, select: { id: true } });
    if (!pkg) throw errors.badRequest('That package no longer exists.');
  }
  if (input.targetType === 'PROMO_CODE') {
    const promo = await prisma.promoCode.findFirst({
      where: { id: input.promoCodeId ?? -1, deletedAt: null },
      select: { id: true },
    });
    if (!promo) throw errors.badRequest('That promo code no longer exists.');
  }

  const { audience } = input;
  if (audience.type === 'GROUPS') {
    const live = await prisma.userGroup.count({ where: { id: { in: audience.groupIds }, deletedAt: null } });
    if (live !== audience.groupIds.length) throw errors.badRequest('One of the chosen groups no longer exists.');
  } else {
    const receivable = await prisma.user.count({ where: { id: { in: audience.motherIds }, ...receivableMotherWhere } });
    if (receivable !== audience.motherIds.length) {
      throw errors.badRequest("Some of the chosen people can't receive notifications — only active mothers can.");
    }
  }
}

/** The columns a create or a full-replace update writes. The ids follow targetType. */
function templateData(input: NotificationTemplateValues) {
  return {
    name: input.name,
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl,
    channel: input.channel,
    targetType: input.targetType,
    packageId: input.targetType === 'PACKAGE' ? input.packageId : null,
    promoCodeId: input.targetType === 'PROMO_CODE' ? input.promoCodeId : null,
    audience: input.audience as Prisma.InputJsonValue,
  };
}

export async function listNotificationTemplates(): Promise<NotificationTemplateListItem[]> {
  const rows = await prisma.notificationTemplate.findMany({
    where: { deletedAt: null },
    include: TEMPLATE_INCLUDE,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map(toListItem);
}

export async function getNotificationTemplate(id: number): Promise<NotificationTemplate> {
  return toTemplateDto(await requireTemplate(id));
}

export async function createNotificationTemplate(
  adminId: number,
  input: NotificationTemplateValues,
): Promise<NotificationTemplate> {
  await assertSavable(input);
  const row = await prisma.notificationTemplate.create({
    data: { ...templateData(input), createdById: adminId },
    include: TEMPLATE_INCLUDE,
  });
  return toTemplateDto(row);
}

/** A full replace: the editor always sends the whole template. */
export async function updateNotificationTemplate(
  id: number,
  input: NotificationTemplateValues,
): Promise<NotificationTemplate> {
  await requireTemplate(id);
  await assertSavable(input);
  const row = await prisma.notificationTemplate.update({
    where: { id },
    data: templateData(input),
    include: TEMPLATE_INCLUDE,
  });
  return toTemplateDto(row);
}

/** Soft delete; its broadcasts and the inbox rows they wrote stay. */
export async function deleteNotificationTemplate(id: number): Promise<void> {
  await requireTemplate(id);
  await prisma.notificationTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Who a template would reach right now: hand-picked ids filtered through the
 * receivable base (a mother deactivated since saving is dropped, not refused),
 * or the union of the groups. Sorted, deduplicated.
 */
export async function resolveNotificationAudience(
  audience: NotificationAudience,
): Promise<{ userIds: number[]; skippedGroupIds: number[] }> {
  if (audience.type === 'GROUPS') return resolveGroupMembers(audience.groupIds);
  const rows = await prisma.user.findMany({
    where: { id: { in: audience.motherIds }, ...receivableMotherWhere },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return { userIds: rows.map((r) => r.id), skippedGroupIds: [] };
}

/** "1,240 mothers · 1,031 with push enabled" in the editor. */
export async function previewNotificationAudience(
  audience: NotificationAudience,
): Promise<NotificationAudiencePreview> {
  const { userIds } = await resolveNotificationAudience(audience);
  const tokens = await listLiveDeviceTokens(userIds);
  return { mothers: userIds.length, withPushDevice: new Set(tokens.map((t) => t.userId)).size };
}

/**
 * A broadcast as the console shows it. One still SENDING after
 * BROADCAST_STALE_MS was cut off (the serverless function was killed): it reads
 * as FAILED / "Timed out", and Task 7's publish guard ignores it.
 */
export function toBroadcastDto(row: BroadcastRow, now: Date = new Date()): NotificationBroadcast {
  const timedOut = row.status === 'SENDING' && now.getTime() - row.createdAt.getTime() > BROADCAST_STALE_MS;
  return {
    id: row.id,
    templateId: row.templateId,
    status: timedOut ? 'FAILED' : row.status,
    title: row.title,
    channel: row.channel,
    targeted: row.targeted,
    inAppCreated: row.inAppCreated,
    pushSent: row.pushSent,
    pushFailed: row.pushFailed,
    noDevice: row.noDevice,
    skippedGroupIds: row.skippedGroups,
    error: timedOut ? 'Timed out' : row.error,
    publishedBy: { id: row.publishedBy.id, name: displayName(row.publishedBy.firstName, row.publishedBy.lastName) },
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function listTemplateBroadcasts(templateId: number): Promise<NotificationBroadcast[]> {
  await requireTemplate(templateId);
  const rows = await prisma.notificationBroadcast.findMany({
    where: { templateId },
    include: BROADCAST_INCLUDE,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const now = new Date();
  return rows.map((row) => toBroadcastDto(row, now));
}
