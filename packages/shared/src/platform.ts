// ──────────────────────────────────────────────────────────────
// Platform-wide constants
// ──────────────────────────────────────────────────────────────

/**
 * The single market NannyApp operates in. Every booking wall-clock time —
 * what a parent picks, the daily booking window, the admin's booking editor —
 * is expressed in this zone. The database stores true UTC; this is the zone
 * everything is converted to for display and back from for storage.
 *
 * IANA name (not a fixed offset) because Egypt observes DST: the offset moves
 * between +02:00 and +03:00.
 *
 * This module must stay dependency-free — mobile imports it, and the timezone
 * database lives only on the backend (see `platform-time.ts`).
 */
export const PLATFORM_TIMEZONE = 'Africa/Cairo';
