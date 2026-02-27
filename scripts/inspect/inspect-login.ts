import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.goto('https://stafflife-icahjb-test.fa.ocs.oraclecloud.com/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: '/tmp/oracle-login-1.png', fullPage: true });
  
  // Dump all interactive elements
  const elements = await page.locator('input, button, a, select').evaluateAll(els => 
    els.map(el => ({
      tag: el.tagName,
      type: (el as any).type || '',
      id: el.id,
      name: (el as any).name || '',
      class: el.className.toString().substring(0, 100),
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: (el as any).placeholder || '',
      text: el.textContent?.trim().substring(0, 80) || '',
      href: (el as any).href || '',
    }))
  );
  console.log(JSON.stringify(elements, null, 2));
  
  await browser.close();
})();
