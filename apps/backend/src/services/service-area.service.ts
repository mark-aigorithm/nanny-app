import {
  PolygonSchema,
  Role,
  isPointInPolygon,
  outsideServiceAreaMessage,
  type CreateServiceAreaInput,
  type MotherPin,
  type Polygon,
  type ServiceArea,
  type ServiceAreaSettings,
  type ServiceAreaSource,
  type UpdateServiceAreaInput,
} from '@nanny-app/shared';
import type { Prisma, ServiceArea as ServiceAreaRow } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * Where mothers can book. While the page-wide switch is on and at least one
 * area is active, a booking's address must fall inside one; with the switch
 * off or no area active, booking is unrestricted — so the feature is off until
 * an admin switches an area on.
 */

const ENABLED_KEY = 'service_areas_enabled';

/**
 * Only the literal "false" switches the limit off; no row, or anything else,
 * reads as on — the same rule as the other toggles in app_settings.
 */
export async function getServiceAreaSettings(): Promise<ServiceAreaSettings> {
  const row = await prisma.appSettings.findFirst({ where: { key: ENABLED_KEY, deletedAt: null } });
  return { enabled: row ? row.value !== 'false' : true };
}

export async function updateServiceAreaSettings(
  input: ServiceAreaSettings,
): Promise<ServiceAreaSettings> {
  const value = String(input.enabled);
  await prisma.appSettings.upsert({
    where: { key: ENABLED_KEY },
    create: { key: ENABLED_KEY, value },
    update: { value, deletedAt: null },
  });
  return { enabled: input.enabled };
}

export type ActiveArea = { name: string; polygon: Polygon };

/**
 * The areas booking is limited to: the active ones, oldest first (the order
 * their names are listed in) — or none while the page-wide switch is off. A
 * row whose polygon no longer parses is skipped and logged rather than
 * failing every booking and address list.
 */
export async function getEnforcedServiceAreas(): Promise<ActiveArea[]> {
  const rows = await prisma.serviceArea.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, polygon: true },
  });
  // The switch only matters once an area is active, so the common case — no
  // areas — costs one query, not two.
  if (rows.length === 0 || !(await getServiceAreaSettings()).enabled) return [];
  const areas: ActiveArea[] = [];
  for (const row of rows) {
    const parsed = PolygonSchema.safeParse(row.polygon);
    if (parsed.success) areas.push({ name: row.name, polygon: parsed.data });
    else console.warn(`[service-area] skipping area ${row.id ?? row.name}: malformed polygon`);
  }
  return areas;
}

/** True when no area is active, or the point is inside any of them. */
export function isInAnyArea(lat: number, lng: number, areas: ActiveArea[]): boolean {
  return areas.length === 0 || areas.some((a) => isPointInPolygon(lat, lng, a.polygon));
}

/** Throws the refusal mothers see when the point is outside every active area. */
export async function assertInServiceArea(lat: number, lng: number): Promise<void> {
  const areas = await getEnforcedServiceAreas();
  if (!isInAnyArea(lat, lng, areas)) {
    throw errors.badRequest(outsideServiceAreaMessage(areas.map((a) => a.name)));
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────────

function toDto(row: ServiceAreaRow): ServiceArea {
  return {
    id: row.id,
    name: row.name,
    polygon: PolygonSchema.parse(row.polygon),
    isActive: row.isActive,
    source: row.source as ServiceAreaSource,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listServiceAreas(): Promise<ServiceArea[]> {
  const rows = await prisma.serviceArea.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'desc' },
  });
  return rows.map(toDto);
}

export async function createServiceArea(input: CreateServiceAreaInput): Promise<ServiceArea> {
  const row = await prisma.serviceArea.create({
    data: {
      name: input.name,
      polygon: input.polygon as Prisma.InputJsonValue,
      isActive: input.isActive ?? true,
      source: input.source,
    },
  });
  return toDto(row);
}

async function requireArea(id: number): Promise<void> {
  const found = await prisma.serviceArea.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw errors.notFound('Service area not found.');
}

export async function updateServiceArea(id: number, input: UpdateServiceAreaInput): Promise<ServiceArea> {
  await requireArea(id);
  const row = await prisma.serviceArea.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.polygon !== undefined ? { polygon: input.polygon as Prisma.InputJsonValue } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
    },
  });
  return toDto(row);
}

export async function deleteServiceArea(id: number): Promise<void> {
  await requireArea(id);
  await prisma.serviceArea.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** Every live mother's default address as a bare point — no names, no ids. */
export async function listMotherPins(): Promise<MotherPin[]> {
  const rows = await prisma.address.findMany({
    where: { isDefault: true, deletedAt: null, user: { role: Role.MOTHER, deletedAt: null } },
    select: { latitude: true, longitude: true },
  });
  return rows.map((r) => ({ latitude: Number(r.latitude), longitude: Number(r.longitude) }));
}
