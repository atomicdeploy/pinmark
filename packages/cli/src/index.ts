/**
 * Pinmark CLI — export saved links for use with downloaders like yt-dlp.
 *
 * Usage:
 *   pinmark export --tag good --format urls > urls.txt
 *   pinmark export --format json --output dump.json
 *   cat urls.txt | yt-dlp --batch-file -
 */
import { defineCommand, runMain } from 'citty';
import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

interface LinkRow {
  id: number;
  canonicalUrl: string;
  siteKey: string;
  tags: string;
  metadata: string;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_DB_PATH = resolve(homedir(), '.pinmark', 'pinmark.db');

const exportCmd = defineCommand({
  meta: { name: 'export', description: 'Export saved links' },
  args: {
    db: { type: 'string', description: 'Path to SQLite database', default: DEFAULT_DB_PATH },
    tag: { type: 'string', description: 'Filter by tag' },
    site: { type: 'string', description: 'Filter by site key' },
    format: { type: 'string', description: 'Output format: json|urls|ytdlp|tsv', default: 'urls' },
    output: { type: 'string', description: 'Output file (default: stdout)' },
  },
  run({ args }) {
    const db = new Database(args.db as string, { readonly: true });

    let query = 'SELECT * FROM links WHERE 1=1';
    const params: unknown[] = [];

    if (args.tag) {
      query += ' AND tags LIKE ?';
      params.push(`%${args.tag}%`);
    }
    if (args.site) {
      query += ' AND siteKey = ?';
      params.push(args.site);
    }

    const rows = db.prepare(query).all(...params) as LinkRow[];
    db.close();

    let output = '';
    const fmt = args.format as string;

    if (fmt === 'json') {
      output = JSON.stringify(rows.map(r => ({
        ...r,
        tags: JSON.parse(r.tags) as unknown,
        metadata: JSON.parse(r.metadata) as unknown,
      })), null, 2);
    } else if (fmt === 'urls') {
      output = rows.map(r => r.canonicalUrl).join('\n');
    } else if (fmt === 'ytdlp') {
      output = rows.map(r => `# ${r.siteKey}:${r.canonicalUrl}\n${r.canonicalUrl}`).join('\n');
    } else if (fmt === 'tsv') {
      const header = 'url\tsite\ttags\tcreatedAt\tupdatedAt';
      const lines = rows.map(r =>
        [r.canonicalUrl, r.siteKey, r.tags, r.createdAt, r.updatedAt].join('\t')
      );
      output = [header, ...lines].join('\n');
    }

    if (args.output) {
      writeFileSync(resolve(args.output as string), output, 'utf-8');
      console.log(`Exported ${rows.length} links to ${args.output}`);
    } else {
      process.stdout.write(output + '\n');
    }
  },
});

const main = defineCommand({
  meta: { name: 'pinmark', version: '0.1.0', description: 'Pinmark link manager CLI' },
  subCommands: { export: exportCmd },
});

runMain(main);
