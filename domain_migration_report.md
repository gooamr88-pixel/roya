# 🔍 Domain Dependency Impact Report
## `eventwaw.com` → `eventsli.com` Migration Deep-Scan

> **Scan Date:** 2026-05-09 · **Auditor Role:** Principal DevSecOps Engineer  
> **Scope:** Full codebase — Frontend, Edge Functions, Config, Tests, SQL  
> **Status:** ⚠️ AUDIT ONLY — No code changes applied

---

## Executive Summary

The codebase has **already been partially migrated** to `eventsli.com`. Zero references to `eventwaw.com` exist in active runtime code. However, **significant technical debt** remains:

| Category | Findings | Severity |
|----------|----------|----------|
| **Hardcoded `eventsli.com` fallbacks** in Edge Functions | 7 instances | 🔴 Critical |
| **CORS: Legacy Vercel slug** (`event-waw-platform`) still whitelisted | 2 instances | 🟡 Medium |
| **`robots.txt`:** Stale old-domain sitemap + legacy branding | 2 lines | 🟡 Medium |
| **Email addresses** (`@eventsli.com`) hardcoded as fallbacks | 3 Edge Functions | 🟠 High |
| **Frontend email/brand refs** scattered across HTML | 14+ pages | 🟢 Low (already correct) |
| **SQL migrations:** Legacy "EVENT WAW" comments | 16 files | ⚪ Cosmetic |
| **No `og:url` or `<link rel="canonical">`** on any page | All HTML | 🟡 Medium (SEO) |
| **CSP policy** references no domain — clean | ✅ | ✅ Clean |

> [!IMPORTANT]
> The actual old domain `eventwaw.com` is **fully purged** from runtime code. The migration target is now about **hardening the `eventsli.com` references** to be environment-variable-driven rather than hardcoded, cleaning up the legacy Vercel project slug, and updating SEO/infrastructure files.

---

## PART 1: The Impact Report

---

### 🔴 Category A — Edge Functions: Hardcoded Domain Fallbacks

These are the **highest-severity findings**. Every hardcoded `eventsli.com` string in a Stripe-critical Edge Function is a domain migration landmine. If env vars are ever misconfigured, these fallbacks silently take over.

#### A1. CORS Shared Module
**File:** [cors.ts](file:///c:/Users/yousef%20amr/Desktop/events%20platform/supabase/functions/_shared/cors.ts)

| Line | Content | Risk |
|------|---------|------|
| 10 | `'https://eventsli.com'` | Hardcoded primary origin in `ALLOWED_ORIGINS` array |
| 11 | `'https://www.eventsli.com'` | Hardcoded www variant |
| 12 | `'https://event-waw-platform.vercel.app'` | **Legacy Vercel slug still whitelisted** ⚠️ |
| 36 | Regex: `event-waw-platform` preview URL pattern | **Allows all preview deployments of OLD project** ⚠️ |

> [!WARNING]
> **CORS Security Finding:** Line 33 allows `origin === 'null'` (returns `true`). This is intentional for `file://` protocol but is a known attack vector if not carefully handled. The `null` origin bypass is properly scoped (no wildcard `*` returned, no credentials leak), but should be documented.
>
> **No wildcard `*` or `*.vercel.app` bypass exists.** The regex on line 36 is project-scoped to `event-waw-platform` — not a generic Vercel wildcard. This is **secure** but needs the slug updated.

#### A2. Stripe Onboarding
**File:** [stripe-onboarding/index.ts](file:///c:/Users/yousef%20amr/Desktop/events%20platform/supabase/functions/stripe-onboarding/index.ts)

| Line | Content | Nature |
|------|---------|--------|
| 15 | `Deno.env.get('ALLOWED_ORIGIN') \|\| 'https://eventsli.com'` | Env-var with hardcoded fallback |
| 100 | `platform: 'eventsli'` | Stripe metadata — brand name (safe) |
| 104 | `url: \`https://eventsli.com\`` | **Fully hardcoded** in Stripe `business_profile.url` — no env var fallback |

> [!CAUTION]
> Line 104 is the **only instance** where `eventsli.com` is hardcoded without any env var wrapping. During a domain change, this would silently point Stripe account profiles to the old domain.

#### A3. Create Checkout
**File:** [create-checkout/index.ts](file:///c:/Users/yousef%20amr/Desktop/events%20platform/supabase/functions/create-checkout/index.ts)

| Line | Content | Nature |
|------|---------|--------|
| 171 | `req.headers.get('origin') \|\| Deno.env.get('ALLOWED_ORIGIN') \|\| 'https://eventsli.com'` | 3-tier fallback (good pattern) |
| 278 | Same pattern as 171 | Duplicate for authenticated path |
| 204 | `success_url: \`${originUrl}/checkout-success.html?...\`` | Derived from origin — **safe** |
| 205 | `cancel_url: \`${originUrl}/event-detail.html?...\`` | Derived — **safe** |
| 307-308 | Same pattern for auth checkout | Derived — **safe** |

#### A4. Stripe Webhook
**File:** [stripe-webhook/index.ts](file:///c:/Users/yousef%20amr/Desktop/events%20platform/supabase/functions/stripe-webhook/index.ts)

| Line | Content | Nature |
|------|---------|--------|
| 21 | `'noreply@eventsli.com'` | Brevo sender email fallback |
| 341 | `Deno.env.get('ALLOWED_ORIGIN') \|\| 'https://eventsli.com'` | Guest ticket URL base |
| 381 | Same env-var pattern | Auth ticket link in email |

#### A5. Send OTP Email
**File:** [send-otp-email/index.ts](file:///c:/Users/yousef%20amr/Desktop/events%20platform/supabase/functions/send-otp-email/index.ts)

| Line | Content | Nature |
|------|---------|--------|
| 15 | `'noreply@eventsli.com'` | Brevo sender email fallback |

#### A6. Send Password Reset OTP
**File:** [send-password-reset-otp/index.ts](file:///c:/Users/yousef%20amr/Desktop/events%20platform/supabase/functions/send-password-reset-otp/index.ts)

| Line | Content | Nature |
|------|---------|--------|
| 15 | `'noreply@eventsli.com'` | Brevo sender email fallback |

#### A7. Gemini Chat
**File:** [gemini-chat/index.ts](file:///c:/Users/yousef%20amr/Desktop/events%20platform/supabase/functions/gemini-chat/index.ts)

| Line | Content | Nature |
|------|---------|--------|
| 30 | `support@eventsli.com` | Hardcoded in AI system prompt |

---

### 🟡 Category B — Frontend: Email & Brand References

All frontend `eventsli.com` references are **email addresses or brand copy** — none are URL endpoints. They are cosmetically correct for the new domain but are **hardcoded strings**, not driven by config.

| File | Line(s) | Content |
|------|---------|---------|
| [index.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/index.html) | 434 | `support@eventsli.com` in chatbot FAQ |
| [login.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/login.html) | 157, 166 | `support@eventsli.com` in chatbot |
| [register.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/register.html) | 147, 162 | `support@eventsli.com` in chatbot |
| [forgot-password.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/forgot-password.html) | 161, 170 | `support@eventsli.com` in chatbot |
| [contact.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/contact.html) | 63 | `support@eventsli.com` in contact info |
| [blocked.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/blocked.html) | 161 | `support@eventsli.com` in mailto link |
| [dashboard.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/dashboard.html) | 1090 | `info@eventsli.com` as input placeholder |
| [admin.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/admin.html) | 136 | `admin@eventsli.com` as placeholder |
| [merchant-agreement.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/merchant-agreement.html) | 218 | `merchants@eventsli.com` |
| [privacy.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/privacy.html) | 151 | `privacy@eventsli.com` |
| [terms.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/terms.html) | 141 | `legal@eventsli.com` |
| [js/admin-ui.js](file:///c:/Users/yousef%20amr/Desktop/events%20platform/js/admin-ui.js) | 41 | `admin@eventsli.com` fallback |

> [!NOTE]
> These references are all **already using the new domain** (`eventsli.com`). No `eventwaw.com` references exist in frontend code. During the migration from `eventsli.com` to a future domain, these would need updating. For the **current** migration, they are correct.

---

### 🟡 Category C — Infrastructure & Config Files

#### C1. robots.txt
**File:** [robots.txt](file:///c:/Users/yousef%20amr/Desktop/events%20platform/robots.txt)

```
Line 1:  # Event Waw - Robots.txt          ← Legacy branding
Line 10: # Sitemap: https://eventwaw.com/sitemap.xml  ← OLD DOMAIN (commented out)
```

> [!WARNING]
> The sitemap reference uses the **old domain** `eventwaw.com`. Although commented out, this should be updated to `eventsli.com` and uncommented once a sitemap is deployed.

#### C2. manifest.json
**File:** [manifest.json](file:///c:/Users/yousef%20amr/Desktop/events%20platform/manifest.json) — ✅ **Clean.** Uses relative paths, `name: "Eventsli"`. No domain dependency.

#### C3. Service Worker
**File:** [sw.js](file:///c:/Users/yousef%20amr/Desktop/events%20platform/sw.js) — ✅ **Clean.** Uses relative paths only. Cache name `eventsli-v3` is brand-correct. No domain hardcoding.

#### C4. CSP (Content Security Policy)
**File:** [js/csp.js](file:///c:/Users/yousef%20amr/Desktop/events%20platform/js/csp.js) — ✅ **Clean.** Only references the Supabase project URL, not any domain. No migration action needed.

#### C5. vercel.json
**File:** [vercel.json](file:///c:/Users/yousef%20amr/Desktop/events%20platform/vercel.json) — ✅ **Clean.** Contains only header rules and cache policy. No domain reference. However, the **Vercel project name** (`event-waw-platform`) is set at the project level, not in this file.

#### C6. Playwright Config
**File:** [playwright.config.js](file:///c:/Users/yousef%20amr/Desktop/events%20platform/playwright.config.js) — ✅ **Clean.** Uses `process.env.BASE_URL || 'http://localhost:3000'`. Env-var driven.

---

### 🟡 Category D — SEO Gap Analysis

| Concern | Status |
|---------|--------|
| `<link rel="canonical">` tags | ❌ **Missing on ALL pages** |
| `<meta property="og:url">` tags | ❌ **Missing on ALL pages** |
| `<meta name="description">` | Present on some pages |
| Sitemap | ❌ **Not deployed** (commented reference to old domain) |

> [!IMPORTANT]
> The absence of canonical URLs is a pre-existing SEO gap. During domain migration, canonical tags should be added pointing to the new domain to prevent duplicate content penalties.

---

### ⚪ Category E — Legacy Branding in SQL Migrations (Cosmetic)

16 SQL migration files under `supabase/` contain `-- EVENT WAW` in comment headers. One migration (`migration-v15-super-admin.sql`, line 60) contains the old brand description in a seed data string:

```sql
"description": "With Event Waw, You Can Book Tickets..."
```

**Risk:** Cosmetic only. These are historical migration scripts. The seed data may need updating if it's re-run.

---

### ✅ Category F — Auth Redirect URIs (Secure Pattern)

All Supabase Auth `redirectTo` values use `window.location.origin` — they are **dynamically resolved** at runtime:

| File | Line | Pattern |
|------|------|---------|
| [login.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/login.html) | 258 | `${window.location.origin}/login.html` |
| [register.html](file:///c:/Users/yousef%20amr/Desktop/events%20platform/register.html) | 308 | `${window.location.origin}/register.html` |
| [src/lib/auth.js](file:///c:/Users/yousef%20amr/Desktop/events%20platform/src/lib/auth.js) | 57 | `${window.location.origin}/forgot-password.html` |

✅ These will **automatically work** on any domain. No migration action needed in code. However, the **Supabase Dashboard → Authentication → URL Configuration** must be updated with the new `Site URL` and `Redirect URLs`.

---

### ✅ Category G — Supabase Client Configuration

**File:** [src/lib/supabase.js](file:///c:/Users/yousef%20amr/Desktop/events%20platform/src/lib/supabase.js)

The Supabase URL (`bmtwdwoibvoewbesohpu.supabase.co`) and anon key are **independent of the application domain**. No change needed.

---

## PART 2: Zero-Downtime Migration Roadmap

---

### Pre-Migration Checklist

- [ ] DNS records for `eventsli.com` configured (A/CNAME pointing to Vercel)
- [ ] SSL certificate provisioned for `eventsli.com` + `www.eventsli.com`
- [ ] Brevo verified sender domain: `eventsli.com`
- [ ] Stripe webhook endpoint updated (if changing the Supabase project)

---

### Phase 1: Environment & CORS Hardening
**Risk:** 🟢 Low | **Downtime:** Zero | **Reversibility:** Instant

| Step | Action | Files |
|------|--------|-------|
| 1.1 | Set `ALLOWED_ORIGIN=https://eventsli.com` as a Supabase Edge Function secret | Supabase Dashboard |
| 1.2 | Set `BREVO_SENDER_EMAIL=noreply@eventsli.com` as a Supabase secret | Supabase Dashboard |
| 1.3 | Update `cors.ts`: Replace hardcoded `eventsli.com` entries with env-var-driven config. Update Vercel preview regex from `event-waw-platform` to new project slug | `cors.ts` |
| 1.4 | Update `stripe-onboarding/index.ts` line 104: Replace hardcoded `https://eventsli.com` with `allowedOrigin` variable | `stripe-onboarding/index.ts` |
| 1.5 | Verify all Edge Functions compile and deploy | `supabase functions deploy` |

**Validation:** Deploy to staging → trigger Stripe test checkout → verify `success_url` and `cancel_url` resolve correctly.

---

### Phase 2: Frontend Asset & Link Replacement
**Risk:** 🟢 Low | **Downtime:** Zero | **Reversibility:** Git revert

| Step | Action | Files |
|------|--------|-------|
| 2.1 | Update `robots.txt`: Fix branding comment, uncomment and update sitemap URL to `eventsli.com` | `robots.txt` |
| 2.2 | Add `<link rel="canonical" href="https://eventsli.com/...">` to all HTML pages | All `.html` files |
| 2.3 | Add `<meta property="og:url">` tags to all public-facing pages | `index.html`, `events.html`, etc. |
| 2.4 | Bump service worker cache version (`eventsli-v4`) to force cache purge | `sw.js` |
| 2.5 | Deploy and verify via Lighthouse audit | Vercel |

**Validation:** Run `npx lighthouse https://eventsli.com` → verify canonical tags, OG meta, and no mixed-content warnings.

---

### Phase 3: External Service Configurations
**Risk:** 🟠 Medium | **Downtime:** Zero (if executed in order) | **Reversibility:** Manual rollback

| Step | Action | Platform |
|------|--------|----------|
| 3.1 | **Supabase Auth:** Update `Site URL` to `https://eventsli.com` and add `https://eventsli.com/**` to Redirect URLs | Supabase Dashboard → Auth → URL Config |
| 3.2 | **Stripe Dashboard:** Update webhook endpoint URL (if Supabase project URL changes) | Stripe Dashboard → Webhooks |
| 3.3 | **Stripe Dashboard:** Verify `business_profile.url` on connected accounts | Stripe Dashboard → Connect |
| 3.4 | **Vercel:** Add `eventsli.com` and `www.eventsli.com` as custom domains | Vercel Dashboard → Domains |
| 3.5 | **Vercel:** Rename project from `event-waw-platform` (or update CORS regex) | Vercel Dashboard → Settings |
| 3.6 | **Brevo:** Verify `eventsli.com` as authenticated sender domain (SPF/DKIM/DMARC) | Brevo Dashboard → Senders |
| 3.7 | **Google OAuth:** Update authorized redirect URIs to `eventsli.com` | Google Cloud Console → Credentials |
| 3.8 | **DNS:** Set up 301 redirect from `eventwaw.com` → `eventsli.com` (preserve SEO juice) | DNS/Cloudflare |

> [!CAUTION]
> Step 3.7 (Google OAuth) is **critical**. If the redirect URI in Google Cloud Console doesn't include `eventsli.com`, Google Sign-In will fail silently. Must be updated **before** DNS cutover.

---

### Post-Migration Verification

| Check | Tool |
|-------|------|
| All pages load on new domain | Manual + Playwright E2E |
| Stripe checkout flow end-to-end | Test purchase on staging |
| OTP emails arrive with correct sender | Manual trigger |
| Google OAuth login/register works | Manual test |
| QR ticket scanning works | Scanner page test |
| CORS preflight returns correct `Access-Control-Allow-Origin` | `curl -X OPTIONS` |
| `robots.txt` accessible | `curl https://eventsli.com/robots.txt` |
| Service worker updates cleanly | DevTools → Application → SW |
| No console errors on any page | DevTools audit |
| 301 redirect from old domain works | `curl -I https://eventwaw.com` |

---

> **END OF REPORT**
