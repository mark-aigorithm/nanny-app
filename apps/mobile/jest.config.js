module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // The first test in a suite pays jest-expo's transform cost on a cold cache,
  // which alone can exceed Jest's 5s default and fail an otherwise fine test.
  testTimeout: 15000,
};
