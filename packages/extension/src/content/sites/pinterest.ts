/**
 * Pinterest site adapter.
 * Targets pin card elements and applies tag styles to pin containers.
 */
import type { SiteConfig } from '../../shared/types';
import { canonicalizeUrl } from '../../shared/url';
import { BaseSiteAdapter } from './base';

export class PinterestAdapter extends BaseSiteAdapter {
  siteKey = 'pinterest' as const;

  config: SiteConfig = {
    siteKey: 'pinterest',
    hostPatterns: [/pinterest\.(com|co\.\w+|ca|com\.\w+)$/i],
    linkSelector: 'a[href*="/pin/"]',
    containerSelector: '[data-test-id="pin"], .PinCard, [data-grid-item]',
    extractId(el: Element): string | null {
      const href = (el as HTMLAnchorElement).href;
      const m = href.match(/\/pin\/(\d+)/);
      return m ? m[1] : null;
    },
    canonicalizeUrl(rawUrl: string): string {
      return canonicalizeUrl(rawUrl, 'pinterest');
    },
    currentPageMatcher(url: string): boolean {
      try {
        const u = new URL(url);
        return (
          /pinterest\.(com|co\.\w+|ca)$/i.test(u.hostname) &&
          /\/pin\/\d+/.test(u.pathname)
        );
      } catch {
        return false;
      }
    },
    extractMetadata(el: Element): Record<string, unknown> {
      const anchor = el.closest('a') ?? (el as HTMLAnchorElement);
      const img = el.closest('[data-test-id="pin"]')?.querySelector('img');
      return {
        href: anchor.href,
        pinId: anchor.href.match(/\/pin\/(\d+)/)?.[1] ?? null,
        imageUrl: img?.src ?? null,
        alt: img?.alt ?? null,
      };
    },
  };

  override extractMetadata(el: Element): Record<string, unknown> {
    return this.config.extractMetadata(el);
  }
}

export const pinterestAdapter = new PinterestAdapter();
