// ═══════════════════════════════════════════════
// Test Setup — Global jest setup + mock factories
//
// This file provides:
// ✅ Mock factories for all external dependencies
// ✅ DB mock (prevents real database connections)
// ✅ Service mock builders for token, email, notification
// ✅ Test data factories (users, orders, etc.)
// ✅ Custom Jest matchers / helpers
// ═══════════════════════════════════════════════

// ── Suppress console output during tests ──
// Comment out these lines to see logs while debugging
beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

// ═══════════════════════════════════════════════
// Mock: Database (config/database)
// ═══════════════════════════════════════════════
jest.mock('../server/config/database', () => ({
    query: jest.fn(),
    getClient: jest.fn(),
    withTransaction: jest.fn((fn) => fn({ query: jest.fn() })),
    pool: {
        end: jest.fn(),
        on: jest.fn(),
    },
}));

// ═══════════════════════════════════════════════
// Mock: Config
// ═══════════════════════════════════════════════
jest.mock('../server/config', () => ({
    port: 3000,
    nodeEnv: 'test',
    isDev: false,
    baseUrl: 'http://localhost:3000',
    jwt: {
        accessSecret: 'test_access_secret_32chars_long!',
        refreshSecret: 'test_refresh_secret_32chars_long!',
        accessExpiry: '15m',
        refreshExpiry: '7d',
    },
    email: {
        host: 'smtp.test.com',
        port: 587,
        user: 'test@test.com',
        pass: 'test',
        from: 'Test <noreply@test.com>',
    },
    security: {
        csrfSecret: 'test_csrf_secret',
        cookieDomain: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
    },
    cloudinary: {
        cloudName: 'test',
        apiKey: 'test',
        apiSecret: 'test',
    },
    superAdmin: {
        name: 'Test Admin',
        email: 'admin@test.com',
        phone: '+966500000000',
        password: 'Admin@123456',
    },
}));

// ═══════════════════════════════════════════════
// Test Data Factories
// ═══════════════════════════════════════════════

/**
 * Create a mock user object with sensible defaults.
 * Override any field by passing an object.
 */
const createMockUser = (overrides = {}) => ({
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    phone: '+966512345678',
    password_hash: '$2a$12$hashedPasswordHere',  // bcrypt hash
    is_active: true,
    is_verified: true,
    failed_login_attempts: 0,
    locked_until: null,
    ban_type: null,
    ban_expires_at: null,
    otp_code: '123456',
    otp_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    role: 'client',
    role_id: 2,
    permissions_json: [],
    refresh_token_hash: null,
    last_login: null,
    created_at: new Date().toISOString(),
    avatar_url: null,
    ...overrides,
});

/**
 * Create a mock order.
 */
const createMockOrder = (overrides = {}) => ({
    id: 1,
    user_id: 1,
    service_id: 1,
    service_title: 'Test Service',
    price: 100.00,
    status: 'pending',
    notes: null,
    invoice_number: 'INV-123456-ABC123',
    created_at: new Date().toISOString(),
    updated_at: null,
    ...overrides,
});

/**
 * Create a mock service.
 */
const createMockService = (overrides = {}) => ({
    id: 1,
    title: 'Test Service',
    description: 'A test service',
    price: 100.00,
    images: '[]',
    category: 'general',
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
});

/**
 * Create a mock role.
 */
const createMockRole = (overrides = {}) => ({
    id: 2,
    name: 'client',
    permissions_json: [],
    created_at: new Date().toISOString(),
    ...overrides,
});

// ═══════════════════════════════════════════════
// Custom assertion helpers
// ═══════════════════════════════════════════════

/**
 * Assert that an async function throws an AppError with the given code.
 */
const expectAppError = async (fn, expectedCode, expectedStatus) => {
    try {
        await fn();
        throw new Error(`Expected AppError with code "${expectedCode}" but function did not throw`);
    } catch (err) {
        expect(err.isOperational).toBe(true);
        expect(err.code).toBe(expectedCode);
        if (expectedStatus) {
            expect(err.statusCode).toBe(expectedStatus);
        }
        return err;
    }
};

// ═══════════════════════════════════════════════
// Exports — available to all test files
// ═══════════════════════════════════════════════
module.exports = {
    createMockUser,
    createMockOrder,
    createMockService,
    createMockRole,
    expectAppError,
};
