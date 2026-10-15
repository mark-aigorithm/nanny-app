import { prisma } from '@backend/db/prisma';
import {
  assertInServiceArea,
  getActiveServiceAreas,
  isInAnyArea,
} from '@backend/services/service-area.service';

jest.mock('@backend/db/prisma', () => ({
  prisma: { serviceArea: { findMany: jest.fn() } },
}));

const findMany = prisma.serviceArea.findMany as jest.Mock;

const NEW_CAIRO = {
  type: 'Polygon',
  coordinates: [[[31.40, 29.98], [31.52, 29.98], [31.52, 30.06], [31.40, 30.06], [31.40, 29.98]]],
};
const DOWNTOWN = { lat: 30.0444, lng: 31.2357 };
const FIFTH_SETTLEMENT = { lat: 30.02, lng: 31.47 };

beforeEach(() => findMany.mockReset());

describe('isInAnyArea', () => {
  it('allows everywhere when no area is active', () => {
    expect(isInAnyArea(DOWNTOWN.lat, DOWNTOWN.lng, [])).toBe(true);
  });
  it('allows a point inside an area and refuses one outside', () => {
    const areas = [{ name: 'New Cairo', polygon: NEW_CAIRO as never }];
    expect(isInAnyArea(FIFTH_SETTLEMENT.lat, FIFTH_SETTLEMENT.lng, areas)).toBe(true);
    expect(isInAnyArea(DOWNTOWN.lat, DOWNTOWN.lng, areas)).toBe(false);
  });
});

describe('getActiveServiceAreas', () => {
  it('asks only for live, active rows in creation order', async () => {
    findMany.mockResolvedValue([]);
    await getActiveServiceAreas();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, deletedAt: null },
        orderBy: { id: 'asc' },
      }),
    );
  });
  it('skips a row whose polygon is malformed instead of failing', async () => {
    findMany.mockResolvedValue([
      { name: 'Broken', polygon: { type: 'Polygon', coordinates: [[[1, 2]]] } },
      { name: 'New Cairo', polygon: NEW_CAIRO },
    ]);
    const areas = await getActiveServiceAreas();
    expect(areas.map((a) => a.name)).toEqual(['New Cairo']);
  });
});

describe('assertInServiceArea', () => {
  it('passes with no active areas', async () => {
    findMany.mockResolvedValue([]);
    await expect(assertInServiceArea(DOWNTOWN.lat, DOWNTOWN.lng)).resolves.toBeUndefined();
  });
  it('refuses outside with the served names', async () => {
    findMany.mockResolvedValue([{ name: 'New Cairo', polygon: NEW_CAIRO }]);
    await expect(assertInServiceArea(DOWNTOWN.lat, DOWNTOWN.lng)).rejects.toMatchObject({
      statusCode: 400,
      message: "We don't serve this area yet. We're currently in: New Cairo.",
    });
  });
});
