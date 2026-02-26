import { describe, it, expect, beforeEach } from 'vitest';
import { db, upsertLink, getLinksBySite, getLinksByTag } from '../shared/db';

beforeEach(async () => {
  // Clear all tables before each test for a clean state
  await db.links.clear();
  await db.lists.clear();
  await db.settings.clear();
});

describe('upsertLink', () => {
  it('creates a new link', async () => {
    const id = await upsertLink({
      canonicalUrl: 'https://www.pinterest.com/pin/123/',
      siteKey: 'pinterest',
      tags: ['good'],
      metadata: {},
      listIds: [],
      updatedAt: Date.now(),
    });
    expect(typeof id).toBe('number');
  });

  it('updates existing link by canonicalUrl', async () => {
    const url = 'https://www.pinterest.com/pin/456/';
    const id1 = await upsertLink({
      canonicalUrl: url, siteKey: 'pinterest',
      tags: ['good'], metadata: {}, listIds: [], updatedAt: Date.now(),
    });
    const id2 = await upsertLink({
      canonicalUrl: url, siteKey: 'pinterest',
      tags: ['good', 'processed'], metadata: {}, listIds: [], updatedAt: Date.now(),
    });
    expect(id1).toEqual(id2);
    const record = await db.links.get(id1);
    expect(record?.tags).toContain('processed');
  });
});

describe('getLinksBySite', () => {
  it('returns links for a given site', async () => {
    await upsertLink({ canonicalUrl: 'https://www.pinterest.com/pin/1/', siteKey: 'pinterest', tags: [], metadata: {}, listIds: [], updatedAt: Date.now() });
    await upsertLink({ canonicalUrl: 'https://www.pixiv.net/en/artworks/1', siteKey: 'pixiv', tags: [], metadata: {}, listIds: [], updatedAt: Date.now() });
    const pins = await getLinksBySite('pinterest');
    expect(pins.length).toBe(1);
    expect(pins[0].siteKey).toBe('pinterest');
  });
});

describe('getLinksByTag', () => {
  it('returns links with a given tag', async () => {
    await upsertLink({ canonicalUrl: 'https://example.com/1', siteKey: 'generic', tags: ['good'], metadata: {}, listIds: [], updatedAt: Date.now() });
    await upsertLink({ canonicalUrl: 'https://example.com/2', siteKey: 'generic', tags: ['bad'], metadata: {}, listIds: [], updatedAt: Date.now() });
    const good = await getLinksByTag('good');
    expect(good.length).toBe(1);
    expect(good[0].canonicalUrl).toBe('https://example.com/1');
  });
});
