/**
 * Optional Hono backend for Pinmark.
 * Provides REST API and SSE endpoint for real-time sync with the admin panel.
 * Uses SQLite (better-sqlite3) as persistent storage.
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import Database from 'better-sqlite3';
import { resolve } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

const DB_DIR = resolve(homedir(), '.pinmark');
const DB_PATH = resolve(DB_DIR, 'pinmark.db');
mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonicalUrl TEXT UNIQUE NOT NULL,
    siteKey TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    listIds TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
`);

// SSE subscribers
const sseClients = new Set<(data: string) => void>();

function broadcast(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) client(msg);
}

const app = new Hono();
app.use('*', cors());

// ── Links ────────────────────────────────────────────────────────────────────
app.get('/api/links', c => {
  const { tag, site, page = '1', limit = '50' } = c.req.query();
  let query = 'SELECT * FROM links WHERE 1=1';
  const params: unknown[] = [];
  // Match JSON-encoded tag exactly (e.g. `"good"` inside `["good","processed"]`)
  if (tag) { query += ' AND tags LIKE ?'; params.push(`%"${tag}"%`); }
  if (site) { query += ' AND siteKey = ?'; params.push(site); }
  query += ` LIMIT ? OFFSET ?`;
  params.push(Number(limit), (Number(page) - 1) * Number(limit));
  const rows = db.prepare(query).all(...params);
  return c.json({ links: rows });
});

app.post('/api/links', async c => {
  const body = await c.req.json<{
    canonicalUrl: string; siteKey: string;
    tags?: string[]; metadata?: Record<string, unknown>; listIds?: number[];
  }>();
  const now = Date.now();
  db.prepare(`
    INSERT INTO links (canonicalUrl, siteKey, tags, metadata, listIds, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonicalUrl) DO UPDATE SET
      tags = excluded.tags, metadata = excluded.metadata, updatedAt = excluded.updatedAt
  `).run(
    body.canonicalUrl, body.siteKey,
    JSON.stringify(body.tags ?? []),
    JSON.stringify(body.metadata ?? {}),
    JSON.stringify(body.listIds ?? []),
    now, now,
  );
  const link = db.prepare('SELECT * FROM links WHERE canonicalUrl = ?').get(body.canonicalUrl);
  broadcast('link:upserted', link);
  return c.json(link, 201);
});

app.patch('/api/links/:id', async c => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ tags?: string[]; metadata?: Record<string, unknown> }>();
  const updates: string[] = [];
  const params: unknown[] = [];
  if (body.tags) { updates.push('tags = ?'); params.push(JSON.stringify(body.tags)); }
  if (body.metadata) { updates.push('metadata = ?'); params.push(JSON.stringify(body.metadata)); }
  updates.push('updatedAt = ?'); params.push(Date.now());
  params.push(id);
  db.prepare(`UPDATE links SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
  broadcast('link:updated', link);
  return c.json(link);
});

app.delete('/api/links/:id', c => {
  const id = Number(c.req.param('id'));
  db.prepare('DELETE FROM links WHERE id = ?').run(id);
  broadcast('link:deleted', { id });
  return c.json({ ok: true });
});

// ── Lists ────────────────────────────────────────────────────────────────────
app.get('/api/lists', c => {
  const lists = db.prepare('SELECT * FROM lists ORDER BY "order"').all();
  return c.json({ lists });
});

app.post('/api/lists', async c => {
  const body = await c.req.json<{ name: string; description?: string }>();
  const now = Date.now();
  const result = db.prepare(
    'INSERT INTO lists (name, description, "order", createdAt, updatedAt) VALUES (?, ?, 0, ?, ?)'
  ).run(body.name, body.description ?? '', now, now);
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid);
  return c.json(list, 201);
});

// ── Export ───────────────────────────────────────────────────────────────────
app.get('/api/export', c => {
  const { format = 'json', tag, site } = c.req.query();
  let query = 'SELECT * FROM links WHERE 1=1';
  const params: unknown[] = [];
  // Match JSON-encoded tag exactly (e.g. `"good"` inside `["good","processed"]`)
  if (tag) { query += ' AND tags LIKE ?'; params.push(`%"${tag}"%`); }
  if (site) { query += ' AND siteKey = ?'; params.push(site); }
  const rows = db.prepare(query).all(...params) as Array<{ canonicalUrl: string; siteKey: string }>;

  if (format === 'urls') {
    return c.text(rows.map(r => r.canonicalUrl).join('\n'), 200, {
      'Content-Type': 'text/plain',
    });
  }
  return c.json(rows);
});

// ── Import ───────────────────────────────────────────────────────────────────
app.post('/api/import', async c => {
  const body = await c.req.json<Array<{
    canonicalUrl: string; siteKey: string;
    tags?: string[]; metadata?: Record<string, unknown>;
  }>>();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO links (canonicalUrl, siteKey, tags, metadata, listIds, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, '[]', ?, ?)
    ON CONFLICT(canonicalUrl) DO UPDATE SET tags = excluded.tags, updatedAt = excluded.updatedAt
  `);
  const insertMany = db.transaction((rows: typeof body) => {
    for (const row of rows) {
      stmt.run(row.canonicalUrl, row.siteKey, JSON.stringify(row.tags ?? []),
        JSON.stringify(row.metadata ?? {}), now, now);
    }
  });
  insertMany(body);
  broadcast('import:complete', { count: body.length });
  return c.json({ imported: body.length });
});

// ── SSE ──────────────────────────────────────────────────────────────────────
app.get('/api/events', c => {
  const { readable, writable } = new TransformStream<string, string>();
  const writer = writable.getWriter();
  const send = (data: string): void => { writer.write(data).catch(() => sseClients.delete(send)); };
  sseClients.add(send);
  c.req.raw.signal.addEventListener('abort', () => {
    sseClients.delete(send);
    writer.close().catch(() => {});
  });
  writer.write('data: {"type":"connected"}\n\n').catch(() => {});
  return new Response(readable as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

serve({ fetch: app.fetch, port: 3001 }, info => {
  console.log(`Pinmark backend running at http://localhost:${info.port}`);
});
