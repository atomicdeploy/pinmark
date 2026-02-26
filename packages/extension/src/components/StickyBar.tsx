/**
 * Sticky top bar component injected into pages when the current URL
 * matches a known canonical link. Renders into a Shadow DOM to isolate
 * styles from the host page.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { db, upsertLink } from '../shared/db';
import { eventBus } from '../shared/events';
import type { LinkRecord, Tag } from '../shared/types';

const BAR_HEIGHT = 40;
const HOST_ID = 'pinmark-sticky-bar-host';

interface StickyBarProps {
  url: string;
  siteKey: string;
}

const COMMON_TAGS: Tag[] = ['good', 'bad', 'processed', 'ignore'];

const TAG_COLORS: Record<string, string> = {
  good: '#48c78e',
  bad: '#ff6363',
  processed: '#888',
  ignore: '#666',
};

function StickyBar({ url, siteKey }: StickyBarProps): React.ReactElement {
  const [record, setRecord] = useState<LinkRecord | null>(null);

  const load = useCallback(async () => {
    const found = await db.links.where('canonicalUrl').equals(url).first();
    setRecord(found ?? null);
  }, [url]);

  useEffect(() => {
    load();
    const unsub = eventBus.on('link:upserted', load);
    return unsub;
  }, [load]);

  const addTag = async (tag: Tag): Promise<void> => {
    const tags = Array.from(new Set([...(record?.tags ?? []), tag]));
    await upsertLink({
      canonicalUrl: url,
      siteKey: siteKey as 'pinterest' | 'pixiv' | 'generic',
      tags,
      metadata: record?.metadata ?? {},
      listIds: record?.listIds ?? [],
      updatedAt: Date.now(),
    });
    eventBus.publish('link:upserted', { canonicalUrl: url, tags });
    await load();
  };

  const removeTag = async (tag: Tag): Promise<void> => {
    const tags = (record?.tags ?? []).filter(t => t !== tag);
    await upsertLink({
      canonicalUrl: url,
      siteKey: siteKey as 'pinterest' | 'pixiv' | 'generic',
      tags,
      metadata: record?.metadata ?? {},
      listIds: record?.listIds ?? [],
      updatedAt: Date.now(),
    });
    eventBus.publish('link:upserted', { canonicalUrl: url, tags });
    await load();
  };

  const copyUrl = (): void => {
    navigator.clipboard.writeText(url).catch(() => {});
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '0 16px',
      height: `${BAR_HEIGHT}px`,
      background: 'rgba(18,18,24,0.95)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      color: '#fff',
      overflow: 'hidden',
    }}>
      <span style={{ color: '#888', fontWeight: 600, letterSpacing: '0.05em', marginRight: 4 }}>
        📌
      </span>
      <span style={{ color: '#aaa', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {url}
      </span>
      <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'nowrap', overflow: 'hidden' }}>
        {(record?.tags ?? []).map(tag => (
          <span
            key={tag}
            onClick={() => removeTag(tag)}
            style={{
              background: TAG_COLORS[tag] ?? '#555',
              color: '#fff',
              borderRadius: 12,
              padding: '2px 10px',
              fontSize: 12,
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'opacity 200ms',
            }}
            title={`Remove tag: ${tag}`}
          >
            {tag} ×
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {COMMON_TAGS.filter(t => !(record?.tags ?? []).includes(t)).map(tag => (
          <button
            key={tag}
            onClick={() => addTag(tag)}
            style={{
              background: 'rgba(255,255,255,0.07)',
              color: '#ccc',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '2px 8px',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'background 200ms',
            }}
            title={`Add tag: ${tag}`}
          >
            + {tag}
          </button>
        ))}
      </div>
      <button
        onClick={copyUrl}
        style={{
          background: 'rgba(255,255,255,0.07)',
          color: '#ccc',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '2px 8px',
          fontSize: 11,
          cursor: 'pointer',
          marginLeft: 4,
        }}
      >
        Copy URL
      </button>
    </div>
  );
}

export function mountStickyBar(url: string, siteKey = 'generic'): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483647;
    height: ${BAR_HEIGHT}px;
  `;
  document.body.appendChild(host);
  document.body.style.paddingTop = `${BAR_HEIGHT}px`;

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(<StickyBar url={url} siteKey={siteKey} />);
}
