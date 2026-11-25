// Lägger den byggda appen i site/app/ så att hela site/ kan laddas upp i ett svep (Netlify, GitHub Pages m.fl.)
import { cpSync, rmSync, mkdirSync } from 'node:fs';
rmSync('site/app', { recursive: true, force: true });
mkdirSync('site/app', { recursive: true });
cpSync('dist/index.html', 'site/app/index.html');
for (const f of ['manifest.json', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png']) cpSync('dist/' + f, 'site/app/' + f);
console.log('site/ är redo att laddas upp');
