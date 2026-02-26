import { defineConfig } from 'wxt';
import type { Plugin } from 'vite';

/**
 * Vite plugin that replaces non-ASCII bytes that Chrome rejects in content
 * scripts — specifically U+FFFF (Dexie's internal maxKey sentinel) and any
 * other Unicode non-characters — with safe JavaScript unicode escape sequences.
 * Chrome's content-script loader rejects files containing U+FFFF even when
 * the file is otherwise valid UTF-8.
 */
function safeContentScript(): Plugin {
  return {
    name: 'pinmark:safe-content-script',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (
          chunk.type === 'chunk' &&
          (fileName.startsWith('content-scripts/') || fileName.includes('content'))
        ) {
          // Replace U+FFFF and the two surrounding Unicode surrogates/non-characters
          chunk.code = chunk.code
            .replace(/\uFFFF/g, '\\uFFFF')
            .replace(/\uFFFE/g, '\\uFFFE')
            .replace(/\uFEFF/g, '\\uFEFF');
        }
      }
    },
  };
}

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [safeContentScript()],
  }),
  manifest: {
    name: 'Pinmark',
    description: 'Tag, highlight, and track links on visual websites',
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'activeTab', 'scripting'],
    host_permissions: ['*://*.pinterest.com/*', '*://*.pixiv.net/*', '<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
