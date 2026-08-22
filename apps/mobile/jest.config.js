module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Jest defaults to one worker per CPU core, and jest-expo's transform makes
  // each worker expensive. Uncapped on a many-core machine this suite alone can
  // exhaust system memory — and Turborepo may be running the other packages'
  // suites alongside it.
  maxWorkers: 4,
  workerIdleMemoryLimit: '512MB',
  // The first test in a suite pays jest-expo's transform cost on a cold cache,
  // which alone can exceed Jest's 5s default and fail an otherwise fine test.
  testTimeout: 15000,
};
