/**
 * Background service worker for Pinmark.
 * Handles extension lifecycle, message routing, and optional backend sync.
 */
import { eventBus } from '../shared/events';

// Keep service worker alive by responding to messages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ping') {
    sendResponse({ type: 'pong' });
  }
  if (message?.type === 'get-tab-url') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      sendResponse({ url: tabs[0]?.url ?? null });
    });
    return true; // async
  }
  return false;
});

// On install/update
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage?.();
  }
});

// Relay storage events to all tabs (event bus bridge for service worker)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes['pinmark-event-bus']) return;
  // BroadcastChannel in content scripts handles this directly
  // This is just a safeguard for contexts without BroadcastChannel
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, changes['pinmark-event-bus'].newValue).catch(() => {
        // Tab may not have content script
      });
    }
  });
});

// Reference eventBus to ensure it's initialized in the service worker context
void eventBus;
