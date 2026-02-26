import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, truncateUrl } from '../shared/url';

describe('canonicalizeUrl', () => {
  it('strips tracking params from Pinterest URLs', () => {
    const raw = 'https://www.pinterest.com/pin/12345/?utm_source=share&fbclid=abc';
    const result = canonicalizeUrl(raw, 'pinterest');
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('fbclid');
    expect(result).toContain('/pin/12345/');
  });

  it('normalizes Pinterest pin URLs', () => {
    const url1 = canonicalizeUrl('https://pinterest.com/pin/987654321/', 'pinterest');
    const url2 = canonicalizeUrl('https://www.pinterest.com/pin/987654321', 'pinterest');
    expect(url1).toEqual(url2);
  });

  it('normalizes Pixiv artwork URLs', () => {
    const url1 = canonicalizeUrl('https://www.pixiv.net/en/artworks/12345', 'pixiv');
    const url2 = canonicalizeUrl('https://www.pixiv.net/member_illust.php?illust_id=12345', 'pixiv');
    expect(url1).toEqual(url2);
  });

  it('handles invalid URLs gracefully', () => {
    expect(() => canonicalizeUrl('not-a-url', 'generic')).not.toThrow();
  });

  it('lowercases the result', () => {
    const result = canonicalizeUrl('HTTPS://EXAMPLE.COM/PATH', 'generic');
    expect(result).toEqual(result.toLowerCase());
  });
});

describe('truncateUrl', () => {
  it('truncates long URLs', () => {
    const long = 'https://example.com/' + 'a'.repeat(100);
    expect(truncateUrl(long, 60)).toHaveLength(60);
    expect(truncateUrl(long, 60)).toMatch(/\.\.\.$/);
  });

  it('returns short URLs unchanged', () => {
    const short = 'https://example.com/';
    expect(truncateUrl(short, 60)).toEqual(short);
  });
});
