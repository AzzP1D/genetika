// Ставит номер версии приложения: node tools/version.mjs 0.21
// Меняет «Версия …» в подвале меню и метку ?v=… у всех подключаемых файлов в app/*.html.
// Метка нужна, чтобы после обновления сайта браузер и телефон загружали новые файлы,
// а не брали старые из кэша (GitHub Pages разрешает хранить их до 10 минут).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const v = process.argv[2];
if (!/^\d+\.\d+$/.test(v || '')) {
  console.error('Укажите версию, например: node tools/version.mjs 0.21');
  process.exit(1);
}
const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
for (const f of fs.readdirSync(app).filter(f => f.endsWith('.html'))) {
  const p = path.join(app, f);
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/\?v=[\d.]+/g, '?v=' + v);
  if (f === 'index.html') s = s.replace(/Версия [\d.]+/, 'Версия ' + v);
  fs.writeFileSync(p, s);
  console.log('Готово:', f);
}
