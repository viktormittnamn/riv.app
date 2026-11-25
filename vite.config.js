import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: { outDir: 'dist', assetsInlineLimit: 100000000, cssCodeSplit: false, target: 'es2019' },
  server: { host: true }
});
