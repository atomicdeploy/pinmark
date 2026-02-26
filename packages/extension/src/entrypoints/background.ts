/**
 * Background service worker for Pinmark.
 * Handles extension lifecycle, message routing, and optional backend sync.
 * Uses the WXT-provided `browser` global (webextension-polyfill) for
 * cross-browser compatibility.
 */
export default defineBackground(() => {
  // Respond to messages from content scripts and popup
  browser.runtime.onMessage.addListener((message, _sender) => {
    if (message?.type === 'ping') {
      return Promise.resolve({ type: 'pong' });
    }
    if (message?.type === 'get-tab-url') {
      return browser.tabs
        .query({ active: true, currentWindow: true })
        .then(tabs => ({ url: tabs[0]?.url ?? null }));
    }
    return undefined;
  });

  // On install/update
  browser.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') {
      // Open options page on first install
      browser.runtime.openOptionsPage?.();
    }
  });

  // Relay storage events to all tabs (event bus bridge for service worker)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!changes['pinmark-event-bus']) return;
    // BroadcastChannel in content scripts handles this directly;
    // this safeguard forwards events to tabs that lack BroadcastChannel support.
    browser.tabs.query({}).then(tabs => {
      for (const tab of tabs) {
        if (tab.id == null) continue;
        browser.tabs
          .sendMessage(tab.id, changes['pinmark-event-bus'].newValue)
          .catch(() => {
            // Tab may not have content script — expected for non-matched pages
          });
      }
    });
  });
});
