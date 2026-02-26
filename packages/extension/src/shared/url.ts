/**
 * URL normalization and canonicalization utilities.
 * Strips tracking parameters and applies site-specific rules to produce
 * a stable canonical URL for deduplication.
 */
import normalizeUrl from 'normalize-url';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'referrer', 'source', 'fbclid', 'gclid', 'igshid', 'mc_eid',
  'mc_cid', '_ga', 'msclkid',
];

/**
 * Canonicalizes a URL for a given site.
 */
export function canonicalizeUrl(rawUrl: string, siteKey: string): string {
  let url: string;
  try {
    url = normalizeUrl(rawUrl, {
      removeQueryParameters: TRACKING_PARAMS.map(p => new RegExp(`^${p}$`)),
      stripHash: true,
      sortQueryParameters: true,
      stripAuthentication: true,
      normalizeProtocol: true,
      forceHttps: false,
    });
  } catch {
    url = rawUrl.toLowerCase().trim();
  }

  // Apply site-specific rules
  switch (siteKey) {
    case 'pinterest':
      return canonicalizePinterest(url);
    case 'pixiv':
      return canonicalizePixiv(url);
    default:
      return url.toLowerCase();
  }
}

/** Pinterest: normalize pin URLs to /pin/{id}/ */
function canonicalizePinterest(url: string): string {
  try {
    const u = new URL(url);
    // /pin/123456789/ -> /pin/123456789
    const pinMatch = u.pathname.match(/\/pin\/(\d+)/);
    if (pinMatch) {
      return `https://www.pinterest.com/pin/${pinMatch[1]}/`.toLowerCase();
    }
    return url.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Pixiv: normalize artwork URLs to /artworks/{id} */
function canonicalizePixiv(url: string): string {
  try {
    const u = new URL(url);
    // /artworks/123 variants
    const artworkMatch = u.pathname.match(/\/artworks\/(\d+)/);
    if (artworkMatch) {
      return `https://www.pixiv.net/en/artworks/${artworkMatch[1]}`.toLowerCase();
    }
    // illust_id= param
    const illustId = u.searchParams.get('illust_id');
    if (illustId) {
      return `https://www.pixiv.net/en/artworks/${illustId}`.toLowerCase();
    }
    return url.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Extracts a display-safe short version of a URL */
export function truncateUrl(url: string, maxLength = 60): string {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength - 3) + '...';
}
