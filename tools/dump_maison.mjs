/**
 * Refait tests/fixtures/maison.json : les objets de la maison tels que game.describe() les rend au
 * début d'une partie, pour essayer les ordres tapés sur la vraie maison (tests/ordres-maison.test.ts).
 *
 *   npx vite build && npx vite preview --port 4174 &
 *   node tools/dump_maison.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4174/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => 'game' in window && !document.body.innerText.includes('Chargement…'), null, { timeout: 180_000 });
await page.waitForTimeout(3000);
const objets = await page.evaluate(() => window.game.describe().objets);
fs.writeFileSync(new URL('../tests/fixtures/maison.json', import.meta.url), `${JSON.stringify(objets, null, 0).replace(/\},\{/g, '},\n{')}\n`);
console.log(`${objets.length} objets`);
await browser.close();
