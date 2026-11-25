// Gör dist/index.html till en Claude-artifact (utan doctype/html/head/body-taggar).
import { readFileSync, writeFileSync } from 'node:fs';
let s = readFileSync('dist/index.html', 'utf8');
const head = s.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = s.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head
  .split('\n')
  .filter((l) => !/<meta charset|<meta name="viewport"|rel="manifest"|apple-touch-icon|rel="icon"|apple-mobile|mobile-web-app|theme-color/.test(l))
  .join('\n');
writeFileSync('dist/artifact.html', keep + '\n' + body);
console.log('dist/artifact.html', Math.round(readFileSync('dist/artifact.html').length / 1024) + ' KB');
