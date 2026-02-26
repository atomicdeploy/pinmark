/**
 * Abstract base site adapter providing default implementation for link
 * scanning, style application, and MutationObserver setup.
 * All site-specific adapters must extend this class.
 */
import type { SiteConfig, SiteKey } from '../../shared/types';
import { db } from '../../shared/db';
import { applyTagStyles } from '../../styles/injection';
import { canonicalizeUrl } from '../../shared/url';

export abstract class BaseSiteAdapter {
  abstract siteKey: SiteKey;
  abstract config: SiteConfig;

  protected observer: MutationObserver | null = null;
  protected processed = new WeakMap<Element, string[]>(); // element -> tags

  /** Initialize observer and do first scan */
  initialize(): void {
    this.scan();
    this.observer = new MutationObserver(() => {
      requestAnimationFrame(() => this.scan());
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  /** Clean up observer */
  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Refresh styles by re-scanning the page */
  refresh(): void {
    this.scan();
  }

  /** Scan page for matching links and apply styles */
  protected async scan(): Promise<void> {
    const elements = document.querySelectorAll<HTMLAnchorElement>(this.config.linkSelector);
    const batch: Array<{ el: Element; canonicalUrl: string }> = [];

    for (const el of elements) {
      const href = el.getAttribute('href');
      if (!href) continue;
      try {
        const absolute = new URL(href, window.location.href).href;
        const canonical = canonicalizeUrl(absolute, this.siteKey);
        batch.push({ el, canonicalUrl: canonical });
      } catch {
        // skip invalid URLs
      }
    }

    if (batch.length === 0) return;

    // Batch Dexie queries
    const urls = batch.map(b => b.canonicalUrl);
    const records = await db.links
      .where('canonicalUrl')
      .anyOf(urls)
      .toArray();

    const recordMap = new Map(records.map(r => [r.canonicalUrl, r]));

    requestAnimationFrame(() => {
      for (const { el, canonicalUrl } of batch) {
        const record = recordMap.get(canonicalUrl);
        const tags = record?.tags ?? [];
        const container = this.config.containerSelector
          ? el.closest(this.config.containerSelector) ?? el
          : el;

        const cached = this.processed.get(container);
        if (cached && JSON.stringify(cached) === JSON.stringify(tags)) continue;

        this.processed.set(container, tags);
        applyTagStyles(container as HTMLElement, tags);
      }
    });
  }

  /** Extract metadata from a link element - override in subclasses */
  extractMetadata(el: Element): Record<string, unknown> {
    return { href: (el as HTMLAnchorElement).href };
  }

  /** Whether the current URL represents a page this adapter handles */
  isCurrentPage(url: string): boolean {
    return this.config.currentPageMatcher(url);
  }
}
