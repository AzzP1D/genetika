// «Банк микропрепаратов»: каталог снимков и «окуляр» — круглое поле зрения, винт фокусировки,
// объективы (малое/большое увеличение, если есть оба снимка), поля зрения, приближение пальцами.
// Отладка: micro.html#bl02 — сразу открыть препарат.
import { SECTIONS, SLIDES } from './micro-data.js';

const $ = s => document.querySelector(s);
const byId = Object.fromEntries(SLIDES.map(s => [s.id, s]));
const code = id => id.toUpperCase();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ── Поиск ──
// Ищет по коду, названию, разделу и тексту разбора («хлоропласт», «ядро»). Терпит ё/е, окончания слов,
// код в русской раскладке («ИИ01» → BB01) и русские буквы, похожие на латинские («ВВ01»).
const plain = h => h.replace(/<[^>]+>/g, '');
const norm = t => t.toLowerCase().replace(/ё/g, 'е');
// Для сравнения знаки заменяются пробелами (по одному на знак — позиции совпадают с исходным текстом),
// а слово ищется только с начала слова: «елк» не найдётся внутри «мелкие».
const words = t => ' ' + norm(t).replace(/[^a-zа-я0-9]/g, ' ');
const stem = w => w.length > 3 ? w.replace(/(ами|ями|ого|его|ому|ему|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ые|ие|ам|ям|ах|ях|ом|ем|у|ю|а|я|ы|и|е|о|ь)$/, '') : w;
const RU = 'йцукенгшщзхъфывапролджэячсмитьбю', EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const LOOK = { а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', х: 'x', у: 'y' };
const codeForms = w => /\d/.test(w)
  ? [w, [...w].map(c => EN[RU.indexOf(c)] || c).join(''), [...w].map(c => LOOK[c] || c).join('')] : [w];
const secTitle = Object.fromEntries(SECTIONS.map(s => [s.id, s.title]));
const IDX = SLIDES.map(s => ({
  s,
  head: words([s.id, s.name, s.lat || '', secTitle[s.sec]].join(' ')),
  body: plain([...(s.find || []), ...(s.trap || []), ...(s.q || []), ...s.fields.map(f => f.note || '')].join(' ')),
}));
function search(q) {
  const qs = norm(q).split(/[^a-zа-я0-9]+/).filter(Boolean);
  if (!qs.length) return null;
  const res = [];
  for (const it of IDX) {
    const body = words(it.body);
    let inHead = true, inAny = true, at = -1, hitW = '';
    for (const w of qs) {
      const forms = codeForms(w).map(f => ' ' + stem(f));
      const head = forms.some(f => it.head.includes(f));
      const pos = Math.max(...forms.map(f => body.indexOf(f)));   // из-за пробела в начале body это позиция слова в исходном тексте
      if (!head) inHead = false;
      if (!head && pos < 0) { inAny = false; break; }
      if (at < 0 && pos >= 0) { at = pos; hitW = stem(w); }
    }
    if (inAny) res.push({ s: it.s, rank: inHead ? 0 : 1, snip: inHead ? '' : snippet(it.body, at, hitW) });
  }
  return res.sort((a, b) => a.rank - b.rank);
}
// Отрывок разбора вокруг найденного слова — ученик сразу видит, почему препарат в списке.
function snippet(text, at, w) {
  if (at < 0) return '';
  const a = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 30)) + 1), b = Math.min(text.length, at + 50);
  const part = text.slice(a, b);
  const i = norm(part).indexOf(w);
  const mark = i < 0 ? part : part.slice(0, i) + '<mark>' + part.slice(i, i + w.length) + '</mark>' + part.slice(i + w.length);
  return (a > 0 ? '…' : '') + mark + (b < text.length ? '…' : '');
}

// ── Каталог ──
const tile = (s, snip) =>
  '<button class="tile" type="button" data-id="' + s.id + '"><span class="eye" style="background-image:url(micro/t/' + s.fields[0].f + '.jpg)"></span>' +
  '<span class="t">' + s.name + '</span><span class="c">' + code(s.id) +
  (s.fields.length > 1 ? ' · ' + s.fields.length + ' снимка' : '') + '</span>' +
  (snip ? '<span class="hit">' + snip + '</span>' : '') + '</button>';
function renderList(q) {
  const found = search(q);
  if (!found) {
    $('#secs').innerHTML = SECTIONS.map(sec => {
      const list = SLIDES.filter(s => s.sec === sec.id);
      return '<h2>' + sec.title + ' <span>· ' + list.length + '</span></h2><div class="grid">' + list.map(s => tile(s)).join('') + '</div>';
    }).join('');
  } else if (!found.length) {
    $('#secs').innerHTML = '<p class="none">Ничего не найдено. Проверьте написание или введите код препарата с этикетки — например, HC06.</p>';
  } else {
    $('#secs').innerHTML = '<h2>Найдено <span>· ' + found.length + '</span></h2><div class="grid">' +
      found.map(r => tile(r.s, r.snip)).join('') + '</div>';
  }
}
const qIn = $('#q');
qIn.addEventListener('input', () => { $('#qx').hidden = !qIn.value; renderList(qIn.value); });
qIn.addEventListener('keydown', e => { if (e.key === 'Enter') qIn.blur(); });
$('#qx').onclick = () => { qIn.value = ''; $('#qx').hidden = true; renderList(''); qIn.focus(); };
renderList(qIn.value);
$('#secs').addEventListener('click', e => {
  const t = e.target.closest('.tile');
  if (t) { fromList = true; location.hash = t.dataset.id; }
});
let fromList = false;

// ── Окуляр ──
const view = $('#view'), field = $('#field'), ph = $('#ph'), stage = $('#stage');
const V = { s: null, fi: 0, f: 0, t: 0, z: 1, x: 0, y: 0, d: 300, w: 0, h: 0, tab: 'find', ans: false };
// Фокус ученика сохраняется до выхода из приложения: навёл один раз — следующие препараты
// и другой объектив открываются с той же резкостью (не утомлять). Хранится в sessionStorage.
const mem = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} } };
let learned = mem.get('micro-focus') !== null;   // ученик уже навёл резкость — подсказку больше не показываем
// Увеличение микроскопа автора: окуляр ×20, снимки — с объективом ×10 (у мазка крови есть и ×40).
const EYE = 20, OBJ = { mid: 10, high: 40 };

function open(id) {
  const s = byId[id];
  if (!s) { close(); return; }
  V.s = s; V.fi = 0; V.z = 1; V.x = 0; V.y = 0; V.tab = 'find'; V.ans = false;
  // Первый препарат кладут на столик не в фокусе: винт сбит на случайную величину.
  V.t = 0;
  V.f = learned ? +mem.get('micro-focus') : (Math.random() < .5 ? -1 : 1) * (0.35 + Math.random() * 0.3);
  $('#vno').textContent = code(s.id);
  $('#vname').textContent = s.name;
  view.classList.add('on');
  document.body.style.overflow = 'hidden';
  loadField();
  renderCtl();
  renderCard();
  focusUi();
}
function close() {
  view.classList.remove('on');
  document.body.style.overflow = '';
  V.s = null;
}
function route() { const id = location.hash.slice(1); id ? open(id) : close(); }
addEventListener('hashchange', route);
$('#vback').onclick = () => {
  if (fromList) { fromList = false; history.back(); } else { history.replaceState(null, '', location.pathname); close(); }
};

function loadField() {
  const f = V.s.fields[V.fi].f;
  ph.classList.add('swap');
  V.w = 0; buildTags();   // старые подписи убираем сразу, новые — когда снимок загрузится
  const img = new Image();
  img.onload = () => {
    ph.src = img.src; V.w = img.naturalWidth; V.h = img.naturalHeight;
    buildTags(); layout(); ph.classList.remove('swap');
  };
  img.src = 'micro/' + f + '.jpg';
}

// Снимок «накрывает» круг; сдвиг ограничен так, чтобы край снимка не заходил в поле зрения.
function layout() {
  const r = stage.getBoundingClientRect();
  V.d = Math.max(120, Math.floor(Math.min(r.width, r.height)) - 14);
  field.style.width = field.style.height = V.d + 'px';
  if (!V.w) return;
  const k = V.d / Math.min(V.w, V.h);
  ph.style.width = V.w * k + 'px';
  ph.style.height = V.h * k + 'px';
  apply();
}
function apply() {
  const k = V.d / Math.min(V.w, V.h), W = V.w * k * V.z, H = V.h * k * V.z;
  const mx = Math.max(0, (W - V.d) / 2), my = Math.max(0, (H - V.d) / 2);
  V.x = clamp(V.x, -mx, mx); V.y = clamp(V.y, -my, my);
  ph.style.transform = 'translate(-50%, -50%) translate(' + V.x + 'px, ' + V.y + 'px) scale(' + V.z + ')';
  const zz = $('#zv'); if (zz) zz.textContent = '×' + V.z.toFixed(1);
  layoutTags();
}
new ResizeObserver(layout).observe(stage);

// ── Выноски на снимке ──
// Как в «Атласе клетки»: узел с вращающимися дугами, наклонная линия, тупой угол, полка и подпись
// в уголках-скобках. Но узел — пустое кольцо вокруг точки: мелкая структура (ядро, зерно) остаётся
// видна внутри, и линия начинается от края кольца. Точки привязаны к снимку и едут вместе с ним при сдвиге и
// приближении; точка, ушедшая за край поля зрения, прячется вместе с подписью, а на ободке окуляра
// появляется стрелка в её сторону. Нажатие на стрелку плавно подводит точку в поле зрения
// (при необходимости чуть приближает: при ×1 снимок можно двигать только вбок).
const svgEl = (t, a = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', t); for (const k in a) e.setAttribute(k, a[k]); return e; };
const leaders = $('#leaders'), tagsEl = $('#tags'), lblBtn = $('#lbl');
let showLabels = mem.get('micro-labels') !== '0';
let TAGS = [];
function buildTags() {
  leaders.replaceChildren(); tagsEl.replaceChildren(); TAGS = [];
  lblBtn.hidden = !V.s.fields.some(f => f.labels);
  lblBtn.classList.toggle('on', showLabels);
  if (!showLabels || !V.w) return;
  TAGS = (V.s.fields[V.fi].labels || []).map(([fx, fy, text]) => {
    const g = svgEl('g'), under = svgEl('path', { class: 'under' }), ln = svgEl('path', { class: 'ln' }), node = svgEl('g');
    node.append(svgEl('circle', { r: RING, class: 'halo' }), svgEl('circle', { r: RING, class: 'spin' }));
    g.append(under, ln, node);
    const rim = svgEl('g', { class: 'rim' });
    rim.append(svgEl('circle', { r: 16, class: 'hit' }), svgEl('path', { d: 'M-4 -7L4 0L-4 7', class: 'under' }), svgEl('path', { d: 'M-4 -7L4 0L-4 7', class: 'arrow' }));
    leaders.append(g, rim);
    const el = document.createElement('div');
    el.className = 'tag';
    el.textContent = text;
    tagsEl.append(el);
    const t = { fx, fy, g, under, ln, node, el, rim };
    rim.onclick = () => bring(t);
    return t;
  });
}
// Подвести точку подписи в поле зрения: сдвиг и, если сдвига не хватает, приближение.
let anim = 0;
function bring(t) {
  const k0 = V.d / Math.min(V.w, V.h), R = V.d / 2 - 26;
  let z = V.z, x, y;
  for (;; z = Math.min(3, z + 0.25)) {
    const W = V.w * k0 * z, H = V.h * k0 * z;
    x = clamp(-(t.fx - 0.5) * W, -Math.max(0, (W - V.d) / 2), Math.max(0, (W - V.d) / 2));
    y = clamp(-(t.fy - 0.5) * H, -Math.max(0, (H - V.d) / 2), Math.max(0, (H - V.d) / 2));
    if (Math.hypot(x + (t.fx - 0.5) * W, y + (t.fy - 0.5) * H) < R || z >= 3) break;
  }
  const from = { x: V.x, y: V.y, z: V.z }, t0 = performance.now(), id = ++anim;
  const step = now => {
    if (id !== anim) return;
    const p = Math.min(1, (now - t0) / 500), e = p * p * (3 - 2 * p);
    V.z = from.z + (z - from.z) * e; V.x = from.x + (x - from.x) * e; V.y = from.y + (y - from.y) * e;
    apply();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Страховка: если кадры не идут (вкладка скрыта, телефон занят), препарат просто встаёт на место.
  setTimeout(() => step(t0 + 500), 650);
}
lblBtn.onclick = () => { showLabels = !showLabels; mem.set('micro-labels', showLabels ? '1' : '0'); buildTags(); layoutTags(); };

const SLOPE = Math.tan(35 * Math.PI / 180), SHELF = 18, RING = 10;
function layoutTags() {
  if (!TAGS.length) return;
  const sw = stage.clientWidth, sh = stage.clientHeight, cx = sw / 2, cy = sh / 2, R = V.d / 2;
  const k0 = V.d / Math.min(V.w, V.h), W = V.w * k0 * V.z, H = V.h * k0 * V.z;
  const sides = { l: [], r: [], v: [] };
  for (const t of TAGS) {
    t.x = cx + V.x + (t.fx - 0.5) * W;
    t.y = cy + V.y + (t.fy - 0.5) * H;
    const off = Math.hypot(t.x - cx, t.y - cy) > R - 8;
    t.g.style.display = t.el.style.display = off ? 'none' : '';
    t.rim.style.display = off ? '' : 'none';
    if (off) {
      const a = Math.atan2(t.y - cy, t.x - cx);
      t.rim.setAttribute('transform', 'translate(' + (cx + (R - 16) * Math.cos(a)).toFixed(1) + ' ' + (cy + (R - 16) * Math.sin(a)).toFixed(1) + ') rotate(' + (a * 180 / Math.PI).toFixed(1) + ')');
      continue;
    }
    // Скобки обнимают сам текст: ширина подписи — по самой длинной её строке.
    if (!t.sized) {
      const r = document.createRange();
      r.selectNodeContents(t.el);
      const line = Math.max(...[...r.getClientRects()].map(q => q.width));
      if (line > 0) { t.el.style.width = Math.ceil(line + 1) + 'px'; t.sized = true; }
    }
    t.w = t.el.offsetWidth; t.h = t.el.offsetHeight;
    // Подпись — с той стороны от центра, где точка. Если сбоку не хватает места, подпись встаёт
    // над точкой (или под ней) с короткой прямой линией: перенос на другую сторону дал бы длинную
    // линию через весь снимок.
    t.side = t.x < cx ? 'l' : 'r';
    if (t.side === 'l' ? t.x - 24 - SHELF - t.w < 4 : t.x + 24 + SHELF + t.w > sw - 4) t.side = 'v';
    t.ly = t.side === 'v' ? (t.y - RING - 20 - t.h > 6 ? t.y - RING - 20 - t.h + 3 : t.y + RING + 20 + 3) : t.y + (t.y < cy ? -28 : 28);
    sides[t.side].push(t);
  }
  for (const s of ['l', 'r']) {
    // Подписи одной стороны не налезают друг на друга: раздвигаем сверху вниз, потом снизу вверх.
    const list = sides[s].sort((p, q) => p.ly - q.ly);
    let prev = 6;
    for (const t of list) { t.ly = Math.max(t.ly, prev); prev = t.ly + t.h + 4; }
    let next = sh - 4;
    for (let i = list.length - 1; i >= 0; i--) { const t = list[i]; t.ly = Math.min(t.ly, next - t.h + 3); next = t.ly - 7; }
  }
  // Место подписи при заданной высоте полки: излом, конец полки и левый край подписи.
  const place = t => {
    if (t.side === 'v') {
      t.left = clamp(t.x - t.w / 2, 4, sw - 4 - t.w);
      t.ex = clamp(t.x, t.left + 8, t.left + t.w - 8);
      return;
    }
    const k = t.side === 'l' ? -1 : 1;
    t.ex = t.x + k * Math.min(Math.max(Math.abs(t.ly - t.y) / SLOPE, 24), 70);   // точка излома
    t.left = clamp(t.side === 'l' ? t.ex + k * SHELF - t.w : t.ex + k * SHELF, 4, sw - 4 - t.w);
    t.end = t.side === 'l' ? t.left + t.w : t.left;
    if (k * (t.end - t.ex) < 8) t.ex = t.end - k * 8;
  };
  // На узком экране подпись может лечь на чужое кольцо (и закрыть, например, ядро) или на подпись
  // другой стороны — тогда она отодвигается от своей точки вверх или вниз, пока не освободится место.
  const shown = [...sides.l, ...sides.r, ...sides.v], done = [];
  const hits = t => shown.some(o => Math.max(t.left - RING - 2, Math.min(o.x, t.left + t.w + RING + 2)) === o.x &&
      Math.max(t.ly - 3 - RING - 2, Math.min(o.y, t.ly - 3 + t.h + RING + 2)) === o.y) ||
    done.some(o => t.left < o.left + o.w + 4 && o.left < t.left + t.w + 4 && t.ly < o.ly + o.h + 4 && o.ly < t.ly + t.h + 4);
  for (const t of shown.sort((p, q) => p.y - q.y)) {
    const start = t.ly, dir = t.ly < t.y ? -1 : 1;
    place(t);
    for (let i = 1; hits(t) && i <= 40; i++) {
      t.ly = start + (i <= 20 ? dir * i * 6 : -dir * (i - 20) * 6);
      t.ly = clamp(t.ly, 6, sh - t.h);
      place(t);
    }
    done.push(t);
    let d;
    if (t.side === 'v') {
      const above = t.ly - 3 + t.h < t.y, ey = above ? t.ly - 3 + t.h : t.ly - 3;
      const a = Math.atan2(ey - t.y, t.ex - t.x);
      d = 'M' + (t.x + RING * Math.cos(a)).toFixed(1) + ' ' + (t.y + RING * Math.sin(a)).toFixed(1) + 'L' + t.ex.toFixed(1) + ' ' + ey.toFixed(1);
    } else {
    const a = Math.atan2(t.ly - t.y, t.ex - t.x);
    d = 'M' + (t.x + RING * Math.cos(a)).toFixed(1) + ' ' + (t.y + RING * Math.sin(a)).toFixed(1) + 'L' + t.ex.toFixed(1) + ' ' + t.ly.toFixed(1) + 'L' + t.end.toFixed(1) + ' ' + t.ly.toFixed(1);
    }
    t.under.setAttribute('d', d);
    t.ln.setAttribute('d', d);
    t.node.setAttribute('transform', 'translate(' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + ')');
    t.el.className = 'tag ' + (t.side === 'v' ? 'r' : t.side);
    t.el.style.left = t.left + 'px';
    t.el.style.top = (t.ly - 3) + 'px';
  }
}

// Резкость: размытие растёт с расстоянием от точки фокуса.
function focusUi() {
  const off = Math.abs(V.f - V.t);
  const sharp = off < 0.035;
  ph.style.filter = sharp ? 'none' : 'blur(' + Math.min(10, off * 20 * V.d / 400).toFixed(2) + 'px)';
  $('#knob').style.transform = 'rotate(' + V.f * 600 + 'deg)';
  $('#sharp').classList.toggle('on', sharp);
  if (sharp && !learned) learned = true;
  if (learned) mem.set('micro-focus', V.f.toFixed(3));
  $('#hint').classList.toggle('off', learned);
  $('#knob').classList.toggle('pulse', !learned);
}

// ── Панель управления ──
function renderCtl() {
  const s = V.s, objs = s.fields.some(f => f.obj), ob = OBJ[s.fields[V.fi].obj || 'mid'];
  let h = '';
  if (objs) h += '<div class="grp"><span class="lbl">Объектив</span><div class="row">' +
    s.fields.map((f, i) => '<button class="btn' + (i === V.fi ? ' on' : '') + '" data-obj="' + i + '">×' + OBJ[f.obj] + '</button>').join('') + '</div></div>';
  h += '<div class="grp"><span class="lbl">Увеличение</span><span class="mag">×' + ob * EYE + '</span>' +
    '<span class="lbl">об. ×' + ob + ' · ок. ×' + EYE + '</span></div>';
  if (s.fields.length > 1) h += '<div class="grp"><span class="lbl">Поле зрения</span><div class="row">' +
    '<button class="btn" data-fld="-1">◀</button><span class="fld">' + (V.fi + 1) + ' / ' + s.fields.length + '</span>' +
    '<button class="btn" data-fld="1">▶</button></div></div>';
  h += '<div class="grp zoom"><span class="lbl">Приблизить</span><div class="row">' +
    '<button class="btn" data-zoom="-1">−</button><span class="fld" id="zv">×' + V.z.toFixed(1) + '</span>' +
    '<button class="btn" data-zoom="1">+</button></div></div>';
  h += '<div class="grp focus"><span class="lbl">Фокус</span><div id="knob"></div></div>';
  $('#ctl').innerHTML = h;
  bindKnob();
}
$('#ctl').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.obj) {
    const i = +b.dataset.obj;
    if (i === V.fi) return;
    V.fi = i; V.z = 1; V.x = V.y = 0;
    loadField(); renderCtl(); focusUi();
  } else if (b.dataset.fld) {
    V.fi = (V.fi + +b.dataset.fld + V.s.fields.length) % V.s.fields.length;
    loadField(); renderCtl(); renderCard(); focusUi();
  } else if (b.dataset.zoom) {
    V.z = clamp(V.z * (+b.dataset.zoom > 0 ? 1.3 : 1 / 1.3), 1, 3);
    apply();
  }
});

function bindKnob() {
  const k = $('#knob');
  let last = null;
  k.addEventListener('pointerdown', e => { try { k.setPointerCapture(e.pointerId); } catch {} last = [e.clientX, e.clientY]; });
  k.addEventListener('pointermove', e => {
    if (!last) return;
    const dv = (e.clientX - last[0]) - (e.clientY - last[1]);
    last = [e.clientX, e.clientY];
    V.f = clamp(V.f + dv * 0.0025, -1, 1);
    focusUi();
  });
  const up = () => { last = null; if (Math.abs(V.f - V.t) < 0.035) { V.f = V.t; focusUi(); } };
  k.addEventListener('pointerup', up);
  k.addEventListener('pointercancel', up);
  k.addEventListener('wheel', e => { e.preventDefault(); V.f = clamp(V.f - e.deltaY * 0.0006, -1, 1); focusUi(); }, { passive: false });
}

// Поле зрения: один палец — двигать препарат, два — приблизить, двойное касание — вернуть вид.
const P = new Map();
let pinch = null, lastTap = 0;
field.addEventListener('pointerdown', e => {
  anim++;
  try { field.setPointerCapture(e.pointerId); } catch {}
  P.set(e.pointerId, [e.clientX, e.clientY]);
  if (P.size === 2) {
    const [a, b] = [...P.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: V.z };
  } else if (P.size === 1) {
    const now = performance.now();
    if (now - lastTap < 300) { V.z = 1; V.x = V.y = 0; apply(); }
    lastTap = now;
  }
});
field.addEventListener('pointermove', e => {
  const p = P.get(e.pointerId);
  if (!p) return;
  if (P.size === 1) { V.x += e.clientX - p[0]; V.y += e.clientY - p[1]; }
  P.set(e.pointerId, [e.clientX, e.clientY]);
  if (P.size === 2 && pinch) {
    const [a, b] = [...P.values()];
    V.z = clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 1, 3);
  }
  apply();
});
const lift = e => { P.delete(e.pointerId); if (P.size < 2) pinch = null; };
field.addEventListener('pointerup', lift);
field.addEventListener('pointercancel', lift);
field.addEventListener('wheel', e => { e.preventDefault(); V.z = clamp(V.z * Math.exp(-e.deltaY * 0.0015), 1, 3); apply(); }, { passive: false });

// ── Карточка препарата ──
function renderCard() {
  const s = V.s;
  const note = s.fields[V.fi].note;
  let h = '<div class="head"><span class="no">' + code(s.id) + '</span><span class="name">' + s.name + '</span>' +
    (s.lat ? '<span class="lat">' + s.lat + '</span>' : '') + '</div>' +
    (note ? '<p class="fnote">Поле ' + (V.fi + 1) + ': ' + note + '</p>' : '');
  if (!s.find) {
    h += '<p>Разбор этого препарата готовится. Рассмотрите снимок: какие клетки или органы вы узнаёте?</p>';
    $('#card').innerHTML = h;
    return;
  }
  if (s.chips) h += '<div class="chips">' + s.chips.map(c => '<span class="chip"><span>' + c + '</span></span>').join('') + '</div>';
  h += '<div class="tabs">' + [['find', 'Что найти'], ['trap', '⚠ Ошибка'], ['q', '? Вопрос']].map(([k, t]) =>
    '<button class="btn' + (k === 'trap' ? ' warn' : '') + (V.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + t + '</button>').join('') + '</div>';
  if (V.tab === 'find') h += '<ul>' + s.find.map(t => '<li>' + t + '</li>').join('') + '</ul>';
  if (V.tab === 'trap') h += '<ul>' + s.trap.map(t => '<li class="trap">' + t + '</li>').join('') + '</ul>';
  if (V.tab === 'q') h += '<p><b>' + s.q[0] + '</b></p>' +
    (V.ans ? '<div class="ans">' + s.q[1] + '</div>' : '<button class="btn" data-ans="1">Показать ответ</button>');
  if (s.see) h += '<div class="see">' + s.see.map(id => '<button class="btn" data-see="' + id + '">Сравнить: ' + byId[id].name + ' →</button>').join('') + '</div>';
  $('#card').innerHTML = h;
}
$('#card').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tab) { V.tab = b.dataset.tab; V.ans = false; renderCard(); }
  else if (b.dataset.ans) { V.ans = true; renderCard(); }
  else if (b.dataset.see) location.hash = b.dataset.see;
});

route();
