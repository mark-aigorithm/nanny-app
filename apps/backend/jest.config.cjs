/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@backend/(.*)$': '<rootDir>/src/$1',
    '^@nanny-app/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
};
