/**
 * Dexie.js database schema and helper functions for Pinmark.
 * Provides instant, transactional storage with a unique index on canonicalUrl.
 */
import Dexie, { type Table } from 'dexie';
import type { LinkRecord, LinkList, Settings, Tag } from './types';
import { DEFAULT_TAG_STYLES } from './types';

const DEFAULT_SETTINGS: Settings = {
  tagStyles: DEFAULT_TAG_STYLES,
  normalizationRules: [],
  customTags: [],
  networkInterceptorEnabled: false,
};

export class PinmarkDB extends Dexie {
  links!: Table<LinkRecord, number>;
  lists!: Table<LinkList, number>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('pinmark');
    this.version(1).stores({
      links: '++id, &canonicalUrl, siteKey, *tags, *listIds, createdAt, updatedAt',
      lists: '++id, name, order',
      settings: 'key',
    });
  }
}

export const db = new PinmarkDB();

/**
 * Upserts a link by canonicalUrl. Returns the record id.
 */
export async function upsertLink(
  record: Omit<LinkRecord, 'id' | 'createdAt'>,
): Promise<number> {
  const existing = await db.links.where('canonicalUrl').equals(record.canonicalUrl).first();
  const now = Date.now();
  if (existing?.id !== undefined) {
    await db.links.update(existing.id, { ...record, updatedAt: now });
    return existing.id;
  } else {
    return db.links.add({ ...record, createdAt: now, updatedAt: now });
  }
}

/** Gets all links for a given site */
export async function getLinksBySite(siteKey: string): Promise<LinkRecord[]> {
  return db.links.where('siteKey').equals(siteKey).toArray();
}

/** Gets all links matching a tag */
export async function getLinksByTag(tag: Tag): Promise<LinkRecord[]> {
  return db.links.where('tags').equals(tag).toArray();
}

/** Gets or initializes settings */
export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('main');
  return (row?.value as Settings) ?? DEFAULT_SETTINGS;
}

/** Saves settings */
export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ key: 'main', value: settings });
}

/** Deletes a link by id */
export async function deleteLink(id: number): Promise<void> {
  await db.links.delete(id);
}

/** Gets all links in a list */
export async function getLinksByList(listId: number): Promise<LinkRecord[]> {
  return db.links.where('listIds').equals(listId).toArray();
}
