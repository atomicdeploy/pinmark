/**
 * Content script entry point.
 * Detects the current site, initializes the appropriate adapter,
 * injects styles, and manages the sticky top bar for current-page detection.
 */
import { injectBaseStyles } from '../styles/injection';
import { eventBus } from '../shared/events';
import { pinterestAdapter } from './sites/pinterest';
import { pixivAdapter } from './sites/pixiv';
import type { BaseSiteAdapter } from './sites/base';
import { getSettings } from '../shared/db';
import { setStyleSettings } from '../styles/injection';

const ADAPTERS: BaseSiteAdapter[] = [pinterestAdapter, pixivAdapter];

let activeAdapter: BaseSiteAdapter | null = null;

function detectAdapter(): BaseSiteAdapter | null {
  const hostname = window.location.hostname;
  for (const adapter of ADAPTERS) {
    if (adapter.config.hostPatterns.some(p => p.test(hostname))) {
      return adapter;
    }
  }
  return null;
}

async function init(): Promise<void> {
  injectBaseStyles();

  const settings = await getSettings();
  setStyleSettings(settings);

  activeAdapter = detectAdapter();
  if (activeAdapter) {
    activeAdapter.initialize();
  }

  // Listen for link updates to re-scan
  eventBus.on('link:upserted', () => {
    activeAdapter?.refresh();
  });
  eventBus.on('link:deleted', () => {
    activeAdapter?.refresh();
  });
  eventBus.on('settings:updated', async () => {
    const s = await getSettings();
    setStyleSettings(s);
    activeAdapter?.refresh();
  });

  // Check if current page is a tagged link page
  checkCurrentPage();
}

function checkCurrentPage(): void {
  const url = window.location.href;
  if (activeAdapter?.isCurrentPage(url)) {
    injectStickyBar(url);
  }
}

function injectStickyBar(url: string): void {
  // Lazy load sticky bar to avoid bloating content script
  import('../components/StickyBar').then(({ mountStickyBar }) => {
    mountStickyBar(url);
  }).catch(() => {
    // StickyBar unavailable
  });
}

init();

// Re-init on SPA navigation
let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    activeAdapter?.destroy();
    activeAdapter = detectAdapter();
    activeAdapter?.initialize();
    checkCurrentPage();
  }
}).observe(document.body, { childList: true, subtree: true });
