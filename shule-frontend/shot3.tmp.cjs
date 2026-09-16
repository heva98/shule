const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('response', async (res) => {
    if (res.url().includes('/api/')) {
      console.log(res.status(), res.url());
    }
  });
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'design-qa-temp@shule.local');
  await page.fill('input[type="password"]', 'TempQA12026x');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  console.log('URL after submit:', page.url());
  await page.screenshot({ path: 'C:/Users/Binti/AppData/Local/Temp/shots/after_login.png' });
  await browser.close();
})();
