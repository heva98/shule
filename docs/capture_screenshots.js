/**
 * Shule SMS — Automated screenshot capture (Node.js / Playwright)
 * Requires:
 *   - Django server running on http://localhost:8000
 *   - Vite dev server running on http://localhost:5173
 *   - Playwright installed: cd shule-frontend && npm install playwright @playwright/test && npx playwright install chromium
 *
 * Run from the project root:
 *   node docs/capture_screenshots.js
 */

const path = require('path');
const fs = require('fs');

const { chromium } = require(
  require.resolve('playwright', { paths: [path.join(__dirname, '../shule-frontend')] })
);

const BASE_URL = 'http://localhost:5173';
const OUT_DIR  = path.join(__dirname, 'screenshots');
const PASSWORD = 'Demo1234!';

const ROLES = [
  {
    key:   'owner',
    email: 'owner@shule.tz',
    label: 'Owner / Director',
    pages: [
      ['dashboard',      '/dashboard',                 'Dashboard'],
      ['students',       '/students',                  'Students List'],
      ['fees',           '/fees',                      'Fees Overview'],
      ['attendance',     '/attendance',                'Attendance'],
      ['exams',          '/exams',                     'Exams'],
      ['staff',          '/staff',                     'Staff'],
      ['communications', '/communications',             'Communications'],
      ['admin_dash',     '/admin-panel',               'Admin Dashboard'],
      ['admin_users',    '/admin-panel/users',         'User Management'],
      ['admin_settings', '/admin-panel/settings',      'School Settings'],
      ['admin_health',   '/admin-panel/system-health', 'System Health'],
    ],
  },
  {
    key:   'sysadmin',
    email: 'sysadmin@shule.tz',
    label: 'System Administrator',
    pages: [
      ['admin_dash',     '/admin-panel',                    'System Dashboard'],
      ['admin_users',    '/admin-panel/users',              'User Management'],
      ['admin_roles',    '/admin-panel/roles',              'Role Assignment'],
      ['admin_subjects', '/admin-panel/subjects',           'Subjects & Classes'],
      ['admin_years',    '/admin-panel/academic-years',     'Academic Year Setup'],
      ['admin_settings', '/admin-panel/settings',           'School Settings'],
      ['admin_audit',    '/admin-panel/audit-logs',         'Audit Logs'],
      ['admin_health',   '/admin-panel/system-health',      'System Health'],
    ],
  },
  {
    key:   'headteacher',
    email: 'headteacher@shule.tz',
    label: 'Headteacher',
    pages: [
      ['dashboard',      '/dashboard',      'Dashboard'],
      ['students',       '/students',       'Students List'],
      ['fees',           '/fees',           'Fees'],
      ['attendance',     '/attendance',     'Attendance'],
      ['exams',          '/exams',          'Exams'],
      ['staff',          '/staff',          'Staff'],
      ['communications', '/communications', 'Communications'],
    ],
  },
  {
    key:   'academic',
    email: 'academic@shule.tz',
    label: 'Academic Teacher',
    pages: [
      ['dashboard',      '/dashboard',      'Dashboard'],
      ['students',       '/students',       'Students'],
      ['attendance',     '/attendance',     'Attendance'],
      ['exams',          '/exams',          'Exams'],
      ['staff',          '/staff',          'Staff'],
      ['communications', '/communications', 'Communications'],
    ],
  },
  {
    key:   'discipline',
    email: 'discipline@shule.tz',
    label: 'Discipline Teacher',
    pages: [
      ['dashboard',  '/dashboard',  'Dashboard'],
      ['students',   '/students',   'Students'],
      ['attendance', '/attendance', 'Attendance'],
    ],
  },
  {
    key:   'classteacher',
    email: 'classteacher@shule.tz',
    label: 'Class Teacher',
    pages: [
      ['dashboard',  '/dashboard',  'Dashboard'],
      ['students',   '/students',   'Students'],
      ['attendance', '/attendance', 'Attendance'],
      ['exams',      '/exams',      'Exams'],
    ],
  },
  {
    key:   'subjectteacher',
    email: 'subjectteacher@shule.tz',
    label: 'Subject Teacher',
    pages: [
      ['dashboard', '/dashboard', 'Dashboard'],
      ['students',  '/students',  'Students'],
      ['exams',     '/exams',     'Exams'],
    ],
  },
  {
    key:   'teacher',
    email: 'teacher@shule.tz',
    label: 'Teacher',
    pages: [
      ['dashboard',  '/dashboard',  'Dashboard'],
      ['students',   '/students',   'Students'],
      ['attendance', '/attendance', 'Attendance'],
      ['exams',      '/exams',      'Exams'],
    ],
  },
  {
    key:   'bursar',
    email: 'bursar@shule.tz',
    label: 'Bursar',
    pages: [
      ['dashboard', '/dashboard', 'Dashboard'],
      ['students',  '/students',  'Students'],
      ['fees',      '/fees',      'Fees Overview'],
    ],
  },
];

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function screenshotPage(page, url, outPath, label) {
  console.log(`    → ${label}`);
  await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: outPath, fullPage: true });
}

async function captureRole(browser, role) {
  const roleDir = path.join(OUT_DIR, role.key);
  fs.mkdirSync(roleDir, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page    = await context.newPage();

  console.log(`\n  [${role.label}]  ${role.email}`);
  try {
    await login(page, role.email, PASSWORD);

    // Capture login page once (shared)
    const loginPath = path.join(OUT_DIR, 'login.png');
    if (!fs.existsSync(loginPath)) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await page.screenshot({ path: loginPath, fullPage: true });
      await login(page, role.email, PASSWORD);
    }

    for (const [pageKey, urlPath, label] of role.pages) {
      const outPath = path.join(roleDir, `${pageKey}.png`);
      await screenshotPage(page, urlPath, outPath, label);
    }
  } catch (err) {
    console.error(`    !! ERROR: ${err.message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  // Resolve playwright from shule-frontend node_modules
  console.log('Starting screenshot capture…');
  console.log(`Output directory: ${OUT_DIR}`);
  console.log(`Target URL: ${BASE_URL}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  for (const role of ROLES) {
    await captureRole(browser, role);
  }
  await browser.close();

  console.log('\nDone! Screenshots saved to:', OUT_DIR);
  console.log('Now run:  python docs/build_manual.py');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
