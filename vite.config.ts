import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  'connect-src https://www.googleapis.com https://oauth2.googleapis.com',
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

/** GitHub Pages 無法設定 HTTP header，改以 meta 寫入 CSP。dev server 需要 inline style，所以只在 build 時套用。 */
function cspPlugin(): Plugin {
  return {
    name: 'pwvault-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      ),
  };
}

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/Tool-3/' : '/',
  plugins: [svelte(), cspPlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
