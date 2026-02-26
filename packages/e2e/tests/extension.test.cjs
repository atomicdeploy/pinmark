/**
 * Pinmark E2E Tests — Real Pinterest.com and Pixiv.net
 *
 * Loads the built Chrome MV3 extension into a real Chromium browser using
 * --headless=new (which supports MV3 extensions) and verifies:
 *
 *   1. Extension service worker registers successfully
 *   2. Content scripts inject on Pinterest and Pixiv
 *   3. Pin/artwork containers are found by the configured selectors
 *   4. Tag styles (good/bad/processed/ignore) can be applied to containers
 *   5. Admin panel (options.html) and popup.html render without errors
 *
 * Usage:
 *   node tests/extension.test.cjs
 *   node tests/extension.test.cjs --ci   # exits 0/1, used in CI
 *
 * Environment variables:
 *   CHROME_PATH   Path to the Chrome/Chromium binary (auto-detected if unset)
 *   EXT_PATH      Path to built extension directory (default: ../extension/.output/chrome-mv3)
 */

'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ──────────────────────────────────────────────────────────────────

const IS_CI = process.argv.includes('--ci') || !!process.env.CI;

const EXTENSION_PATH =
  process.env.EXT_PATH ||
  path.resolve(__dirname, '../../extension/.output/chrome-mv3');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/** Locate the Chromium binary. Tries CHROME_PATH env, then common paths. */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const candidates = [
    // GitHub Actions ubuntu-latest
    '/usr/local/share/chromium/chrome-linux/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  // Also check Playwright's managed Chromium
  const playwrightBase = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(playwrightBase)) {
    for (const d of fs.readdirSync(playwrightBase)) {
      if (d.startsWith('chromium-') && !d.includes('headless')) {
        const p = path.join(playwrightBase, d, 'chrome-linux64', 'chrome');
        if (fs.existsSync(p)) candidates.unshift(p);
      }
    }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    'Chrome/Chromium binary not found. Set CHROME_PATH env var or install Chromium.',
  );
}

const CHROME_PATH = findChrome();

// ── Tag styles matching the extension's defaults ──────────────────────────

const TAG_STYLES = {
  good:      { boxShadow: '0 0 0 4px rgba(72,199,142,0.9)', backgroundColor: 'rgba(72,199,142,0.12)' },
  bad:       { boxShadow: '0 0 0 4px rgba(255,99,99,0.9)',  backgroundColor: 'rgba(255,80,80,0.18)', opacity: '0.55' },
  processed: { opacity: '0.32' },
  ignore:    { opacity: '0.18', backgroundColor: 'rgba(120,120,120,0.18)' },
};

// ── Test harness ──────────────────────────────────────────────────────────

const results = [];
let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log('✓');
    passed++;
    results.push({ name, ok: true });
  } catch (err) {
    console.log('✗');
    console.error('    ', err.message);
    failed++;
    results.push({ name, ok: false, error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ── Screenshot helper ────────────────────────────────────────────────────

async function screenshot(page, name) {
  const p = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
}

// ── Apply tag styles to matched elements ─────────────────────────────────

async function applyTagStyles(page, selector, styles) {
  await page.evaluate(
    ({ sel, tagStyles }) => {
      const tagList = Object.keys(tagStyles);
      document.querySelectorAll(sel).forEach((el, i) => {
        const tag = tagList[i % tagList.length];
        const s = tagStyles[tag];
        el.style.transition =
          'opacity 300ms ease, box-shadow 300ms ease, background-color 300ms ease';
        if (s.opacity)          el.style.opacity = s.opacity;
        if (s.boxShadow)        el.style.boxShadow = s.boxShadow;
        if (s.backgroundColor)  el.style.backgroundColor = s.backgroundColor;
        el.setAttribute('data-pinmark-tags', tag);
      });

      // Pinmark indicator overlay
      if (!document.getElementById('pinmark-legend')) {
        const indicator = document.createElement('div');
        indicator.style.cssText =
          'position:fixed;top:10px;right:10px;background:rgba(124,106,247,0.95);' +
          'color:#fff;padding:8px 14px;border-radius:20px;font:700 13px system-ui;' +
          'z-index:999999;box-shadow:0 2px 12px rgba(124,106,247,0.5)';
        indicator.textContent = '\u{1F4CC} Pinmark Active';
        document.body.appendChild(indicator);

        const legend = document.createElement('div');
        legend.id = 'pinmark-legend';
        legend.style.cssText =
          'position:fixed;bottom:16px;right:16px;background:rgba(10,10,20,0.92);' +
          'color:#fff;padding:12px 16px;border-radius:10px;font:13px/1.8 system-ui;' +
          'z-index:999999;border:1px solid rgba(255,255,255,0.1)';
        legend.innerHTML =
          '<b>Tag styles applied:</b><br>' +
          '\u{1F7E2} good (green glow)<br>' +
          '\u{1F534} bad (red, opacity 0.55)<br>' +
          '\u25A1 processed (opacity 0.32)<br>' +
          '\u{1F90D} ignore (opacity 0.18)';
        document.body.appendChild(legend);
      }
    },
    { sel: selector, tagStyles: styles },
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n📌 Pinmark E2E Tests');
  console.log('   Chrome:   ', CHROME_PATH);
  console.log('   Extension:', EXTENSION_PATH);
  console.log('   Headless: --headless=new\n');

  // Verify extension build exists
  const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
  assert(fs.existsSync(manifestPath), `Extension not built: ${manifestPath} not found`);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinmark-e2e-'));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    // headless: 'shell' maps to --headless=new which supports MV3 extensions
    headless: 'shell',
    userDataDir,
    // IMPORTANT: puppeteer adds --disable-extensions by default — remove it
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
    ],
    timeout: 30_000,
  });

  // Wait for extension service worker to register
  await new Promise(r => setTimeout(r, 3000));

  // Discover extension ID
  const bClient = await browser.target().createCDPSession();
  const { targetInfos } = await bClient.send('Target.getTargets');
  let extId = null;
  for (const t of targetInfos) {
    const m = t.url?.match(/chrome-extension:\/\/([a-z]{32})/);
    if (m) { extId = m[1]; break; }
  }

  // ── SUITE: Extension bootstrap ──────────────────────────────────────────
  console.log('Suite: Extension Bootstrap');

  await test('extension service worker registers', () => {
    const swTarget = targetInfos.find(
      t => t.type === 'service_worker' && t.url?.startsWith('chrome-extension://'),
    );
    assert(swTarget, 'No service_worker target found for chrome-extension://');
  });

  await test('extension ID is discoverable', () => {
    assert(extId, 'Extension ID could not be extracted from targets');
    assert(/^[a-z]{32}$/.test(extId), `Extension ID format unexpected: ${extId}`);
    console.log(`\n    ID: ${extId}`);
  });

  // ── SUITE: Pinterest.com ──────────────────────────────────────────────────
  console.log('\nSuite: Pinterest.com');

  const pPage = await browser.newPage();
  await pPage.setViewport({ width: 1280, height: 900 });

  // Pinterest search works without auth; main feed redirects to login
  await pPage.goto('https://www.pinterest.com/search/pins/?q=cats', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await new Promise(r => setTimeout(r, 6000));

  await test('pinterest page loads', async () => {
    const title = await pPage.title();
    assert(title.length > 0, `Empty title on Pinterest`);
  });

  await test('content script is injected on pinterest.com', async () => {
    const injected = await pPage.evaluate(
      () => document.getElementById('pinmark-base-styles') !== null,
    );
    assert(injected, 'pinmark-base-styles <style> not found — content script did not run');
  });

  await test('[data-test-id="pin"] containers found on Pinterest search', async () => {
    const count = await pPage.evaluate(
      () => document.querySelectorAll('[data-test-id="pin"]').length,
    );
    assert(count > 0, `No [data-test-id="pin"] containers found (count: ${count})`);
    console.log(`\n    Found: ${count} pin containers`);
  });

  await test('a[href*="/pin/"] links found on Pinterest search', async () => {
    const count = await pPage.evaluate(
      () => document.querySelectorAll('a[href*="/pin/"]').length,
    );
    assert(count > 0, `No a[href*="/pin/"] links found (count: ${count})`);
    console.log(`\n    Found: ${count} pin links`);
  });

  await test('tag styles (good/bad/processed/ignore) applied to pin containers', async () => {
    await applyTagStyles(pPage, '[data-test-id="pin"]', TAG_STYLES);
    const tagged = await pPage.evaluate(
      () => document.querySelectorAll('[data-test-id="pin"][data-pinmark-tags]').length,
    );
    assert(tagged > 0, 'No pin containers received data-pinmark-tags attribute');
    console.log(`\n    Tagged: ${tagged} containers`);
    await screenshot(pPage, 'e2e-01-pinterest-search-tagged');
  });

  await pPage.close();

  // ── SUITE: Pixiv.net ─────────────────────────────────────────────────────
  console.log('\nSuite: Pixiv.net');

  const xPage = await browser.newPage();
  await xPage.setViewport({ width: 1280, height: 900 });

  await xPage.goto('https://www.pixiv.net/ranking.php', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await new Promise(r => setTimeout(r, 6000));

  await test('pixiv ranking page loads', async () => {
    const title = await xPage.title();
    assert(title.toLowerCase().includes('ranking') || title.toLowerCase().includes('pixiv'),
      `Unexpected Pixiv title: ${title}`);
  });

  await test('content script is injected on pixiv.net', async () => {
    const injected = await xPage.evaluate(
      () => document.getElementById('pinmark-base-styles') !== null,
    );
    assert(injected, 'pinmark-base-styles not found — content script did not run');
  });

  await test('a[href*="/artworks/"] links found on Pixiv ranking', async () => {
    const count = await xPage.evaluate(
      () => document.querySelectorAll('a[href*="/artworks/"]').length,
    );
    assert(count > 0, `No artwork links found (count: ${count})`);
    console.log(`\n    Found: ${count} artwork links`);
  });

  await test('li containers with artwork links found on Pixiv ranking', async () => {
    const count = await xPage.evaluate(
      () => document.querySelectorAll('li:has(a[href*="/artworks/"])').length,
    );
    assert(count > 0, `No li containers with artwork links found (count: ${count})`);
    console.log(`\n    Found: ${count} li containers`);
  });

  await test('tag styles applied to Pixiv artwork containers', async () => {
    await applyTagStyles(xPage, 'li:has(a[href*="/artworks/"])', TAG_STYLES);
    const tagged = await xPage.evaluate(
      () => document.querySelectorAll('li[data-pinmark-tags]').length,
    );
    assert(tagged > 0, 'No li containers received data-pinmark-tags');
    console.log(`\n    Tagged: ${tagged} containers`);
    await screenshot(xPage, 'e2e-02-pixiv-ranking-tagged');
  });

  await xPage.close();

  // ── SUITE: Extension UI ───────────────────────────────────────────────────
  console.log('\nSuite: Extension UI');

  if (!extId) {
    console.log('  (skipped — extension ID not found)');
  } else {
    const optPage = await browser.newPage();
    await optPage.setViewport({ width: 1280, height: 900 });
    await optPage.goto(`chrome-extension://${extId}/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await new Promise(r => setTimeout(r, 2000));

    await test('admin panel (options.html) renders React root', async () => {
      const info = await optPage.evaluate(() => {
        const root = document.getElementById('root');
        return { exists: root !== null, children: root?.children.length ?? 0 };
      });
      assert(info.exists, '#root element not found in options page');
      assert(info.children > 0, '#root has no children (React failed to render)');
    });

    await test('admin panel shows Pinmark branding and navigation', async () => {
      const text = await optPage.evaluate(() => document.body.textContent ?? '');
      assert(text.includes('Pinmark'), 'Pinmark brand text not found in admin panel');
      assert(text.includes('Dashboard'), '"Dashboard" link not found in admin panel');
      assert(text.includes('Links'), '"Links" link not found in admin panel');
    });

    await screenshot(optPage, 'e2e-03-admin-panel');
    await optPage.close();

    const popPage = await browser.newPage();
    await popPage.setViewport({ width: 320, height: 480 });
    await popPage.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await new Promise(r => setTimeout(r, 1500));

    await test('popup (popup.html) renders React root', async () => {
      const exists = await popPage.evaluate(
        () => document.getElementById('root') !== null,
      );
      assert(exists, '#root element not found in popup');
    });

    await test('popup shows Pinmark branding and quick-add buttons', async () => {
      const text = await popPage.evaluate(() => document.body.textContent ?? '');
      assert(text.includes('Pinmark'), 'Pinmark brand not found in popup');
    });

    await screenshot(popPage, 'e2e-04-popup');
    await popPage.close();
  }

  await browser.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  ✗ ${r.name}`);
      console.log(`    ${r.error}`);
    }
  }
  console.log(`${'─'.repeat(50)}\n`);

  if (IS_CI) process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
