/**
 * jest-expo provides the React Native + Expo module mocks. `transformIgnorePatterns`
 * has to allow the RN/Expo packages through babel, and the workspace `packages/`
 * folder too, since @deutschlearnen/shared is resolved from the repo root.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@deutschlearnen/.*)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // npm hoists a second React to the workspace root (Expo's internal packages
    // declare a `react: *` peer). Under Jest that means react-test-renderer
    // loads one copy while our components load another, and every hook returns
    // null. Pin every `react` request to the single copy Expo SDK 57 installed
    // here. `overrides` in the root package.json does not fix this on npm 11.
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
};
