import type { Config } from 'jest';
const config: Config = {
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', useESM: true }] },
  testEnvironment: 'node',
  moduleNameMapper: { '^~/(.*)$': '<rootDir>/src/$1' },
};
export default config;
