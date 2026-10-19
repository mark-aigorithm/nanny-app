import { describe, expect, it } from 'vitest';

import {
  AppVersionCheckQuerySchema,
  compareVersions,
  CreateAppReleaseSchema,
  isSemver,
  UpdateAppReleaseSchema,
} from '../app-release';

describe('compareVersions', () => {
  it('orders by numeric segment, not by string', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns null when either side is not x.y.z', () => {
    expect(compareVersions('1.4', '1.4.0')).toBeNull();
    expect(compareVersions('1.4.0', '1.4.0-beta')).toBeNull();
    expect(compareVersions('', '1.0.0')).toBeNull();
  });
});

describe('isSemver', () => {
  it('accepts only three numeric segments', () => {
    expect(isSemver('0.0.1')).toBe(true);
    expect(isSemver('10.20.30')).toBe(true);
    expect(isSemver('1.4')).toBe(false);
    expect(isSemver('v1.4.0')).toBe(false);
    expect(isSemver('1.4.0 ')).toBe(false);
  });
});

describe('CreateAppReleaseSchema', () => {
  it('accepts a valid release and defaults mandatory to false', () => {
    const parsed = CreateAppReleaseSchema.parse({ platform: 'ios', version: '1.4.0' });
    expect(parsed).toEqual({ platform: 'ios', version: '1.4.0', mandatory: false });
  });

  it('rejects a non-semver version and an unknown platform', () => {
    expect(CreateAppReleaseSchema.safeParse({ platform: 'ios', version: '1.4' }).success).toBe(false);
    expect(CreateAppReleaseSchema.safeParse({ platform: 'IOS', version: '1.4.0' }).success).toBe(false);
  });

  it('caps release notes at 1000 characters', () => {
    const notes = 'x'.repeat(1001);
    expect(
      CreateAppReleaseSchema.safeParse({ platform: 'android', version: '1.0.0', releaseNotes: notes }).success,
    ).toBe(false);
  });
});

describe('UpdateAppReleaseSchema', () => {
  it('needs at least one field and ignores platform/version', () => {
    expect(UpdateAppReleaseSchema.safeParse({}).success).toBe(false);
    expect(UpdateAppReleaseSchema.parse({ mandatory: true, version: '9.9.9' })).toEqual({ mandatory: true });
    expect(UpdateAppReleaseSchema.parse({ releaseNotes: null })).toEqual({ releaseNotes: null });
  });
});

describe('AppVersionCheckQuerySchema', () => {
  it('accepts any version string so garbage can fail open downstream', () => {
    expect(AppVersionCheckQuerySchema.parse({ platform: 'android', version: '1.4' })).toEqual({
      platform: 'android',
      version: '1.4',
    });
  });

  it('rejects an unknown platform', () => {
    expect(AppVersionCheckQuerySchema.safeParse({ platform: 'web', version: '1.0.0' }).success).toBe(false);
  });
});
