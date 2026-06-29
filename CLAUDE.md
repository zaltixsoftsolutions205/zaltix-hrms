# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack HRMS + CRM system. Backend: Node.js/Express REST API (port 5000). Frontend: React 18 + Vite SPA (port 5173). Database: MongoDB via Mongoose.

## Commands

### Development

```bash
# Backend (from /backend)
npm run dev        # nodemon hot-reload on port 5000
npm start          # production start

# Frontend (from /frontend)
npm run dev        # Vite dev server on port 5173
npm run build      # production build
npm run preview    # preview production build
```

Both servers must run simultaneously. Vite proxies `/api` and `/uploads` to `http://localhost:5000`.

### Database

```bash
# From /backend — run once to seed admin account
node seed.js
```

Default credentials after seeding: `admin@hrms.com` / `Admin@123`

## Architecture

### Backend: MVC with Express

- `server.js` — entry point; mounts routes, connects MongoDB, serves `/uploads` static directory
- `middleware/auth.js` — JWT verification; attaches user to `req.user`
- `middleware/roleCheck.js` — `roleCheck(...roles)` factory used on role-restricted routes
- `controllers/` — one file per module (employees, attendance, leaves, payslips, tasks, leads, notifications, admin, auth)
- `models/` — Mongoose schemas matching controllers
- `utils/emailTemplates.js` — HTML email templates (offer letter, credentials, leave updates, payslip)
- `utils/generatePayslipPDF.js` — PDFKit-based payslip PDF saved to `backend/uploads/payslips/`

### Frontend: React Context + Axios Interceptor

- `src/App.jsx` — root routing; wraps app in `AuthProvider`; uses `ProtectedRoute` for auth-gating
- `src/contexts/AuthContext.jsx` — user state loaded from localStorage on startup; provides `login`/`logout`; handles 401 auto-logout
- `src/utils/api.js` — Axios instance; auto-injects JWT header; redirects to `/login` on 401
- `src/utils/helpers.js` — shared formatters: `formatCurrency` (INR/₹), `formatDate`, `getStatusBadge`, etc.
- `src/pages/` — organized by role: `Admin/`, `HR/`, `CRM/`, plus shared pages (Attendance, Leaves, Payslips, Tasks, Profile)
- `src/components/UI/` — Button, Card, Modal, Spinner, Badge primitives

### Role-Based Access

Four roles with escalating permissions: `employee` → `sales` → `hr` → `admin`. Sales adds CRM. HR adds employee management and payroll. Admin adds departments, policies, system-wide reports.

### Authentication Flow

1. POST `/api/auth/login` → JWT + user object returned
2. Token stored in `localStorage` as `'token'`
3. All API requests: `Authorization: Bearer <token>` header via Axios interceptor
4. First login flag (`isFirstLogin: true`) forces password reset before accessing the app

### Key Environment Variables (`backend/.env`)

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/hrms_crm
JWT_SECRET=...
JWT_EXPIRES_IN=7d
MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS / MAIL_FROM
FRONTEND_URL=http://localhost:5173
```

## Design System

Primary color: violet (`#4C1D95` dark, `#7C3AED` mid, `#ede9fe` light). Accent: golden (`#D97706`). Font: Inter. Tailwind custom tokens defined in `frontend/tailwind.config.js`. Framer Motion used for page/component transitions.

## Notable Patterns

- **Employee IDs** auto-generated in `EMP0001` format by the User model pre-save hook
- **Payslip uniqueness** enforced by compound index on `(employee, month, year)`
- **Attendance uniqueness** enforced by compound index on `(employee, date)`
- **CRM activities** stored as embedded subdocuments on the Lead model (not a separate collection)
- No TypeScript — vanilla JavaScript throughout
- No test framework configured
