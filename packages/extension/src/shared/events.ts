/**
 * Cross-tab event bus using chrome.storage.onChanged + BroadcastChannel.
 * Zero-polling, bidirectional sync across all open tabs and the admin panel.
 */
import type { BusMessage, EventType } from './types';

const CHANNEL_NAME = 'pinmark-events';
const STORAGE_KEY = 'pinmark-event-bus';

type Listener<T = unknown> = (message: BusMessage<T>) => void;

/**
 * EventBus wraps BroadcastChannel (primary) and chrome.storage.onChanged
 * (secondary, for cross-context like service workers) to deliver events
 * to all open extension contexts without polling.
 */
export class EventBus {
  private channel: BroadcastChannel;
  private listeners = new Map<EventType, Set<Listener>>();

  constructor() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (e: MessageEvent<BusMessage>) => {
      this.dispatch(e.data, false);
    };

    // Also listen on chrome.storage for service-worker contexts
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEY]) {
          const msg = changes[STORAGE_KEY].newValue as BusMessage | undefined;
          if (msg) this.dispatch(msg, false);
        }
      });
    }
  }

  /** Publish an event to all tabs */
  publish<T>(type: EventType, payload: T): void {
    const message: BusMessage<T> = { type, payload, timestamp: Date.now() };
    this.channel.postMessage(message);
    // Also write to chrome.storage for background worker
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: message });
    }
  }

  /** Subscribe to an event type */
  on<T>(type: EventType, listener: Listener<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener as Listener);
    return () => this.off(type, listener);
  }

  /** Unsubscribe */
  off<T>(type: EventType, listener: Listener<T>): void {
    this.listeners.get(type)?.delete(listener as Listener);
  }

  private dispatch(message: BusMessage, _rebroadcast: boolean): void {
    const handlers = this.listeners.get(message.type);
    if (handlers) {
      for (const handler of handlers) handler(message);
    }
    // Also dispatch to wildcard listeners if any
    const wildcards = this.listeners.get('*' as EventType);
    if (wildcards) {
      for (const handler of wildcards) handler(message);
    }
  }

  destroy(): void {
    this.channel.close();
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
