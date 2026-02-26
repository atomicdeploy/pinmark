/**
 * Core type definitions for Pinmark.
 * All domain models, configuration types, and event payloads are declared here.
 */

/** Supported site keys */
export type SiteKey = 'pinterest' | 'pixiv' | 'generic';

/** Tag/status labels a link can have */
export type Tag = string; // e.g. 'good', 'bad', 'processed', 'ignore'

/** Visual style applied to a tag */
export interface TagStyle {
  opacity?: number;          // 0-1
  boxShadow?: string;        // CSS box-shadow value
  backgroundColor?: string;  // CSS color
  borderColor?: string;
  outline?: string;
  animation?: 'none' | 'pulse' | 'fade';
}

/** Default tag styles map */
export const DEFAULT_TAG_STYLES: Record<string, TagStyle> = {
  good: { boxShadow: '0 0 0 3px rgba(72,199,142,0.7)', backgroundColor: 'rgba(72,199,142,0.08)' },
  bad: { boxShadow: '0 0 0 3px rgba(255,99,99,0.7)', backgroundColor: 'rgba(255,99,99,0.12)', opacity: 0.6 },
  processed: { opacity: 0.35 },
  ignore: { opacity: 0.2, backgroundColor: 'rgba(100,100,100,0.15)' },
};

/** A saved link record */
export interface LinkRecord {
  id?: number;
  canonicalUrl: string;
  siteKey: SiteKey;
  tags: Tag[];
  metadata: Record<string, unknown>;
  listIds: number[];
  createdAt: number; // Unix ms
  updatedAt: number; // Unix ms
}

/** A named list of links */
export interface LinkList {
  id?: number;
  name: string;
  description?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** Per-site configuration */
export interface SiteConfig {
  siteKey: SiteKey;
  hostPatterns: RegExp[];
  linkSelector: string;
  containerSelector?: string;
  extractId(el: Element): string | null;
  canonicalizeUrl(rawUrl: string): string;
  currentPageMatcher(url: string): boolean;
  extractMetadata(el: Element): Record<string, unknown>;
}

/** Event bus message types */
export type EventType =
  | 'link:upserted'
  | 'link:deleted'
  | 'list:created'
  | 'list:updated'
  | 'list:deleted'
  | 'settings:updated';

export interface BusMessage<T = unknown> {
  type: EventType;
  payload: T;
  timestamp: number;
}

/** Extension settings */
export interface Settings {
  tagStyles: Record<string, TagStyle>;
  normalizationRules: NormalizationRule[];
  customTags: CustomTag[];
  networkInterceptorEnabled: boolean;
}

export interface NormalizationRule {
  pattern: string;
  stripParams: string[];
}

export interface CustomTag {
  name: Tag;
  color: string;
  description?: string;
}

/** Export formats */
export type ExportFormat = 'json' | 'urls' | 'ytdlp' | 'tsv';

export interface ExportOptions {
  format: ExportFormat;
  listIds?: number[];
  tags?: Tag[];
  siteKeys?: SiteKey[];
}
