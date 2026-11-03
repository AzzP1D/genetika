// Готовит снимки «Банка микропрепаратов»: node tools/micro-photos.mjs
// Берёт фото автора из папки «Микропрепараты» (имя начинается с кода набора, например «BL02 …»),
// сохраняет в app/micro/<код>[-N].jpg (не шире 1280 px) и миниатюры app/micro/t/<…>.jpg (240 px).
// Несколько снимков одного препарата получают номера -1, -2… по алфавиту имени файла.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'Микропрепараты');
const out = path.join(root, 'app', 'micro');
fs.mkdirSync(path.join(out, 't'), { recursive: true });

const groups = {};
for (const f of fs.readdirSync(src).filter(f => /\.jpe?g$/i.test(f)).sort()) {
  let code = f.split(/\s/)[0].toLowerCase();
  if (code === 'zar0') code = 'zar01';   // третий снимок конечности пчелы подписан без цифры
  (groups[code] ||= []).push(f);
}
for (const [code, files] of Object.entries(groups)) {
  for (let i = 0; i < files.length; i++) {
    const name = code + (files.length > 1 ? '-' + (i + 1) : '') + '.jpg';
    const img = sharp(path.join(src, files[i]));
    await img.clone().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(out, name));
    await img.clone().resize(240, 180, { fit: 'cover' }).jpeg({ quality: 75, mozjpeg: true }).toFile(path.join(out, 't', name));
    console.log(name.padEnd(12), '←', files[i]);
  }
}
