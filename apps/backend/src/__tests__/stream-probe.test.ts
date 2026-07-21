import net from 'node:net';

import { clearProbeCache, probeStream } from '@backend/lib/stream-probe';

/** Spins up a throwaway TCP listener so we can probe something real. */
function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'string' || address === null) {
        throw new Error('expected a TCP address');
      }
      resolve({
        port: address.port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe('probeStream', () => {
  beforeEach(() => clearProbeCache());

  it('reports online when the camera accepts a connection', async () => {
    const server = await listen();
    try {
      const result = await probeStream(1, `rtsp://127.0.0.1:${server.port}/stream`);
      expect(result.online).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('reports offline when nothing is listening on the port', async () => {
    // Bind then immediately release, so the port is almost certainly closed.
    const server = await listen();
    const { port } = server;
    await server.close();

    const result = await probeStream(2, `rtsp://127.0.0.1:${port}/stream`);
    expect(result.online).toBe(false);
  });

  it('reports null — not offline — when the URL cannot be parsed', async () => {
    const result = await probeStream(3, 'definitely not a url');
    expect(result.online).toBeNull();
  });

  it('defaults to the standard RTSP port when the URL omits one', async () => {
    // No port in the URL and nothing on 554 locally, so this must resolve to a
    // real probe result rather than a parse failure.
    const result = await probeStream(4, 'rtsp://127.0.0.1/stream');
    expect(result.online).toBe(false);
  });

  it('reuses a cached result instead of redialling the camera', async () => {
    const server = await listen();
    try {
      const first = await probeStream(5, `rtsp://127.0.0.1:${server.port}/stream`);
      await server.close();

      // The camera is gone now, but the cached result should still be returned.
      const second = await probeStream(5, `rtsp://127.0.0.1:${server.port}/stream`);
      expect(second.online).toBe(true);
      expect(second.checkedAt).toEqual(first.checkedAt);
    } finally {
      await server.close().catch(() => undefined);
    }
  });

  it('does not serve a cached result after the camera is repointed', async () => {
    const oldServer = await listen();
    await probeStream(7, `rtsp://127.0.0.1:${oldServer.port}/stream`);
    await oldServer.close();

    // Same camera id, new URL — must be probed fresh rather than reusing the
    // previous host's "online".
    const dead = await listen();
    const deadPort = dead.port;
    await dead.close();

    const result = await probeStream(7, `rtsp://127.0.0.1:${deadPort}/stream`);
    expect(result.online).toBe(false);
  });

  it('probes again once the cache has been cleared', async () => {
    const server = await listen();
    const { port } = server;
    await probeStream(6, `rtsp://127.0.0.1:${port}/stream`);
    await server.close();

    clearProbeCache();

    const result = await probeStream(6, `rtsp://127.0.0.1:${port}/stream`);
    expect(result.online).toBe(false);
  });
});
