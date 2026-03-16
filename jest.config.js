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

    // Run setup before each test suite
    setupFiles: ['<rootDir>/tests/setup.js'],

    // Coverage configuration
    collectCoverageFrom: [
        'server/**/*.js',
        '!server/server.js',        // Entry point (tested via Supertest)
        '!server/config/**',         // Config files
        '!server/db/**',             // Migration/seed scripts
        '!server/middlewares/i18n.js', // i18n (UI concern)
        '!server/middlewares/logger.js',
    ],

    // Coverage thresholds — enforce minimum coverage
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

    // Module name mapper (if needed for path aliases)
    moduleDirectories: ['node_modules', 'server'],

    // Verbose output
    verbose: true,
};
