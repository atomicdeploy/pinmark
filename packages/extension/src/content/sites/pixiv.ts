/**
 * Pixiv site adapter.
 * Targets artwork thumbnail containers and normalizes artwork URLs.
 */
import type { SiteConfig } from '../../shared/types';
import { canonicalizeUrl } from '../../shared/url';
import { BaseSiteAdapter } from './base';

export class PixivAdapter extends BaseSiteAdapter {
  siteKey = 'pixiv' as const;

  config: SiteConfig = {
    siteKey: 'pixiv',
    hostPatterns: [/pixiv\.net$/i],
    linkSelector: 'a[href*="/artworks/"], a[href*="illust_id="]',
    containerSelector: '.work, [data-gtm-value], li.image-item',
    extractId(el: Element): string | null {
      const href = (el as HTMLAnchorElement).href;
      const artworkMatch = href.match(/\/artworks\/(\d+)/);
      if (artworkMatch) return artworkMatch[1];
      try {
        const u = new URL(href);
        return u.searchParams.get('illust_id');
      } catch {
        return null;
      }
    },
    canonicalizeUrl(rawUrl: string): string {
      return canonicalizeUrl(rawUrl, 'pixiv');
    },
    currentPageMatcher(url: string): boolean {
      try {
        const u = new URL(url);
        return (
          /pixiv\.net$/i.test(u.hostname) &&
          (/\/artworks\/\d+/.test(u.pathname) || u.searchParams.has('illust_id'))
        );
      } catch {
        return false;
      }
    },
    extractMetadata(el: Element): Record<string, unknown> {
      const anchor = el.closest('a') ?? (el as HTMLAnchorElement);
      const img = el.closest('li, [data-gtm-value]')?.querySelector('img');
      return {
        href: anchor.href,
        artworkId: anchor.href.match(/\/artworks\/(\d+)/)?.[1] ?? null,
        imageUrl: img?.src ?? null,
        alt: img?.alt ?? null,
      };
    },
  };

  override extractMetadata(el: Element): Record<string, unknown> {
    return this.config.extractMetadata(el);
  }
}

export const pixivAdapter = new PixivAdapter();
