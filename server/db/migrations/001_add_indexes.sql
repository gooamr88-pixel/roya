-- ═══════════════════════════════════════════════
-- Migration 001: Performance Indexes
-- FIX (A6): Add targeted indexes for frequently filtered/joined columns
-- 
-- Run: psql $DATABASE_URL -f server/db/migrations/001_add_indexes.sql
-- Safe: All CREATE INDEX IF NOT EXISTS — idempotent, re-runnable
-- ═══════════════════════════════════════════════

-- Orders: filtered by user + status, sorted by created_at
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC);

-- Users: login lookups, must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email);

-- Invoices: lookup by invoice number and order association
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);

-- Contact messages: admin filtering by status
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at_desc ON contact_messages(created_at DESC);

-- Notifications: user lookup + unread filtering
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- Login logs: sorted display in admin
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at_desc ON login_logs(created_at DESC);

-- Services: active service listing
CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active) WHERE is_active = TRUE;
