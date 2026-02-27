import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.goto('https://stafflife-icahjb-test.fa.ocs.oraclecloud.com/', { waitUntil: 'networkidle', timeout: 60000 });
  
  // Click Company Single Sign-On
  await page.locator('#ssoBtn').click();
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.screenshot({ path: '/tmp/oracle-sso-1.png', fullPage: true });
  
  console.log('--- URL after SSO click ---');
  console.log(page.url());
  
  // Dump all interactive elements on SSO page
  const elements = await page.locator('input, button, a, select, label').evaluateAll(els => 
    els.map(el => ({
      tag: el.tagName,
      type: (el as any).type || '',
      id: el.id,
      name: (el as any).name || '',
      class: el.className.toString().substring(0, 100),
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: (el as any).placeholder || '',
      text: el.textContent?.trim().substring(0, 80) || '',
      visible: el.offsetParent !== null || el.offsetWidth > 0,
    }))
  );
  console.log(JSON.stringify(elements, null, 2));
  
  await browser.close();
})();
