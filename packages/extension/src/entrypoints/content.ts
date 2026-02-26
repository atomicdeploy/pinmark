/**
 * Content script WXT entrypoint.
 * Wraps the content script logic so WXT can inject it into matched pages.
 */
import { injectBaseStyles } from '../styles/injection';
import { eventBus } from '../shared/events';
import { pinterestAdapter } from '../content/sites/pinterest';
import { pixivAdapter } from '../content/sites/pixiv';
import type { BaseSiteAdapter } from '../content/sites/base';
import { getSettings } from '../shared/db';
import { setStyleSettings } from '../styles/injection';

export default defineContentScript({
  matches: ['*://*.pinterest.com/*', '*://*.pinterest.co.uk/*', '*://*.pixiv.net/*'],
  runAt: 'document_idle',
  async main() {
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

    function checkCurrentPage(): void {
      const url = window.location.href;
      if (activeAdapter?.isCurrentPage(url)) {
        import('../components/StickyBar').then(({ mountStickyBar }) => {
          mountStickyBar(url, activeAdapter?.siteKey ?? 'generic');
        }).catch(() => {
          // StickyBar chunk not available
        });
      }
    }

    // Initialise styles and active adapter
    injectBaseStyles();
    const settings = await getSettings();
    setStyleSettings(settings);

    activeAdapter = detectAdapter();
    activeAdapter?.initialize();

    // React to DB changes in other tabs
    eventBus.on('link:upserted', () => activeAdapter?.refresh());
    eventBus.on('link:deleted', () => activeAdapter?.refresh());
    eventBus.on('settings:updated', async () => {
      const s = await getSettings();
      setStyleSettings(s);
      activeAdapter?.refresh();
    });

    checkCurrentPage();

    // Handle SPA navigation (Pinterest / Pixiv are both SPAs)
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        activeAdapter?.destroy();
        activeAdapter = detectAdapter();
        activeAdapter?.initialize();
        checkCurrentPage();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  },
});
