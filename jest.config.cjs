/**
 * Jest config for the unit test suite (`tests/unit`).
 *
 * Playwright owns `e2e/**` (see playwright.config.ts) — jest is scoped to the
 * unit directory so the two runners never compete for the same specs.
 * ts-jest transforms TypeScript with a commonjs override (the project
 * tsconfig targets `esnext` modules, which jest cannot execute directly).
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/unit"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "preserve",
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          allowJs: true,
        },
      },
    ],
  },
};
