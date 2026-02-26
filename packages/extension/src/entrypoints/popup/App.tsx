/**
 * Popup UI for Pinmark browser extension.
 * Shows the current page URL, its tags, and provides quick tag management.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { db, upsertLink } from '../../shared/db';
import { eventBus } from '../../shared/events';
import { canonicalizeUrl } from '../../shared/url';
import type { LinkRecord, Tag } from '../../shared/types';

const theme = {
  bg: '#0f0f14', surface: '#1a1a24',
  accent: '#7c6af7', text: '#e1e1e8', textMuted: '#888898',
  border: 'rgba(255,255,255,0.07)',
  good: '#48c78e', bad: '#ff6363',
};

const TAG_COLORS: Record<string, string> = {
  good: '#48c78e', bad: '#ff6363', processed: '#888', ignore: '#555',
};

const QUICK_TAGS: Tag[] = ['good', 'bad', 'processed', 'ignore'];

export default function PopupApp() {
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [record, setRecord] = useState<LinkRecord | null>(null);
  const [siteCount, setSiteCount] = useState(0);

  const load = useCallback(async (url: string) => {
    if (!url) return;
    const canonical = canonicalizeUrl(url, detectSite(url));
    const found = await db.links.where('canonicalUrl').equals(canonical).first();
    setRecord(found ?? null);
    const site = detectSite(url);
    const count = await db.links.where('siteKey').equals(site).count();
    setSiteCount(count);
  }, []);

  function detectSite(url: string): string {
    try {
      const h = new URL(url).hostname;
      if (h.includes('pinterest')) return 'pinterest';
      if (h.includes('pixiv')) return 'pixiv';
      return 'generic';
    } catch {
      return 'generic';
    }
  }

  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      const url = tabs[0]?.url ?? '';
      setCurrentUrl(url);
      load(url);
    });
    const unsub = eventBus.on('link:upserted', () => load(currentUrl));
    return unsub;
  }, [load, currentUrl]);

  const canonical = currentUrl ? canonicalizeUrl(currentUrl, detectSite(currentUrl)) : '';

  const addTag = async (tag: Tag) => {
    if (!canonical) return;
    const tags = Array.from(new Set([...(record?.tags ?? []), tag]));
    await upsertLink({
      canonicalUrl: canonical,
      siteKey: detectSite(currentUrl) as 'pinterest' | 'pixiv' | 'generic',
      tags, metadata: {}, listIds: [],
      updatedAt: Date.now(),
    });
    eventBus.publish('link:upserted', { canonicalUrl: canonical });
    await load(currentUrl);
  };

  const removeTag = async (tag: Tag) => {
    if (!canonical || !record) return;
    const tags = record.tags.filter(t => t !== tag);
    await upsertLink({ ...record, tags, updatedAt: Date.now() });
    eventBus.publish('link:upserted', { canonicalUrl: canonical });
    await load(currentUrl);
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>📌</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: theme.accent }}>Pinmark</span>
        <span style={{ fontSize: 11, color: theme.textMuted, flex: 1, textAlign: 'right' }}>
          {siteCount} on site
        </span>
      </div>

      <div style={{
        background: theme.surface, borderRadius: 8, padding: '10px 12px',
        border: `1px solid ${theme.border}`, fontSize: 11, color: theme.textMuted,
        wordBreak: 'break-all',
      }}>
        {canonical || 'No URL detected'}
      </div>

      <div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>Current Tags</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 28 }}>
          {(record?.tags ?? []).map(tag => (
            <span key={tag} onClick={() => removeTag(tag)} style={{
              background: (TAG_COLORS[tag] ?? theme.accent) + '22',
              color: TAG_COLORS[tag] ?? theme.accent,
              border: `1px solid ${(TAG_COLORS[tag] ?? theme.accent)}55`,
              borderRadius: 12, padding: '3px 10px', fontSize: 12,
              cursor: 'pointer', userSelect: 'none',
            }}>
              {tag} ×
            </span>
          ))}
          {(record?.tags ?? []).length === 0 && (
            <span style={{ color: theme.textMuted, fontSize: 12 }}>No tags yet</span>
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>Quick Add</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {QUICK_TAGS.filter(t => !(record?.tags ?? []).includes(t)).map(tag => (
            <button key={tag} onClick={() => addTag(tag)} style={{
              background: theme.surface, color: TAG_COLORS[tag] ?? theme.textMuted,
              border: `1px solid ${theme.border}`, borderRadius: 8,
              padding: '5px 12px', cursor: 'pointer', fontSize: 12,
              transition: 'background 150ms',
            }}>
              + {tag}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => browser.runtime.openOptionsPage()}
        style={{
          background: theme.accent, color: '#fff', border: 'none',
          borderRadius: 8, padding: '10px', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, width: '100%',
        }}
      >
        Open Admin Panel →
      </button>
    </div>
  );
}
