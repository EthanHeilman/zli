toExport = {
  roots: [
    "<rootDir>/"
  ],
  testMatch: [
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
  globals: {
    Uint8Array: Uint8Array,
  },
  reporters: [
    "default"
  ],
  collectCoverage: true,
  collectCoverageFrom: [
      "**/*.ts",
      "!system-tests/**",
  ],
  coverageDirectory: 'coverage-unit-tests',
};

if (process.env.BZERO_PROD == 'true') {
  toExport.reporters.push(["jest-2-testrail", { project_id: "2", suite_id: "9" }]);
};

module.exports = toExport;