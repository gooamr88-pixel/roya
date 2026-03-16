// ═══════════════════════════════════════════════
// Integration Tests — Auth Routes (/api/auth/*)
//
// Tests the FULL HTTP flow through:
//   Request → Security Middleware → Rate Limiter → Validator →
//   Controller → Service → (mocked) Repository
//
// ✅ POST /register — validation, success, duplicate, rate limiting (429)
// ✅ POST /login — success with cookies, wrong creds, missing fields
// ✅ GET  /me — JWT enforcement, valid token, missing token, invalid token
// ✅ GET  /health — basic connectivity
// ═══════════════════════════════════════════════

// ── Mock repositories and external services BEFORE requiring the app ──
const mockUserRepo = {
    findByEmail: jest.fn(),
    findByEmailWithRole: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    getDefaultRoleId: jest.fn(),
    updateOtp: jest.fn(),
    markVerified: jest.fn(),
    updateFailedAttempts: jest.fn(),
    resetLoginState: jest.fn(),
    clearBan: jest.fn(),
    updateResetToken: jest.fn(),
    findByResetToken: jest.fn(),
    updatePassword: jest.fn(),
    getProfile: jest.fn(),
    getPasswordHash: jest.fn(),
    updateProfile: jest.fn(),
    updateAvatar: jest.fn(),
    updatePasswordHash: jest.fn(),
    getRefreshTokenHash: jest.fn(),
    getUserWithRole: jest.fn(),
};
jest.mock('../../server/repositories/user.repository', () => mockUserRepo);

const mockLoginLogRepo = {
    logSuccess: jest.fn(),
    logFailure: jest.fn(),
    logLogout: jest.fn(),
};
jest.mock('../../server/repositories/login-log.repository', () => mockLoginLogRepo);

jest.mock('../../server/services/email.service', () => ({
    sendOTP: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../server/services/notification.service', () => ({
    createNotification: jest.fn().mockResolvedValue(undefined),
    getNotifications: jest.fn().mockResolvedValue([]),
    markAsRead: jest.fn().mockResolvedValue(undefined),
}));

// ── Require app and test utilities ──
const request = require('supertest');
const app = require('../../server/app');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createMockUser } = require('../setup');

// ── Test JWT config (must match the mock config in setup.js) ──
const JWT_SECRET = 'test_access_secret_32chars_long!';
const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'roya-platform', audience: 'roya-api', expiresIn: '15m' };

/**
 * Helper — generate a valid access token JWT for a test user
 */
const generateTestToken = (userId = 1, role = 'client') => {
    return jwt.sign({ userId, role, type: 'access' }, JWT_SECRET, JWT_OPTIONS);
};

// ═══════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════

describe('Auth Routes — Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─────────────────────────────────────────
    // GET /api/health — basic connectivity
    // ─────────────────────────────────────────
    describe('GET /api/health', () => {
        it('should return 200 with status ok', async () => {
            const res = await request(app).get('/api/health');

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.timestamp).toBeDefined();
        });

        it('should include X-Request-Id header (from security middleware)', async () => {
            const res = await request(app).get('/api/health');

            expect(res.headers['x-request-id']).toBeDefined();
            // UUID v4 format
            expect(res.headers['x-request-id']).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );
        });

        it('should include Helmet security headers', async () => {
            const res = await request(app).get('/api/health');

            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.headers['x-frame-options']).toBe('DENY');
            expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
        });
    });

    // ─────────────────────────────────────────
    // POST /api/auth/register
    // ─────────────────────────────────────────
    describe('POST /api/auth/register', () => {
        const validBody = {
            name: 'Integration Test User',
            email: 'integration@test.com',
            phone: '+966512345678',
            password: 'Secure@123',
        };

        it('should register successfully and return 201 with userId', async () => {
            mockUserRepo.findByEmail.mockResolvedValue(null);
            mockUserRepo.getDefaultRoleId.mockResolvedValue(2);
            mockUserRepo.create.mockResolvedValue({
                id: 10,
                name: 'Integration Test User',
                email: 'integration@test.com',
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send(validBody);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.userId).toBe(10);
            expect(res.body.data.email).toBe('integration@test.com');
        });

        it('should return 400 for missing required fields (name)', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'test@test.com', password: 'Secure@123', phone: '+966512345678' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 400 for invalid email format', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ ...validBody, email: 'not-an-email' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 400 or 429 for weak password (no uppercase)', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ ...validBody, password: 'weak123!' });

            // May get 429 if rate limiter hit from previous tests
            expect([400, 429]).toContain(res.status);
            if (res.status === 400) {
                expect(res.body.error.code).toBe('VALIDATION_ERROR');
            }
        });

        it('should return 400 or 429 for invalid phone number', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ ...validBody, phone: '12' });

            expect([400, 429]).toContain(res.status);
            if (res.status === 400) {
                expect(res.body.error.code).toBe('VALIDATION_ERROR');
            }
        });

        it('should return 409 or 429 for duplicate email', async () => {
            mockUserRepo.findByEmail.mockResolvedValue(createMockUser());

            const res = await request(app)
                .post('/api/auth/register')
                .send(validBody);

            expect([409, 429]).toContain(res.status);
            if (res.status === 409) {
                expect(res.body.error.code).toBe('EMAIL_EXISTS');
            }
        });
    });

    // ─────────────────────────────────────────
    // POST /api/auth/register — Rate Limiting
    // ─────────────────────────────────────────
    describe('POST /api/auth/register — Rate Limiting (429)', () => {
        it('should return 429 after exceeding registration rate limit', async () => {
            // The registerLimiter allows 3 per hour per IP.
            // Previous tests already used some quota.
            // Keep sending until we get 429.
            mockUserRepo.findByEmail.mockResolvedValue(null);
            mockUserRepo.getDefaultRoleId.mockResolvedValue(2);
            mockUserRepo.create.mockResolvedValue({ id: 99, name: 'X', email: 'x@test.com' });

            let lastRes;
            for (let i = 0; i < 10; i++) {
                lastRes = await request(app)
                    .post('/api/auth/register')
                    .send({
                        name: 'RateTest',
                        email: `rate${i}@test.com`,
                        phone: '+966512345678',
                        password: 'Secure@123',
                    });

                if (lastRes.status === 429) break;
            }

            expect(lastRes.status).toBe(429);
            expect(lastRes.body.error.code).toBe('RATE_LIMIT');
        });
    });

    // ─────────────────────────────────────────
    // POST /api/auth/login
    // ─────────────────────────────────────────
    describe('POST /api/auth/login', () => {
        let validHash;
        beforeAll(async () => {
            validHash = await bcrypt.hash('Secure@123', 12);
        });

        it('should login successfully and set HttpOnly cookies', async () => {
            mockUserRepo.findByEmailWithRole.mockResolvedValue(createMockUser({
                password_hash: validHash,
            }));
            mockUserRepo.resetLoginState.mockResolvedValue(undefined);
            mockLoginLogRepo.logSuccess.mockResolvedValue(undefined);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', password: 'Secure@123' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.user.email).toBe('test@example.com');

            // Verify HttpOnly cookies are set
            const cookies = res.headers['set-cookie'];
            expect(cookies).toBeDefined();
            expect(cookies.length).toBeGreaterThanOrEqual(1);

            const accessCookie = cookies.find(c => c.startsWith('access_token='));
            expect(accessCookie).toBeDefined();
            expect(accessCookie).toContain('HttpOnly');
        });

        it('should return 400 for missing email', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ password: 'Secure@123' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 400 for missing password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 401 for wrong password', async () => {
            mockUserRepo.findByEmailWithRole.mockResolvedValue(createMockUser({
                password_hash: validHash,
            }));
            mockUserRepo.updateFailedAttempts.mockResolvedValue(undefined);
            mockLoginLogRepo.logFailure.mockResolvedValue(undefined);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', password: 'WrongPass@123' });

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        });

        it('should return 401 for non-existent user', async () => {
            mockUserRepo.findByEmailWithRole.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'ghost@test.com', password: 'Secure@123' });

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        });
    });

    // ─────────────────────────────────────────
    // GET /api/auth/me — JWT Enforcement
    // ─────────────────────────────────────────
    describe('GET /api/auth/me', () => {
        it('should return 401 when no JWT cookie is provided', async () => {
            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('AUTH_REQUIRED');
        });

        it('should return 401 for an invalid/tampered JWT', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', ['access_token=tampered.invalid.token']);

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('INVALID_TOKEN');
        });

        it('should return 401 for an expired JWT', async () => {
            const expiredToken = jwt.sign(
                { userId: 1, role: 'client', type: 'access' },
                JWT_SECRET,
                { ...JWT_OPTIONS, expiresIn: '0s' } // Immediately expired
            );

            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', [`access_token=${expiredToken}`]);

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('TOKEN_EXPIRED');
        });

        it('should return 401 for JWT signed with wrong secret', async () => {
            const badToken = jwt.sign(
                { userId: 1, role: 'client', type: 'access' },
                'wrong_secret_key_totally_different',
                JWT_OPTIONS
            );

            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', [`access_token=${badToken}`]);

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('INVALID_TOKEN');
        });

        it('should return 200 with user data for a valid JWT', async () => {
            const validToken = generateTestToken(1, 'client');

            mockUserRepo.findById.mockResolvedValue(createMockUser({
                id: 1,
                name: 'Auth User',
                email: 'auth@example.com',
                role: 'client',
                permissions_json: [],
            }));

            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', [`access_token=${validToken}`]);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.user.email).toBe('auth@example.com');
            expect(res.body.data.user.role).toBe('client');
        });

        it('should return 403 for a banned user even with valid JWT', async () => {
            const validToken = generateTestToken(2, 'client');

            mockUserRepo.findById.mockResolvedValue(createMockUser({
                id: 2,
                is_active: false,
                ban_type: 'permanent',
            }));

            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', [`access_token=${validToken}`]);

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('ACCOUNT_BANNED');
        });

        it('should return 403 for an unverified user', async () => {
            const validToken = generateTestToken(3, 'client');

            mockUserRepo.findById.mockResolvedValue(createMockUser({
                id: 3,
                is_verified: false,
            }));

            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', [`access_token=${validToken}`]);

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
        });
    });

    // ─────────────────────────────────────────
    // 404 — Non-existent API endpoint
    // ─────────────────────────────────────────
    describe('Non-existent API endpoint', () => {
        it('should return 404 JSON for unknown API routes', async () => {
            const res = await request(app).get('/api/does-not-exist');

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
    });
});
