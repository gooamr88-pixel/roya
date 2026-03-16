// ═══════════════════════════════════════════════
// Jest Configuration — Roya Platform
// ═══════════════════════════════════════════════
module.exports = {
    // Node.js environment (not browser)
    testEnvironment: 'node',

    // Root directory for tests
    roots: ['<rootDir>/tests'],

    // Test file patterns
    testMatch: [
        '**/*.test.js',
        '**/*.spec.js',
    ],

    // Setup files — runs BEFORE each test suite (no Jest globals available)
    // Only for jest.mock() calls and module-level config
    setupFiles: ['<rootDir>/tests/setup.js'],

    // Coverage configuration
    collectCoverageFrom: [
        'server/**/*.js',
        '!server/server.js',
        '!server/config/**',
        '!server/db/**',
        '!server/middlewares/i18n.js',
        '!server/middlewares/logger.js',
    ],

    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },

    // Coverage output
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text', 'text-summary', 'lcov'],

    // Timeout for async tests (ms)
    testTimeout: 10000,

    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,

    // Module directories
    moduleDirectories: ['node_modules', 'server'],

    // Verbose output
    verbose: true,
};
