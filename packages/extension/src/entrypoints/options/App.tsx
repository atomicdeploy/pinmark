/**
 * Admin panel SPA for Pinmark browser extension.
 * Provides full CRUD management of saved links with real-time updates.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { db, upsertLink, deleteLink, getSettings, saveSettings } from '../../shared/db';
import { eventBus } from '../../shared/events';
import type { LinkRecord, Tag, Settings, TagStyle } from '../../shared/types';
import { DEFAULT_TAG_STYLES } from '../../shared/types';
import { truncateUrl } from '../../shared/url';

// ─── Theme ───────────────────────────────────────────────────────────────────
const theme = {
  bg: '#0f0f14',
  surface: '#1a1a24',
  surface2: '#22222e',
  accent: '#7c6af7',
  accentHover: '#9b8df9',
  text: '#e1e1e8',
  textMuted: '#888898',
  border: 'rgba(255,255,255,0.07)',
  good: '#48c78e',
  bad: '#ff6363',
  processed: '#888',
  ignore: '#555',
};

const TAG_COLORS: Record<string, string> = {
  good: theme.good,
  bad: theme.bad,
  processed: theme.processed,
  ignore: theme.ignore,
};

// ─── Shared Components ────────────────────────────────────────────────────────
function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: (TAG_COLORS[tag] ?? theme.accent) + '22',
      color: TAG_COLORS[tag] ?? theme.accent,
      border: `1px solid ${(TAG_COLORS[tag] ?? theme.accent)}55`,
      borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600,
      userSelect: 'none',
    }}>
      {tag}
      {onRemove && (
        <span onClick={onRemove} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
      )}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: theme.surface, borderRadius: 12,
      padding: '20px 24px', minWidth: 140,
      border: `1px solid ${theme.border}`,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? theme.accent }}>{value}</div>
      <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
type Page = 'dashboard' | 'links' | 'import-export' | 'settings';

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◉' },
  { id: 'links', label: 'Links', icon: '🔗' },
  { id: 'import-export', label: 'Import / Export', icon: '⇄' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    byTag: {} as Record<string, number>,
    bySite: {} as Record<string, number>,
    recent: [] as LinkRecord[],
  });

  const load = useCallback(async () => {
    const links = await db.links.toArray();
    const byTag: Record<string, number> = {};
    const bySite: Record<string, number> = {};
    for (const l of links) {
      bySite[l.siteKey] = (bySite[l.siteKey] ?? 0) + 1;
      for (const t of l.tags) byTag[t] = (byTag[t] ?? 0) + 1;
    }
    const recent = links.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10);
    setStats({ total: links.length, byTag, bySite, recent });
  }, []);

  useEffect(() => {
    load();
    const u1 = eventBus.on('link:upserted', load);
    const u2 = eventBus.on('link:deleted', load);
    return () => { u1(); u2(); };
  }, [load]);

  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Dashboard</h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard label="Total Links" value={stats.total} />
        {Object.entries(stats.byTag).map(([tag, count]) => (
          <StatCard key={tag} label={tag} value={count} color={TAG_COLORS[tag]} />
        ))}
        {Object.entries(stats.bySite).map(([site, count]) => (
          <StatCard key={site} label={site} value={count} color={theme.textMuted} />
        ))}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: theme.textMuted }}>
        Recent Activity
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stats.recent.map(l => (
          <div key={l.canonicalUrl} style={{
            background: theme.surface, borderRadius: 8, padding: '10px 16px',
            border: `1px solid ${theme.border}`, display: 'flex', gap: 12, alignItems: 'center',
          }}>
            <span style={{ color: theme.textMuted, fontSize: 12, minWidth: 80 }}>
              {new Date(l.updatedAt).toLocaleDateString()}
            </span>
            <span style={{ flex: 1, color: theme.text, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {truncateUrl(l.canonicalUrl, 60)}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {l.tags.map(t => <TagPill key={t} tag={t} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Links Table ──────────────────────────────────────────────────────────────
function LinksPage() {
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [tagInput, setTagInput] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const all = await db.links.orderBy('updatedAt').reverse().toArray();
    setLinks(all);
  }, []);

  useEffect(() => {
    load();
    const u1 = eventBus.on('link:upserted', load);
    const u2 = eventBus.on('link:deleted', load);
    return () => { u1(); u2(); };
  }, [load]);

  const removeTag = async (record: LinkRecord, tag: Tag) => {
    if (!record.id) return;
    const tags = record.tags.filter(t => t !== tag);
    await upsertLink({ ...record, tags, updatedAt: Date.now() });
    eventBus.publish('link:upserted', { canonicalUrl: record.canonicalUrl });
    await load();
  };

  const addTag = async (record: LinkRecord, tag: Tag) => {
    if (!tag.trim() || !record.id) return;
    const tags = Array.from(new Set([...record.tags, tag.trim()]));
    await upsertLink({ ...record, tags, updatedAt: Date.now() });
    eventBus.publish('link:upserted', { canonicalUrl: record.canonicalUrl });
    await load();
    setTagInput(p => ({ ...p, [record.id!]: '' }));
  };

  const handleDelete = async (id: number) => {
    await deleteLink(id);
    eventBus.publish('link:deleted', { id });
    await load();
  };

  const columns: ColumnDef<LinkRecord>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input type="checkbox" checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()} />
      ),
      cell: ({ row }) => (
        <input type="checkbox" checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()} />
      ),
      size: 36,
    },
    {
      accessorKey: 'canonicalUrl',
      header: 'URL',
      cell: ({ getValue }) => {
        const url = getValue<string>();
        return (
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ color: theme.accent, textDecoration: 'none', fontSize: 13 }}
            title={url}
          >
            {truncateUrl(url, 55)}
          </a>
        );
      },
    },
    {
      accessorKey: 'siteKey',
      header: 'Site',
      size: 90,
      cell: ({ getValue }) => (
        <span style={{ color: theme.textMuted, fontSize: 12 }}>{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      cell: ({ row }) => {
        const record = row.original;
        return (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {record.tags.map(tag => (
              <TagPill key={tag} tag={tag} onRemove={() => removeTag(record, tag)} />
            ))}
            <input
              value={tagInput[record.id ?? 0] ?? ''}
              onChange={e => setTagInput(p => ({ ...p, [record.id!]: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') addTag(record, tagInput[record.id ?? 0] ?? '');
              }}
              placeholder="+ tag"
              style={{
                background: theme.surface2, border: `1px solid ${theme.border}`,
                borderRadius: 8, color: theme.text, fontSize: 11, padding: '2px 6px',
                width: 60, outline: 'none',
              }}
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated',
      size: 100,
      cell: ({ getValue }) => (
        <span style={{ color: theme.textMuted, fontSize: 12 }}>
          {new Date(getValue<number>()).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      cell: ({ row }) => (
        <button
          onClick={() => row.original.id != null && handleDelete(row.original.id)}
          style={{
            background: 'transparent', border: `1px solid ${theme.border}`,
            color: theme.bad, borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Del
        </button>
      ),
    },
  ];

  const table = useReactTable({
    data: links,
    columns,
    state: { sorting, columnFilters, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: row => String(row.id),
  });

  const selectedIds = Object.keys(rowSelection)
    .filter(k => rowSelection[k])
    .map(Number);

  const bulkDelete = async () => {
    for (const id of selectedIds) {
      await deleteLink(id);
      eventBus.publish('link:deleted', { id });
    }
    setRowSelection({});
    await load();
  };

  const exportSelected = () => {
    const selected = links.filter(l => l.id != null && selectedIds.includes(l.id));
    const json = JSON.stringify(selected.length > 0 ? selected : links, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pinmark-export.json';
    a.click();
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>Links</h2>
        <input
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder="Search..."
          style={{
            background: theme.surface, border: `1px solid ${theme.border}`,
            borderRadius: 8, color: theme.text, padding: '6px 12px', fontSize: 13,
            outline: 'none', width: 200,
          }}
        />
        {selectedIds.length > 0 && (
          <button onClick={bulkDelete} style={{
            background: theme.bad + '22', color: theme.bad,
            border: `1px solid ${theme.bad}44`, borderRadius: 8,
            padding: '6px 14px', cursor: 'pointer', fontSize: 13,
          }}>
            Delete {selectedIds.length} selected
          </button>
        )}
        <button onClick={exportSelected} style={{
          background: theme.accent + '22', color: theme.accent,
          border: `1px solid ${theme.accent}44`, borderRadius: 8,
          padding: '6px 14px', cursor: 'pointer', fontSize: 13,
        }}>
          Export JSON
        </button>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${theme.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} style={{ background: theme.surface }}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    style={{
                      padding: '12px 14px', textAlign: 'left', fontSize: 12,
                      color: theme.textMuted, fontWeight: 600, letterSpacing: '0.05em',
                      cursor: h.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none', width: h.getSize() !== 150 ? h.getSize() : undefined,
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{
                borderBottom: `1px solid ${theme.border}`,
                transition: 'background 150ms',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = theme.surface)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '10px 14px', fontSize: 13 }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ padding: 32, textAlign: 'center', color: theme.textMuted }}>
                  No links saved yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Import / Export ──────────────────────────────────────────────────────────
function ImportExportPage() {
  const [preview, setPreview] = useState<LinkRecord[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportAll = async (format: 'json' | 'urls' | 'tsv') => {
    const links = await db.links.toArray();
    let content = '';
    let mime = 'application/json';
    let ext = 'json';
    if (format === 'json') {
      content = JSON.stringify(links, null, 2);
    } else if (format === 'urls') {
      content = links.map(l => l.canonicalUrl).join('\n');
      mime = 'text/plain'; ext = 'txt';
    } else if (format === 'tsv') {
      const header = 'url\tsite\ttags\tcreatedAt\tupdatedAt';
      const rows = links.map(l =>
        [l.canonicalUrl, l.siteKey, l.tags.join(','),
          new Date(l.createdAt).toISOString(), new Date(l.updatedAt).toISOString()].join('\t')
      );
      content = [header, ...rows].join('\n');
      mime = 'text/tab-separated-values'; ext = 'tsv';
    }
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pinmark-export.${ext}`;
    a.click();
  };

  const parseFile = async (file: File) => {
    const text = await file.text();
    try {
      const data = JSON.parse(text) as unknown;
      if (Array.isArray(data)) {
        setPreview(data as LinkRecord[]);
      }
    } catch {
      alert('Invalid JSON file');
    }
  };

  const importData = async () => {
    if (!preview) return;
    for (const record of preview) {
      await upsertLink({
        canonicalUrl: record.canonicalUrl,
        siteKey: record.siteKey,
        tags: record.tags,
        metadata: record.metadata ?? {},
        listIds: record.listIds ?? [],
        updatedAt: Date.now(),
      });
    }
    eventBus.publish('link:upserted', { count: preview.length });
    setPreview(null);
    alert(`Imported ${preview.length} links!`);
  };

  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Import / Export</h2>

      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: theme.textMuted }}>Export</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['json', 'urls', 'tsv'] as const).map(fmt => (
            <button key={fmt} onClick={() => exportAll(fmt)} style={{
              background: theme.surface, border: `1px solid ${theme.border}`,
              color: theme.text, borderRadius: 8, padding: '8px 20px',
              cursor: 'pointer', fontSize: 13,
            }}>
              Export {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: theme.textMuted }}>Import</h3>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) parseFile(file);
          }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? theme.accent : theme.border}`,
            borderRadius: 12, padding: 40,
            textAlign: 'center', cursor: 'pointer',
            color: theme.textMuted, fontSize: 14,
            background: dragOver ? theme.accent + '11' : theme.surface,
            transition: 'all 200ms',
          }}
        >
          Drag &amp; drop a JSON file here, or click to browse
          <input ref={fileRef} type="file" accept=".json"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])} />
        </div>

        {preview && (
          <div style={{ marginTop: 20 }}>
            <div style={{ marginBottom: 12, color: theme.text }}>
              Preview: {preview.length} links to import
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 16,
              background: theme.surface, borderRadius: 8, padding: 12,
              border: `1px solid ${theme.border}`, fontSize: 12, color: theme.textMuted }}>
              {preview.slice(0, 20).map((l, i) => (
                <div key={i}>{l.canonicalUrl} [{l.tags.join(', ')}]</div>
              ))}
              {preview.length > 20 && <div>...and {preview.length - 20} more</div>}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={importData} style={{
                background: theme.accent, color: '#fff',
                border: 'none', borderRadius: 8, padding: '8px 20px',
                cursor: 'pointer', fontSize: 13,
              }}>
                Import {preview.length} Links
              </button>
              <button onClick={() => setPreview(null)} style={{
                background: theme.surface, color: theme.textMuted,
                border: `1px solid ${theme.border}`, borderRadius: 8,
                padding: '8px 20px', cursor: 'pointer', fontSize: 13,
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    tagStyles: DEFAULT_TAG_STYLES,
    normalizationRules: [],
    customTags: [],
    networkInterceptorEnabled: false,
  });
  const [newTagName, setNewTagName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const save = async () => {
    await saveSettings(settings);
    eventBus.publish('settings:updated', settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateTagStyle = (tag: string, key: keyof TagStyle, value: string | number) => {
    setSettings(prev => ({
      ...prev,
      tagStyles: {
        ...prev.tagStyles,
        [tag]: { ...prev.tagStyles[tag], [key]: value },
      },
    }));
  };

  const addCustomTag = () => {
    if (!newTagName.trim()) return;
    setSettings(prev => ({
      ...prev,
      customTags: [...prev.customTags, { name: newTagName.trim(), color: '#7c6af7' }],
      tagStyles: { ...prev.tagStyles, [newTagName.trim()]: {} },
    }));
    setNewTagName('');
  };

  const allTags = [
    ...Object.keys(settings.tagStyles),
    ...settings.customTags.map(t => t.name).filter(n => !settings.tagStyles[n]),
  ];

  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>Settings</h2>
        <button onClick={save} style={{
          background: saved ? theme.good : theme.accent,
          color: '#fff', border: 'none', borderRadius: 8,
          padding: '8px 20px', cursor: 'pointer', fontSize: 13,
          transition: 'background 300ms',
        }}>
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: theme.textMuted }}>
        Tag Styles
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
        {allTags.map(tag => {
          const s = settings.tagStyles[tag] ?? {};
          return (
            <div key={tag} style={{
              background: theme.surface, borderRadius: 10,
              padding: '14px 18px', border: `1px solid ${theme.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <TagPill tag={tag} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: theme.textMuted }}>
                  Opacity (0–1)
                  <input type="range" min={0} max={1} step={0.05}
                    value={s.opacity ?? 1}
                    onChange={e => updateTagStyle(tag, 'opacity', parseFloat(e.target.value))}
                    style={{ accentColor: theme.accent }}
                  />
                  <span style={{ color: theme.text }}>{s.opacity ?? 1}</span>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: theme.textMuted }}>
                  Box Shadow
                  <input type="text"
                    value={s.boxShadow ?? ''}
                    onChange={e => updateTagStyle(tag, 'boxShadow', e.target.value)}
                    style={{
                      background: theme.surface2, border: `1px solid ${theme.border}`,
                      borderRadius: 6, color: theme.text, padding: '4px 8px', fontSize: 12,
                      outline: 'none',
                    }}
                    placeholder="e.g. 0 0 0 3px rgba(72,199,142,0.7)"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: theme.textMuted }}>
                  Background Color
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color"
                      value={s.backgroundColor?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#000000'}
                      onChange={e => updateTagStyle(tag, 'backgroundColor', e.target.value)}
                    />
                    <input type="text"
                      value={s.backgroundColor ?? ''}
                      onChange={e => updateTagStyle(tag, 'backgroundColor', e.target.value)}
                      style={{
                        background: theme.surface2, border: `1px solid ${theme.border}`,
                        borderRadius: 6, color: theme.text, padding: '4px 8px', fontSize: 12,
                        outline: 'none', flex: 1,
                      }}
                    />
                  </div>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: theme.textMuted }}>
        Add Custom Tag
      </h3>
      <div style={{ display: 'flex', gap: 10 }}>
        <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustomTag()}
          placeholder="Tag name..."
          style={{
            background: theme.surface, border: `1px solid ${theme.border}`,
            borderRadius: 8, color: theme.text, padding: '8px 12px', fontSize: 13,
            outline: 'none', flex: 1,
          }}
        />
        <button onClick={addCustomTag} style={{
          background: theme.accent, color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
        }}>
          Add
        </button>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div style={{ display: 'flex', height: '100vh', background: theme.bg }}>
      {/* Sidebar */}
      <div style={{
        width: 200, background: theme.surface, borderRight: `1px solid ${theme.border}`,
        display: 'flex', flexDirection: 'column', padding: '24px 0',
        flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px 24px', borderBottom: `1px solid ${theme.border}`, marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: theme.accent, letterSpacing: '-0.02em' }}>
            📌 Pinmark
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Admin Panel</div>
        </div>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => setPage(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', cursor: 'pointer', fontSize: 14,
              background: page === item.id ? theme.accent + '22' : 'transparent',
              color: page === item.id ? theme.accent : theme.textMuted,
              border: 'none', textAlign: 'left', borderLeft: page === item.id ? `2px solid ${theme.accent}` : '2px solid transparent',
              transition: 'all 150ms',
            }}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'links' && <LinksPage />}
        {page === 'import-export' && <ImportExportPage />}
        {page === 'settings' && <SettingsPage />}
      </div>
    </div>
  );
}
