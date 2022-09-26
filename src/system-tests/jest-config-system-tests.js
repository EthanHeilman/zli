toExport = {
    rootDir: './../', // zli/src
    roots: [
        "<rootDir>/system-tests/tests"
    ],
    testRegex: 'src/system-tests/tests/system-test.ts',
    transform: {
        "^.+\\.(ts|tsx)$": "ts-jest"
    },
    globals: {
        Uint8Array: Uint8Array,
    },
    reporters: [
        "default",
        "<rootDir>/../dist/src/system-tests/daemon-log-reporter"
    ],
    setupFilesAfterEnv: ["jest-extended/all"],
    collectCoverage: true,
    collectCoverageFrom: [
        "**/*.ts",
        "!system-tests/**",
    ],
    coverageDirectory: 'coverage-system-tests',
    verbose: true
};

if (process.env.BZERO_PROD == 'true') {
    toExport.reporters.push(["jest-2-testrail", { project_id: "2", suite_id: "9" }]);
};


module.exports = toExport;