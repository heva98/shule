# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

School management system for a private school in Tanzania (TZS currency, `Africa/Dar_es_Salaam` timezone, 2-term / 4-quarter academic year, Nursery → STD1–7 → FORM1–6 levels). Django REST backend at the repo root, React SPA in `shule-frontend/`. Each deployment serves one school.

## Commands

Backend (repo root; local Python venv is `C:\Users\Binti\eva`, PostgreSQL `shule_db`):

```bash
python manage.py runserver                 # API on :8000
python manage.py test --noinput            # full suite (CI)
python manage.py test fees                 # one app
python manage.py test fees.tests_ledger    # one module (apps split tests into tests_*.py)
python manage.py test fees.tests_ledger.SomeTestCase.test_method
python manage.py check
python manage.py makemigrations --check --dry-run   # CI fails on missing migrations
celery -A shule worker -l info             # Celery (Redis broker, django_celery_beat DB scheduler)
celery -A shule beat -l info
```

Frontend (`shule-frontend/`, React 19 + Vite + Tailwind 3 + TanStack Query):

```bash
npm run dev      # :5173, proxies /api → localhost:8000
npm run lint
npm run build
npm test         # Vitest unit tests (src/**/*.test.{js,jsx}); npm run test:watch to watch
npm run test:e2e # Playwright browser tests (e2e/), API mocked; starts Vite on :5174
```

CI (`.github/workflows/ci.yml`) runs: `check`, the migrations check, the test suite on Postgres, then frontend `lint`, `test`, `test:e2e` and `build`.

User manual: `docs/manuals/*.md` is the source; `python docs/build_manual.py` builds `docs/Shule_SMS_User_Manual.html`. A `UnicodeEncodeError` on the final print (cp1252 console) is harmless, because the HTML is already written by then.

## Architecture

- **Project config** is in `shule/`: settings, `urls.py` (every app mounted under `/api/<app>/`, admin panel at `/api/admin/` from `accounts/admin_urls.py`), `celery.py`, `modules.py`, and `factories.py` (shared test-data builders that each app's tests import).
- **Auth**: `accounts.User` is email-based with a single `role` field (OWNER, SYSTEM_ADMIN, HEADTEACHER, ACADEMIC_TEACHER, DISCIPLINE_TEACHER, CLASS_TEACHER, SUBJECT_TEACHER, TEACHER, BURSAR, PARENT, STUDENT). JWT via SimpleJWT, and `IsAuthenticated` is the default. Role-based permission classes live in `accounts/permissions.py`. Audit actions go through `accounts/utils.py` `log_action`.
- **Module gating**: `ENABLED_MODULES` (env, comma list, parsed to a list in settings) says which optional modules a deployment has switched on. `shule/modules.py` `OPTIONAL_MODULES` is the canonical list. Gating happens in three places, and all of them need updating when you add or gate a feature:
  1. Backend: set `module = '<key>'` on the view and add `ModuleEnabled` to `permission_classes`. Celery tasks and signals check `settings.ENABLED_MODULES` themselves.
  2. The frontend reads `enabled_modules` from the user payload (`AuthContext` / `useEnabledModules`). Routes use `<ProtectedRoute allowedRoles=… requiredModule=…>` in `App.jsx`.
  3. The sidebar reads the `module:` key on nav items in `src/hooks/useNavItems.js`. Role lists come from `FEATURE_ROLES` in `src/lib/constants.js`.
  Tests use `@override_settings(ENABLED_MODULES=[...])`.
- **"reports" module**: this module has no app of its own. It gates the exam-report/performance views in `exams/views.py`.
- **Fees** is the most complex domain. Business logic lives outside views, in `services.py`, `charges.py`, `resolvers.py`, `summaries.py`, `reports.py` and `sales.py`, with `select_for_update` locking tested concurrently via `shule.factories.run_concurrently`.
- **Communications**: bulk SMS goes through Notify Africa. `SMS_BACKEND` is `noop` by default (records without sending), `console`, or live. The SMS code is in `communications/sms_*.py`, and Celery tasks in `communications/tasks.py` and `fees/tasks.py` send absence alerts and fee reminders. WhatsApp is disabled: nothing is sent, and any "WhatsApp configured" UI is cosmetic only.
- **Streams**: `students.Stream` is the managed, admin-edited list of stream names (always UPPERCASE). Other tables keep a text column declared as `students.fields.StreamField`, which uppercases on write and in lookups (it is not a foreign key). API writes go through `students.streams.StreamSerializerField`, which rejects names that aren't in the list. When adding a new stream column, use both of these and add it to `STREAM_COLUMNS`.
- **URL identifiers**: never expose a student's DB pk or admission number (`student_id`) in a browser-reachable URL. Use `Student.public_id` (UUID) instead. See `docs/URL_IDENTIFIER_POLICY.md`.
- **Frontend**: `src/api/*.js` has one API-call module per backend app, all built on `src/lib/axios.js` (baseURL `/api`, bearer token from localStorage). Pages are in `src/pages/<area>/`. `design-system/` holds static HTML reference templates and is not built.
- **Deployment**: `deploy/` has gunicorn, nginx and systemd units (gunicorn, celery, celerybeat). See `deploy/DEPLOY.md`.

## Analytics module rules

- Module key: `analytics` in ENABLED_MODULES. Gate backend viewsets, frontend routes, sidebar entry.
- Staff-only: new permission class `IsAnalyticsStaff`. Parents/students never reach analytics endpoints.
- Phase 1 builds on EXISTING tables only. No new models until the saved-visualization phase.
- Metrics are defined in a registry, never hard-coded in views.
- Averages MUST be weighted: aggregate SUM and COUNT at fact grain (pupil × subject × exam), divide at the end. Never average pre-aggregated averages.
- Registry is module-aware: fee metrics are hidden when `fees` is not enabled (e.g. Msewe).
- Query optimization (annotate/aggregate, select_related) before any Redis caching.
- Never return individual pupil rows to the aggregate endpoint; drill-down is a separate, permissioned endpoint.
- Nothing in analytics may require Celery (Msewe runs no worker): no tasks, no `.delay()`, all work inside the request. `analytics/tests_celery_free.py` enforces this.
