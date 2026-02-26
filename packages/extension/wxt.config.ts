import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Pinmark',
    description: 'Tag, highlight, and track links on visual websites',
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'activeTab', 'scripting'],
    host_permissions: ['*://*.pinterest.com/*', '*://*.pixiv.net/*', '<all_urls>'],
  },
});
