# Pinmark

> Tag, highlight, and track links on visual websites — browser extension + CLI + optional backend.

## Features

- **Browser Extension** (Chrome + Firefox via WXT / Manifest V3)
  - Visual tag overlays on Pinterest and Pixiv link grids
  - Sticky top bar on individual pin/artwork pages
  - IndexedDB storage via Dexie.js — instant, offline, no server needed
  - Admin panel (options page) with TanStack Table, import/export, settings
  - Popup for quick tag management of the current tab
  - Cross-tab real-time sync via BroadcastChannel + chrome.storage
- **CLI** (`@pinmark/cli`) — export saved links for yt-dlp or batch processing
- **Backend** (`@pinmark/backend`) — optional Hono REST API + SSE for sync

## Stack

| Layer | Technology |
|-------|-----------|
| Extension framework | [WXT](https://wxt.dev) (Manifest V3, Chrome + Firefox) |
| UI | React 18 + framer-motion + lucide-react |
| Table | TanStack Table v8 |
| Storage | Dexie.js (IndexedDB) |
| URL normalization | normalize-url |
| Backend | Hono + @hono/node-server |
| CLI | citty |
| Database (CLI/backend) | better-sqlite3 |
| Testing | Vitest |
| Linting | ESLint + Prettier |
| Monorepo | pnpm workspaces |

## Project Structure

```
pinmark/
├── packages/
│   ├── extension/          # WXT browser extension
│   │   └── src/
│   │       ├── shared/     # types, db, url, events
│   │       ├── content/    # content scripts + site adapters
│   │       ├── styles/     # CSS injection engine
│   │       ├── components/ # StickyBar React component
│   │       ├── entrypoints/# background, popup, options
│   │       └── __tests__/  # Vitest unit tests
│   ├── cli/                # citty CLI for exports
│   └── backend/            # Hono REST API + SSE
```

## Setup

```bash
# Install dependencies
pnpm install

# Develop extension (Chrome)
pnpm dev

# Develop extension (Firefox)
pnpm -F extension dev:firefox

# Run tests
pnpm test

# Build extension
pnpm build

# Lint
pnpm lint
```

## Tags

Built-in tags: `good`, `bad`, `processed`, `ignore`

Custom tags can be added in the Admin Panel → Settings.

## CLI Usage

```bash
cd packages/cli
pnpm dev export --tag good --format urls > urls.txt
pnpm dev export --format json --output dump.json
# Feed to yt-dlp:
cat urls.txt | yt-dlp --batch-file -
```

## Backend (optional)

```bash
cd packages/backend
pnpm dev
# API available at http://localhost:3001
# Endpoints: GET/POST /api/links, PATCH/DELETE /api/links/:id
#            GET /api/lists, POST /api/lists
#            GET /api/export, POST /api/import
#            GET /api/events  (SSE)
```

## Architecture Notes

- **URL canonicalization**: `normalize-url` strips tracking params; site-specific rules normalize Pinterest pin IDs and Pixiv artwork IDs for reliable deduplication.
- **Event bus**: `BroadcastChannel` (primary) + `chrome.storage.onChanged` (fallback for service workers) delivers zero-polling cross-tab sync.
- **Site adapters**: `BaseSiteAdapter` abstract class provides `MutationObserver`-based scanning; `PinterestAdapter` and `PixivAdapter` extend it with site-specific selectors.
- **Style injection**: CSS custom properties + transitions applied directly to DOM elements; `WeakMap` caching avoids redundant style updates.
