import net from 'node:net';

/**
 * Cheap liveness check for an RTSP camera.
 *
 * We open a TCP connection to the camera's host/port and see whether it
 * answers. This tells us the camera is powered on and reachable — it does NOT
 * tell us a stream is actually being published. A camera that is on but idle
 * reads as online. That's a deliberate trade: a real check means speaking RTSP
 * (DESCRIBE) or shelling out to ffmpeg, and neither is worth it just to colour
 * a status dot.
 */

/** Default RTSP port, used when the URL doesn't specify one. */
const DEFAULT_RTSP_PORT = 554;

/** How long to wait for the TCP handshake before calling it offline. */
const PROBE_TIMEOUT_MS = 2_000;

/** How long a probe result stays good for. Parents pull-to-refresh; without
 *  this, every refresh redials the camera. */
const CACHE_TTL_MS = 15_000;

export interface ProbeResult {
  /** true/false when we could dial the host; null when the URL didn't parse. */
  online: boolean | null;
  checkedAt: Date;
}

// Keyed on id AND url: an admin repointing a camera must not keep reading the
// old host's result for the rest of the TTL.
const cache = new Map<string, ProbeResult>();

function parseTarget(streamUrl: string): { host: string; port: number } | null {
  try {
    const url = new URL(streamUrl);
    if (!url.hostname) return null;
    const port = url.port ? Number(url.port) : DEFAULT_RTSP_PORT;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
    return { host: url.hostname, port };
  } catch {
    return null;
  }
}

/** Resolves true if the TCP handshake completes within the timeout. Never
 *  rejects — an unreachable camera is an expected outcome, not an error. */
function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * Probe a camera, reusing a recent result when one is available.
 * `cameraId` is only used as the cache key.
 */
export async function probeStream(
  cameraId: number,
  streamUrl: string,
): Promise<ProbeResult> {
  const key = `${cameraId}:${streamUrl}`;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.checkedAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  const target = parseTarget(streamUrl);
  const result: ProbeResult = {
    online: target ? await canConnect(target.host, target.port) : null,
    checkedAt: new Date(),
  };

  cache.set(key, result);
  return result;
}

/** Test seam — drops memoised results so probes run for real. */
export function clearProbeCache(): void {
  cache.clear();
}
