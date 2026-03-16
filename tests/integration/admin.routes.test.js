// ═══════════════════════════════════════════════
// Integration Tests — Admin Routes (/api/admin/*)
//
// Tests the strict RBAC middleware chain:
//   Request → Security → Rate Limiter → authenticate →
//   authorize('super_admin','admin','supervisor') → checkPermission →
//   Controller → Service → (mocked) Repository
//
// ✅ No auth → 401
// ✅ Client role → 403 Forbidden
// ✅ Admin role → 200 OK
// ✅ Supervisor role → 200 for read, 403 for write
// ✅ Super admin → 200 for everything
// ✅ Permission checks (manage_users, manage_roles, etc.)
// ═══════════════════════════════════════════════

// ── Mock repositories and services ──
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

const mockAdminRepo = {
    getStats: jest.fn(),
    getDashboardStats: jest.fn(),
    getUserCount: jest.fn(),
    getOrderCount: jest.fn(),
    getRevenueTotal: jest.fn(),
    getRecentOrders: jest.fn(),
    getUsers: jest.fn(),
    getUsersPaginated: jest.fn(),
    updateUserRole: jest.fn(),
    updateUserStatus: jest.fn(),
    getRoles: jest.fn(),
    updateRolePermissions: jest.fn(),
    getLoginLogs: jest.fn(),
    clearLoginLogs: jest.fn(),
    globalSearch: jest.fn(),
    getMessages: jest.fn(),
    getMessageById: jest.fn(),
    replyToMessage: jest.fn(),
    updateMessageNote: jest.fn(),
    deleteMessage: jest.fn(),
};
jest.mock('../../server/repositories/admin.repository', () => mockAdminRepo);

const mockLoginLogRepo = {
    logSuccess: jest.fn(),
    logFailure: jest.fn(),
    logLogout: jest.fn(),
    findAll: jest.fn(),
    clearAll: jest.fn(),
};
jest.mock('../../server/repositories/login-log.repository', () => mockLoginLogRepo);

const mockOrderRepo = {
    getRecentOrders: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    cancel: jest.fn(),
    deleteOrder: jest.fn(),
};
jest.mock('../../server/repositories/order.repository', () => mockOrderRepo);

const mockContactRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    reply: jest.fn(),
    updateNote: jest.fn(),
    delete: jest.fn(),
};
jest.mock('../../server/repositories/contact.repository', () => mockContactRepo);

jest.mock('../../server/services/email.service', () => ({
    sendOTP: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    sendReply: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../server/services/notification.service', () => ({
    createNotification: jest.fn().mockResolvedValue(undefined),
    getNotifications: jest.fn().mockResolvedValue([]),
    markAsRead: jest.fn().mockResolvedValue(undefined),
}));

// ── Require app and utilities ──
const request = require('supertest');
const app = require('../../server/app');
const jwt = require('jsonwebtoken');
const { createMockUser } = require('../setup');

// ── JWT helpers ──
const JWT_SECRET = 'test_access_secret_32chars_long!';
const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'roya-platform', audience: 'roya-api', expiresIn: '15m' };

const generateTestToken = (userId, role) => {
    return jwt.sign({ userId, role, type: 'access' }, JWT_SECRET, JWT_OPTIONS);
};

/**
 * Setup findById mock for authenticate middleware.
 * Returns a user with the given role and permissions.
 */
const setupAuthUser = (role, permissions = []) => {
    mockUserRepo.findById.mockResolvedValue(createMockUser({
        id: 1,
        role,
        permissions_json: permissions,
        is_active: true,
        is_verified: true,
    }));
};

// ═══════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════

describe('Admin Routes — RBAC Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─────────────────────────────────────────
    // Authentication Gate
    // ─────────────────────────────────────────
    describe('Authentication Gate', () => {
        it('should return 401 when no JWT cookie is provided', async () => {
            const res = await request(app).get('/api/admin/stats');

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('AUTH_REQUIRED');
        });

        it('should return 401 for an invalid JWT', async () => {
            const res = await request(app)
                .get('/api/admin/stats')
                .set('Cookie', ['access_token=invalid.token.here']);

            expect(res.status).toBe(401);
        });
    });

    // ─────────────────────────────────────────
    // Role Gate — Client gets 403
    // ─────────────────────────────────────────
    describe('Role Gate — Client Forbidden', () => {
        it('should return 403 for a user with client role', async () => {
            const clientToken = generateTestToken(1, 'client');
            setupAuthUser('client');

            const res = await request(app)
                .get('/api/admin/stats')
                .set('Cookie', [`access_token=${clientToken}`]);

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
        });

        it('should return 403 for client trying to access /api/admin/users', async () => {
            const clientToken = generateTestToken(1, 'client');
            setupAuthUser('client');

            const res = await request(app)
                .get('/api/admin/users')
                .set('Cookie', [`access_token=${clientToken}`]);

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
        });

        it('should return 403 for client trying to access /api/admin/logs', async () => {
            const clientToken = generateTestToken(1, 'client');
            setupAuthUser('client');

            const res = await request(app)
                .get('/api/admin/logs')
                .set('Cookie', [`access_token=${clientToken}`]);

            expect(res.status).toBe(403);
        });
    });

    // ─────────────────────────────────────────
    // Admin Role — 200 OK (with correct permissions)
    // ─────────────────────────────────────────
    describe('Admin Role — 200 OK', () => {
        it('should return 200 for admin accessing /api/admin/stats', async () => {
            const adminToken = generateTestToken(1, 'admin');
            setupAuthUser('admin', ['all']);

            mockAdminRepo.getStats.mockResolvedValue({
                totalUsers: 100,
                totalOrders: 50,
                totalRevenue: 5000,
                totalServices: 20,
                totalUsersWithOrders: 30,
            });
            mockOrderRepo.getRecentOrders.mockResolvedValue([]);

            const res = await request(app)
                .get('/api/admin/stats')
                .set('Cookie', [`access_token=${adminToken}`]);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 200 for admin accessing /api/admin/users', async () => {
            const adminToken = generateTestToken(1, 'admin');
            setupAuthUser('admin', ['manage_users']);

            mockAdminRepo.getUsers.mockResolvedValue({
                data: [createMockUser()],
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            });

            const res = await request(app)
                .get('/api/admin/users')
                .set('Cookie', [`access_token=${adminToken}`]);

            expect(res.status).toBe(200);
        });

        it('should return 200 for admin accessing /api/admin/search', async () => {
            const adminToken = generateTestToken(1, 'admin');
            setupAuthUser('admin', ['all']);

            mockAdminRepo.globalSearch.mockResolvedValue({
                users: [], orders: [], services: [],
            });

            const res = await request(app)
                .get('/api/admin/search?q=test')
                .set('Cookie', [`access_token=${adminToken}`]);

            expect(res.status).toBe(200);
        });
    });

    // ─────────────────────────────────────────
    // Supervisor Role — Partial Access
    // ─────────────────────────────────────────
    describe('Supervisor Role — Partial Access', () => {
        it('should allow supervisor to read /api/admin/stats', async () => {
            const supervisorToken = generateTestToken(1, 'supervisor');
            setupAuthUser('supervisor', ['all']);

            mockAdminRepo.getStats.mockResolvedValue({
                totalUsers: 50, totalOrders: 25, totalRevenue: 2500, totalServices: 10, totalUsersWithOrders: 15,
            });
            mockOrderRepo.getRecentOrders.mockResolvedValue([]);

            const res = await request(app)
                .get('/api/admin/stats')
                .set('Cookie', [`access_token=${supervisorToken}`]);

            expect(res.status).toBe(200);
        });

        it('should deny supervisor from updating users (requires super_admin)', async () => {
            const supervisorToken = generateTestToken(1, 'supervisor');
            setupAuthUser('supervisor', ['manage_users']);

            const res = await request(app)
                .put('/api/admin/users/1')
                .set('Cookie', [`access_token=${supervisorToken}`])
                .send({ role_id: 3 });

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
        });

        it('should deny supervisor from accessing /api/admin/logs (requires super_admin)', async () => {
            const supervisorToken = generateTestToken(1, 'supervisor');
            setupAuthUser('supervisor', ['view_logs']);

            const res = await request(app)
                .get('/api/admin/logs')
                .set('Cookie', [`access_token=${supervisorToken}`]);

            expect(res.status).toBe(403);
        });
    });

    // ─────────────────────────────────────────
    // Super Admin — Full Access
    // ─────────────────────────────────────────
    describe('Super Admin — Full Access', () => {
        it('should allow super_admin to access /api/admin/stats', async () => {
            const superToken = generateTestToken(1, 'super_admin');
            setupAuthUser('super_admin', ['all']);

            mockAdminRepo.getStats.mockResolvedValue({
                totalUsers: 200, totalOrders: 100, totalRevenue: 10000, totalServices: 30, totalUsersWithOrders: 80,
            });
            mockOrderRepo.getRecentOrders.mockResolvedValue([]);

            const res = await request(app)
                .get('/api/admin/stats')
                .set('Cookie', [`access_token=${superToken}`]);

            expect(res.status).toBe(200);
        });

        it('should allow super_admin to access /api/admin/logs', async () => {
            const superToken = generateTestToken(1, 'super_admin');
            setupAuthUser('super_admin', ['all']);

            mockLoginLogRepo.findAll.mockResolvedValue({
                rows: [],
                total: 0,
            });

            const res = await request(app)
                .get('/api/admin/logs')
                .set('Cookie', [`access_token=${superToken}`]);

            expect(res.status).toBe(200);
        });

        it('should allow super_admin to access /api/admin/roles', async () => {
            const superToken = generateTestToken(1, 'super_admin');
            setupAuthUser('super_admin', ['all']);

            mockAdminRepo.getRoles.mockResolvedValue([
                { id: 1, name: 'super_admin', permissions_json: ['all'] },
                { id: 2, name: 'client', permissions_json: [] },
            ]);

            const res = await request(app)
                .get('/api/admin/roles')
                .set('Cookie', [`access_token=${superToken}`]);

            expect(res.status).toBe(200);
        });
    });

    // ─────────────────────────────────────────
    // Permission Checks
    // ─────────────────────────────────────────
    describe('Permission Checks', () => {
        it('should deny admin without manage_users permission from /api/admin/users', async () => {
            const adminToken = generateTestToken(1, 'admin');
            setupAuthUser('admin', ['manage_roles']); // Has roles, NOT users

            const res = await request(app)
                .get('/api/admin/users')
                .set('Cookie', [`access_token=${adminToken}`]);

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        it('should deny admin without manage_messages from /api/admin/messages', async () => {
            const adminToken = generateTestToken(1, 'admin');
            setupAuthUser('admin', ['manage_users']); // Has users, NOT messages

            const res = await request(app)
                .get('/api/admin/messages')
                .set('Cookie', [`access_token=${adminToken}`]);

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        it('should allow admin with manage_messages to access /api/admin/messages', async () => {
            const adminToken = generateTestToken(1, 'admin');
            setupAuthUser('admin', ['manage_messages']);

            mockAdminRepo.getMessages.mockResolvedValue({
                data: [],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
            });

            const res = await request(app)
                .get('/api/admin/messages')
                .set('Cookie', [`access_token=${adminToken}`]);

            expect(res.status).toBe(200);
        });

        it('should allow "all" permission to bypass any specific permission check', async () => {
            const adminToken = generateTestToken(1, 'admin');
            setupAuthUser('admin', ['all']);

            mockAdminRepo.getUsers.mockResolvedValue({
                data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
            });

            const res = await request(app)
                .get('/api/admin/users')
                .set('Cookie', [`access_token=${adminToken}`]);

            expect(res.status).toBe(200);
        });
    });

    // ─────────────────────────────────────────
    // Edge Cases
    // ─────────────────────────────────────────
    describe('Edge Cases', () => {
        it('should return 404 JSON for non-existent admin sub-route', async () => {
            const adminToken = generateTestToken(1, 'admin');
            setupAuthUser('admin', ['all']);

            const res = await request(app)
                .get('/api/admin/nonexistent')
                .set('Cookie', [`access_token=${adminToken}`]);

            expect(res.status).toBe(404);
        });

        it('should validate :id param as integer for PUT /api/admin/users/:id', async () => {
            const superToken = generateTestToken(1, 'super_admin');
            setupAuthUser('super_admin', ['all']);

            const res = await request(app)
                .put('/api/admin/users/abc')
                .set('Cookie', [`access_token=${superToken}`])
                .send({ role_id: 2 });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });
    });
});
