import { PolygonSchema } from '@nanny-app/shared';

import {
  lookupServiceArea,
  toLookup,
  type NominatimHit,
} from '@backend/services/service-area-lookup.service';

import newCairo from './fixtures/nominatim-new-cairo.json';

const hits = newCairo as NominatimHit[];

describe('toLookup', () => {
  it('turns the real New Cairo border into a valid, simplified polygon', () => {
    const out = toLookup('New Cairo', hits);
    expect(out.source).toBe('osm');
    expect(PolygonSchema.safeParse(out.polygon).success).toBe(true);
    expect(out.polygon.coordinates[0].length).toBeLessThanOrEqual(150);
    expect(out.polygon.coordinates[0].length).toBeLessThan(
      (hits[0]!.geojson!.coordinates as number[][][])[0]!.length,
    );
  });

  it('uses the largest ring of a multipolygon', () => {
    const small = [
      [31.0, 30.0],
      [31.01, 30.0],
      [31.01, 30.01],
      [31.0, 30.0],
    ];
    const big = [
      [31.4, 30.0],
      [31.5, 30.0],
      [31.5, 30.1],
      [31.4, 30.1],
      [31.4, 30.0],
    ];
    const out = toLookup('x', [
      {
        display_name: 'X',
        boundingbox: ['30', '30.1', '31', '31.5'],
        geojson: { type: 'MultiPolygon', coordinates: [[small], [big]] },
      },
    ]);
    expect(out.polygon.coordinates[0]).toContainEqual([31.5, 30.1]);
  });

  it('falls back to the bounding box when no hit has a border', () => {
    const out = toLookup('Fifth Settlement', [
      {
        display_name: 'A shop',
        boundingbox: ['30.01', '30.03', '31.46', '31.48'],
        geojson: { type: 'Point', coordinates: [31.47, 30.02] },
      },
    ]);
    expect(out).toMatchObject({ source: 'bbox', displayName: 'A shop' });
    expect(out.polygon.coordinates[0]).toEqual([
      [31.46, 30.01],
      [31.48, 30.01],
      [31.48, 30.03],
      [31.46, 30.03],
      [31.46, 30.01],
    ]);
  });

  it('is a 404 when nothing matches', () => {
    expect(() => toLookup('Atlantis', [])).toThrow(expect.objectContaining({ statusCode: 404 }));
  });
});

describe('lookupServiceArea', () => {
  afterEach(() => jest.restoreAllMocks());

  it('names the app and restricts to Egypt', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(hits)));
    await lookupServiceArea('New Cairo');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('countrycodes=eg');
    expect(url).toContain('polygon_geojson=1');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/NannyNow/);
  });

  it('is a 502 telling the admin to draw by hand when Nominatim fails', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('<html>busy</html>', { status: 429 }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(lookupServiceArea('New Cairo')).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringMatching(/draw the area by hand/i),
    });
    expect(warn).toHaveBeenCalled();
  });

  it('is a 502 when the network call throws (timeout)', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(lookupServiceArea('New Cairo')).rejects.toMatchObject({ statusCode: 502 });
    expect(warn).toHaveBeenCalled();
  });

  it('is a 502, not a 500, when Nominatim answers 200 with a non-list body', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'x' })));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(lookupServiceArea('New Cairo')).rejects.toMatchObject({ statusCode: 502 });
    expect(warn).toHaveBeenCalled();
  });

  it('is a 502 when a hit has neither a border nor a bounding box', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ display_name: 'Odd' }])));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(lookupServiceArea('New Cairo')).rejects.toMatchObject({ statusCode: 502 });
    expect(warn).toHaveBeenCalled();
  });

  it('is a 502 when a hit has a malformed border', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { display_name: 'Odd', geojson: { type: 'Polygon', coordinates: 'nope' } },
          ]),
        ),
      );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(lookupServiceArea('New Cairo')).rejects.toMatchObject({ statusCode: 502 });
    expect(warn).toHaveBeenCalled();
  });
});
