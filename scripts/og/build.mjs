// Image de partage public/og.jpg (1200 × 630) : la page scripts/og/card.html rendue par Chromium (Playwright).
//   node scripts/og/build.mjs   (Playwright doit être installé : npx playwright install chromium)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`file://${path.join(here, 'card.html')}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(here, '../../public/og.jpg'), type: 'jpeg', quality: 88 });
await browser.close();
console.log('public/og.jpg écrit');
