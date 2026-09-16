const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'design-qa-temp@shule.local');
  await page.fill('input[type="password"]', 'TempQA!2026x');
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/Binti/AppData/Local/Temp/shots/dashboard.png', fullPage: true });

  await page.goto('http://localhost:5173/students', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'C:/Users/Binti/AppData/Local/Temp/shots/students.png', fullPage: true });

  await page.goto('http://localhost:5173/fees', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'C:/Users/Binti/AppData/Local/Temp/shots/fees.png', fullPage: true });

  await page.goto('http://localhost:5173/admin-panel', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'C:/Users/Binti/AppData/Local/Temp/shots/sysadmin.png', fullPage: true });

  await browser.close();
})();
