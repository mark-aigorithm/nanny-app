import { compareVersions, type AppPlatform, type AppRelease } from '@nanny-app/shared';

import { Card } from '@admin/components/ui';
import { PLATFORM_LABELS } from '@admin/features/app-releases/app-release-form';
import { formatDate } from '@admin/lib/format';

export type PlatformReleaseState = {
  /** The newest release recorded: anyone below it is offered an update. */
  latest: AppRelease | null;
  /** The newest mandatory release: anyone below it is blocked. */
  minimum: AppRelease | null;
};

/** The same rule the backend's version check applies, per platform. */
export function platformReleaseState(releases: AppRelease[], platform: AppPlatform): PlatformReleaseState {
  const newestFirst = releases
    .filter((r) => r.platform === platform)
    .sort((a, b) => compareVersions(b.version, a.version) ?? 0);
  return {
    latest: newestFirst[0] ?? null,
    minimum: newestFirst.find((r) => r.mandatory) ?? null,
  };
}

/** What a phone sees today, in words, from the latest and minimum releases. */
function whatUsersSee({ latest, minimum }: PlatformReleaseState): string {
  if (!latest) return 'No releases recorded, so the app never asks anyone to update.';
  if (!minimum) return `Below ${latest.version}: a prompt they can dismiss. Nobody is blocked.`;
  if (minimum.id === latest.id) return `Below ${latest.version}: blocked until they update.`;
  return `Below ${minimum.version}: blocked until they update. Below ${latest.version}: a prompt they can dismiss.`;
}

/** One platform's current state: its latest release, its minimum, and what that means for users. */
export function ReleaseStatusCard({ platform, releases }: { platform: AppPlatform; releases: AppRelease[] }) {
  const state = platformReleaseState(releases, platform);
  const { latest, minimum } = state;
  return (
    <Card className="release-status">
      <h3 className="release-status-platform">{PLATFORM_LABELS[platform]}</h3>
      <dl className="release-status-facts">
        <div>
          <dt>Latest</dt>
          <dd>
            <span className="release-status-version">{latest?.version ?? '—'}</span>
            {latest && <span className="release-status-date">Recorded {formatDate(latest.createdAt)}</span>}
          </dd>
        </div>
        <div>
          <dt>Minimum required</dt>
          <dd>
            <span className="release-status-version">{minimum?.version ?? 'None'}</span>
          </dd>
        </div>
      </dl>
      <p className="release-status-summary">{whatUsersSee(state)}</p>
    </Card>
  );
}
