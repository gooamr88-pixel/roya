# Nabda Platform - Comprehensive Technical Handover Document

> **Confidentiality Notice:** This document is intended for authorized developers and DevOps engineers. It outlines the complete architecture, security infrastructure, and core functionalities of the Nabda Platform (also referenced as Roya Platform).

---

## 1. System Overview & Architecture

### High-Level Purpose
Nabda is an enterprise-grade digital platform encompassing services for Advertising, Marketing, Real Estate, Exhibitions, and Recruitment. It offers a secure user dashboard, an advanced role-based admin panel, and robust utilities for order management, dynamic PDF invoice generation, and full-scale bilingual localization (RTL/LTR).

### Technology Stack
*   **Backend:** Node.js (v18+), Express.js (v4).
*   **Database:** PostgreSQL with `pg` driver (Manual migrations).
*   **Frontend Templating:** Server-Side Rendering (SSR) via Nunjucks.
*   **Frontend Assets:** Vanilla JavaScript, Vanilla CSS (with dedicated RTL support).
*   **Authentication:** JWT (JSON Web Tokens) with `bcryptjs`.
*   **Core Tools & Integrations:** 
    *   `puppeteer` & `pdfkit` for PDF Generation.
    *   `cloudinary` for asset storage.
    *   `nodemailer` for transactional emails.
*   **Security Suite:** `helmet`, `express-rate-limit`, Custom CSRF middleware, SQL Injection guards, HPP Protection.

### Architecture Pattern & Data Flow
The platform enforces a strict **Service-Oriented MVC Architecture** to ensure clean separation of concerns:

1.  **Routes:** Define HTTP endpoints and map them to Controllers.
2.  **Middlewares:** Intercept requests for Security, Authentication (JWT), Rate Limiting, and Localization context before reaching the controller.
3.  **Controllers:** Thin layer handling HTTP requests and responses (status codes, JSON mapping).
4.  **Services:** Complex business logic (Puppeteer execution, JWT signing, Email sending).
5.  **Repositories:** Direct Database interaction (SQL Queries). Keeps SQL out of controllers and services.

---

## 2. Project Structure (Directory Tree)

```text
e:\Roya\
├── .env.example              # Template for environment variables
├── package.json              # Project dependencies and NPM scripts
├── client/                   # Frontend Assets & Templates
│   ├── css/                  # Vanilla CSS stylesheets (includes rtl.css)
│   ├── js/                   # Vanilla JS modules for the browser
│   ├── images/               # Static visual assets and SVGs
│   └── views/                # Nunjucks (.njk) SSR templates
└── server/                   # Backend Application Code
    ├── server.js             # Entry point, PM2 runner, DB connection init
    ├── app.js                # Express App definition & Middleware Pipeline
    ├── migrate-db.js         # PostgreSQL schema definitions and migration runner
    ├── config/               # DB connection pools, ENV parsers
    ├── controllers/          # Request handlers (e.g., auth, invoices, services)
    ├── i18n/                 # Localization dictionaries (ar.json, en.json)
    ├── middlewares/          # Custom middlewares (auth, security, i18n, csrf)
    ├── repositories/         # SQL query wrappers (e.g., user.repository.js)
    ├── routes/               # API & Page routing definitions
    ├── services/             # Core logic (token, pdf, email, whatsapp)
    └── utils/                # Winston Logger, asyncHandlers, helpers
```

---

## 3. Database Schema & Models

The system relies on PostgreSQL with a strictly defined relational schema. Migrations are executed iteratively using `IF NOT EXISTS` constructs via `migrate-db.js`.

### Core Tables & Relationships
*   **`roles`:** Stores hierarchical definitions (`super_admin`, `admin`, `viewer`, `client`) and weight properties for privilege scaling.
*   **`users`:** Core identity table. Includes secure fields (`password_hash`, `refresh_token_hash`), authentication state (`failed_login_attempts`, `locked_until`), and a foreign key `role_id` -> `roles(id)`.
*   **`services` / `properties` / `jobs` / `portfolio_items`:** Content tables holding respective entity data. Includes bilingual fields (`title_ar`, `description_ar`).
*   **`orders`:** Links users to purchased services. `user_id` -> `users(id)`, `service_id` -> `services(id)`.
*   **`invoices`:** Invoice payload storage and binary PDF buffer storage. `order_id` -> `orders(id)`.
*   **`login_logs` / `refresh_tokens` / `notifications`:** Utility tables maintaining deep relationships with `users(id)` via `ON DELETE CASCADE`.

---

## 4. Authentication & Security (The Fort Knox)

Security is heavily prioritized, employing a Defense-in-Depth approach.

### Role-Based Access Control (RBAC)
Implemented in `server/middlewares/auth.js`.
*   **Immutable Hierarchy:** Roles are mapped to numeric weights via `Object.freeze` (e.g., `client=1`, `admin=3`, `super_admin=4`) preventing runtime mutation.
*   **Authorization Strategies:**
    *   `authorizeRole(minRole)`: Hierarchical check (`user.weight >= minRole.weight`).
    *   `authorize(...roles)`: Exact role match.
    *   `ownerOrAdmin(paramKey)`: NaN-safe check to ensure a user can only access their own resources unless they are an admin, preventing Horizontal Privilege Escalation.

### JWT & Session Management
Handled natively in `server/services/token.service.js`.
*   **Short-lived Access Tokens (HS256):** 15-minute expiry. Explicit `type='access'` prevents refresh-token substitution. Securely validated against `issuer` and `audience` claims.
*   **Long-lived Refresh Tokens:** Hashed via `bcryptjs` and stored in the database (`users.refresh_token_hash`).
*   **Delivery:** Sent exclusively via `HttpOnly`, `SameSite=lax` Cookies. The refresh token is strictly Path-Scoped to `/api/auth/refresh`.
*   **Stateless Revocation:** On logout or ban, the DB clears the `refresh_token_hash`. The auth middleware instantly rejects Access Tokens if the hash is missing in the DB, achieving instant revocation without a Redis blacklist.

### Hardened Defenses
*   **Double-Submit CSRF:** Mutating APIs (POST, PUT, DELETE) mandate a valid `X-CSRF-Token` header matching a signed `roya_csrf` cookie.
*   **Helmet Headers:** Aggressive Content Security Policy (CSP), HSTS enforcement, and disabling of `X-Powered-By`.
*   **Input Sanitization & Injection Guards:** Global middlewares (`sanitizeInput`, `sqlInjectionGuard`, `hppProtection`) scrub all incoming payloads (`req.body`, `req.query`, `req.params`).
*   **Rate Limiting:** `express-rate-limit` governs API request frequencies to prevent brute-forcing.

---

## 5. Core Features Deep Dive

### PDF Invoice Generation (Puppeteer Concurrency)
File: `server/controllers/invoice.controller.js`

To prevent memory leaks and out-of-memory (OOM) errors common with headless browsers, the platform uses an advanced concurrency and safety model:
1.  **Concurrency Guard:** `PDF_MAX_CONCURRENT` limits active Chromium instances (default 2). Excess requests are queued via asynchronous `acquirePdfSlot()`.
2.  **Safety Timeout (Zombie Killer):** A 60-second `setTimeout` guarantees browser cleanup even if Node's event loop hangs.
3.  **Promise.race Mechanism:** During `page.pdf()`, a `Promise.race` executes the rendering against a strict 25-second timeout. If the rendering hangs (due to unresolved network assets), it throws, explicitly closes the page, and releases the slot.
4.  **Buffer Delivery:** The resulting PDF is served directly as a buffer `Content-Type: application/pdf` and cached in the DB as `BYTEA` if requested.

### Bilingual Localization (Nunjucks RTL/LTR)
File: `server/middlewares/i18n.js`

The platform reads the user's preferred language from the `nabda_lang` cookie.
1.  **JSON Dictionaries:** Preloads `i18n/en.json` and `i18n/ar.json` into memory.
2.  **Middleware Injection:** `i18nMiddleware` injects localized context directly into the Express response object (`res.locals`):
    *   `res.locals.lang` ('en' or 'ar')
    *   `res.locals.dir` ('rtl' or 'ltr')
    *   `res.locals.t` (The full translation JSON object).
3.  **Template Execution:** Nunjucks dynamically accesses these properties. `<html>` direction is set automatically. Developers simply use `{{ t.nav.dashboard }}` inside `.njk` templates.
4.  **CSS Scoping:** A dedicated `client/css/rtl.css` is served globally, applying targeted overrides (e.g., mirroring margins, padding, and flexbox directions) when `dir="rtl"`.

---

## 6. Deployment & DevOps Guide (Hostinger)

The application is deployed on an Ubuntu-based Hostinger VPS.

### 1. Server Environment Requirements
*   **Node.js:** v18.x or v20.x
*   **PostgreSQL:** 14+
*   **PM2:** Global installation (`npm install -g pm2`)
*   **System Dependencies:** Chromium libraries required for Puppeteer (e.g., `libnss3`, `libatk-bridge2.0-0`, `libxcomposite1`, `libxdamage1`, `libgbm1`).

### 2. Environment Variables (.env Template)
Create a `.env` file in the project root:
```env
PORT=3000
NODE_ENV=production
BASE_URL=https://your-domain.com

# Database
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=roya_platform
DB_USER=postgres
DB_PASSWORD=SecurePasswordHere
DB_SSL=false

# JWT Keys (Must be long, random strings)
JWT_ACCESS_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Security
CSRF_SECRET=csrf_super_secret
ALLOWED_ORIGINS=https://your-domain.com
COOKIE_DOMAIN=

# Super Admin Creds (Run `npm run db:seed` to init)
SUPER_ADMIN_NAME="Super Admin"
SUPER_ADMIN_EMAIL="admin@your-domain.com"
SUPER_ADMIN_PASSWORD="SecureAdminPass123!"
```

### 3. Step-by-Step Execution
1.  **Install dependencies:** `npm install`
2.  **Migrate Database:** `npm run db:migrate`
3.  **Seed Admin:** `npm run db:seed`
4.  **Start Application with PM2:**
    ```bash
    pm2 start server/server.js --name "nabda-platform" --time
    pm2 save
    pm2 startup
    ```

### 4. NGINX Reverse Proxy & SSL
Because Express operates on port `3000`, NGINX is configured to forward external HTTPS requests to Node.
*   **Critical Note:** Express must know it sits behind a proxy to correctly parse Client IPs for Rate Limiting and secure cookies. In `app.js`, `app.set('trust proxy', 1);` handles this.
*   **NGINX Block configuration:**
    ```nginx
    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL Certificates (managed by Certbot)
        ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
