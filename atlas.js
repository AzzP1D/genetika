import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { addLights } from './style.js';
import { createCell } from './cellmodel.js';
import { loadModel, neonize, PARTS } from './organelles.js';
import { createMembrane } from './membrane.js';
import { createCytoStand } from './cytostand.js';
import { createLife } from './life.js';
import { ATLAS, TOTAL } from './atlas-data.js';

// «Атлас клетки»: обзор животной клетки и органоиды крупным планом на стенде
// «биосканера» — с выносками частей и карточкой (строение, функции, типичная ошибка).

const $ = id => document.getElementById(id);
const topEl = $('top'), pickEl = $('pick'), cardEl = $('card'), fadeEl = $('fade');
const svg = $('leaders'), tagsEl = $('tags');
// Фон: прозрачная оболочка и сеть нитей выбираются, только если под пальцем нет органоида
// (сначала цитоскелет, потом мембрана).
const BACKDROP = ['cytoskeleton', 'membrane'];
const code = a => a.code || 'ORG-' + String(a.no).padStart(2, '0');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060d);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// Жесты: один палец — вращать, два пальца — приближать (щипок) и сдвигать вид.
// Мышью: левая кнопка — вращать, колесо — приближать, правая — сдвигать.
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
let home = null;   // исходный вид — к нему возвращает двойное касание
const remember = () => { home = { pos: camera.position.clone(), target: controls.target.clone() }; };

// Свечение — как в уроке «Репликация»: только если видеокарта умеет, с кнопкой вкл/выкл
// и автоматическим отключением при < 30 кадров/с.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.3, 0.78));
composer.addPass(new OutputPass());
const gl = renderer.getContext();
const canBloom = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
const storage = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* без сохранения */ } } };
let useBloom = canBloom && storage.get('gen-glow') !== 'off' && new URLSearchParams(location.search).get('bloom') !== '0';
const glowBtn = $('glow');
function showGlow() {
  glowBtn.textContent = useBloom ? '✦' : '✧';
  glowBtn.title = glowBtn.ariaLabel = useBloom ? 'Свечение включено — нажмите, чтобы выключить' : 'Свечение выключено — нажмите, чтобы включить';
  glowBtn.classList.toggle('off', !useBloom);
}
if (!canBloom) glowBtn.remove();
else {
  showGlow();
  glowBtn.onclick = () => { useBloom = !useBloom; probe = null; storage.set('gen-glow', useBloom ? null : 'off'); showGlow(); };
}
let probe = null;
const startProbe = () => { probe = { wait: 2, frames: 0, time: 0 }; };

let mode = 'cell';        // cell → flying → specimen
let selected = null;
let cell = null, spec = null, fly = null, saved = null;

// ---------- верхняя панель ----------

function top(title, text) {
  topEl.innerHTML = '<div class="scan"><i></i>БИОСКАН · АКТИВЕН</div><b>' + title + '</b><span>' + text + '</span>';
}

// Текст «проявляется» из случайных знаков, как на экране прибора.
function decode(el, text, ms = 550) {
  const chars = '01⬡АГЦТ<>/#';
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    const n = Math.floor(text.length * k);
    el.textContent = text.slice(0, n) + [...text.slice(n)].map(c => c === ' ' ? ' ' : chars[Math.random() * chars.length | 0]).join('');
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}

// «Отчёт бортового компьютера»: строки печатаются по очереди, а перед курсором
// 2–3 знака ещё «пересчитываются». Место под текст занято сразу — карточка не прыгает.
// Касание карточки показывает весь текст.
let typing = null;
function teletype(root) {
  if (typing) typing.finish();
  const items = [...root.children];
  items.forEach(li => { li.style.minHeight = li.offsetHeight + 'px'; });
  const nodes = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) nodes.push({ node: walk.currentNode, text: walk.currentNode.nodeValue });
  const total = nodes.reduce((n, x) => n + x.text.length, 0);
  nodes.forEach(x => { x.node.nodeValue = ''; });
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  const cps = Math.max(150, total / 2.2);          // знаков в секунду: длинный текст — не дольше ~2 с
  const chars = '01⬡АГЦТ<>/#';
  const t0 = performance.now();
  let done = false, raf = 0;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    nodes.forEach(x => { x.node.nodeValue = x.text; });
    cursor.remove();
    items.forEach(li => { li.style.minHeight = ''; });
    typing = null;
  };
  const step = () => {
    let n = Math.floor((performance.now() - t0) / 1000 * cps);
    if (n >= total) return finish();
    for (const x of nodes) {
      if (n >= x.text.length) { x.node.nodeValue = x.text; n -= x.text.length; continue; }
      const head = [...x.text.slice(n, n + 3)].map(c => c === ' ' ? ' ' : chars[Math.random() * chars.length | 0]).join('');
      x.node.nodeValue = x.text.slice(0, n) + head;
      x.node.after(cursor);
      n = -1;
      for (const y of nodes.slice(nodes.indexOf(x) + 1)) y.node.nodeValue = '';
      break;
    }
    raf = requestAnimationFrame(step);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { typing = { finish }; return finish(); }
  typing = { finish };
  step();
}
cardEl.addEventListener('click', e => { if (typing && !e.target.closest('button')) typing.finish(); });

// ---------- обзор клетки ----------

createCell().then(c => {
  cell = c;
  scene.add(cell.group);
  addLights(cell.group);
  life = createLife(cell);
  cell.group.add(life.group);
  lifeEl.style.display = 'block';
  camera.position.set(0.6, 3.6, camera.aspect < 1 ? 22 : 10.5);
  remember();
  cellHome = home;
  controls.minDistance = 3;
  controls.maxDistance = 26;
  $('loading').remove();
  top('Атлас клетки', 'Животная клетка. Вращайте пальцем, нажмите на органоид.');
  startProbe();
  const want = new URLSearchParams(location.search).get('org');   // для проверки: atlas.html?org=mito
  if (want && ATLAS[want]?.card) { choose(want); openSpecimen(want, true); }
});

function choose(id) {
  selected = id;
  if (!id) { pickEl.style.display = 'none'; return; }
  const a = ATLAS[id];
  pickEl.innerHTML = '<span class="no">' + code(a) + '</span><span class="name">' + a.name + '</span><div class="lat">' + a.lat +
    '</div><p>' + a.short + '</p><button class="go" type="button"' + (a.card ? '' : ' disabled') + '>' +
    (a.card ? 'Рассмотреть крупно ▸' : 'Карточка готовится') + '</button>';
  pickEl.style.display = 'block';
  if (a.card) pickEl.querySelector('.go').onclick = () => openSpecimen(id);
}

// ---------- органоид крупным планом ----------

// Стенд: «чашка Петри» из светящихся колец и шестиугольника, кольцо сканирования.
function pedestal(radius, y) {
  const g = new THREE.Group();
  g.position.y = y;
  // Цвета стенда — по уровню: школьный циан с зелёным, олимпиадный красный с янтарным.
  const C1 = Level.isOlymp() ? 0xff2b5c : 0x00e5ff, C2 = Level.isOlymp() ? 0xff9500 : 0x39ff14;
  const line = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const circle = (r, n = 96) => new THREE.BufferGeometry().setFromPoints([...Array(n)].map((_, i) => {
    const a = i / n * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }));
  g.add(new THREE.LineLoop(circle(radius), line(C1, 0.9)));
  g.add(new THREE.LineLoop(circle(radius * 0.82), line(C1, 0.35)));
  const hexRing = new THREE.LineLoop(circle(radius * 1.12, 6), line(C2, 0.7));
  g.add(hexRing);
  // Риски по краю, как на шкале прибора.
  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, r2 = radius * (i % 6 ? 0.94 : 0.88);
    ticks.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius), new THREE.Vector3(Math.cos(a) * r2, 0, Math.sin(a) * r2));
  }
  const tickLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), line(C1, 0.5));
  g.add(tickLines);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: C1, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(floor);
  // Кольцо сканирования проходит снизу вверх через органоид.
  const scan = new THREE.Mesh(new THREE.RingGeometry(radius * 0.97, radius * 1.02, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: C2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  g.add(scan);
  g.traverse(o => { o.raycast = () => {}; });
  g.update = (t, height) => {
    hexRing.rotation.y = t * 0.15;
    tickLines.rotation.y = -t * 0.05;
    const k = (t % 5) / 1.8;   // раз в 5 секунд, проход за 1,8 с
    scan.visible = k < 1;
    if (k < 1) {
      scan.position.y = k * height;
      scan.material.opacity = Math.sin(k * Math.PI) * 0.8;
      scan.scale.setScalar(1 - 0.25 * Math.sin(k * Math.PI));
    }
  };
  return g;
}

// Ищет на части модели точку, дальше всех выдвинутую в сторону dir: там встанет узел выноски.
function anchorOn(root, part, dir) {
  const d = new THREE.Vector3(...dir).normalize(), v = new THREE.Vector3();
  let best = null, bestD = -Infinity;
  root.traverse(o => {
    if (!o.isMesh || o.userData.part !== part) return;
    // Много копий одной молекулы (мембрана): кандидаты — центры копий.
    if (o.isInstancedMesh) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        if (o.userData.anchorable && !o.userData.anchorable(i)) continue;
        o.getMatrixAt(i, m);
        v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
        const k = v.dot(d);
        if (k > bestD) { bestD = k; best = v.clone(); }
      }
      return;
    }
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 3000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const k = v.dot(d);
      if (k > bestD) { bestD = k; best = v.clone(); }
    }
  });
  return best;
}

// Точки части модели (не больше max) — для групповой выноски, которая обводит всю часть.
function pointsOn(root, part, max = 300) {
  const pts = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.part !== part) return;
    if (o.isInstancedMesh) {   // много копий одной молекулы — берём центры копий
      const m = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); pts.push(new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld)); }
      return;
    }
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / max));
    for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  return pts;
}

// Выпуклая оболочка точек на экране (алгоритм «монотонной цепи»).
function hull2d(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => {
    const h = [];
    for (const p of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); }
    h.pop();
    return h;
  };
  return half(pts).concat(half(pts.reverse()));
}

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

async function buildSpecimen(id) {
  const a = ATLAS[id];
  // Модель из Blender (общая с клеткой) или образец, построенный в коде.
  const built = a.build === 'membrane' ? createMembrane() : a.build === 'cytoskeleton' ? await createCytoStand() : null;
  const src = built ? built.group : (await loadModel(a.model)).clone(true);
  if (!built) {
    neonize(src);
    src.traverse(o => { if (o.isMesh) o.material.uniforms.strength.value = o.userData.base; });
  }
  const box = new THREE.Box3().setFromObject(src);
  src.position.sub(box.getCenter(new THREE.Vector3()));
  const holder = new THREE.Group();
  holder.add(src);
  const size = box.getSize(new THREE.Vector3());
  holder.scale.setScalar(3 / size.length());     // диагональ образца — 3 единицы
  const half = size.clone().multiplyScalar(holder.scale.x / 2);
  const group = new THREE.Group();
  group.add(holder);
  const radius = Math.max(half.x, half.z) * 0.95;
  const base = pedestal(radius, -half.y - 0.3);
  group.add(base);
  addLights(group);
  group.updateMatrixWorld(true);

  // Выноски: узел (точка в кольце, вокруг вращаются дуги), наклонная линия, тупой угол,
  // горизонтальная «полка» и подпись без фона в уголках-скобках — рядом с органоидом.
  svg.replaceChildren();
  tagsEl.replaceChildren();
  // Групповая выноска (group: true) обводит всю часть пунктирным контуром — например,
  // цепь аминокислот целиком, чтобы «белок» не путался с одной «аминокислотой».
  const tags = (a.labels || []).map(l => {
    const pts = l.group ? pointsOn(holder, l.part) : null;
    let obj = null;
    if (l.follow) holder.traverse(o => { if (!obj && o.isMesh && o.userData.part === l.part) obj = o; });
    const at = l.follow ? (obj ? new THREE.Vector3() : null)
      : l.group ? (pts.length ? pts.reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(pts.length) : null)
      : anchorOn(holder, l.part, l.dir);
    if (!at) return null;
    const color = '#' + new THREE.Color(PARTS[l.part]?.color ?? 0x00e5ff).getHexString();
    const g = svgEl('g');
    const path = svgEl('path');
    const node = l.group ? svgEl('path', { class: 'hull' }) : svgEl('g');
    if (!l.group) node.append(svgEl('circle', { r: 8, class: 'spin' }), svgEl('circle', { r: 4.2, class: 'ring' }), svgEl('circle', { r: 2, class: 'core' }));
    node.style.stroke = color;
    if (!l.group) node.style.fill = color;
    g.append(path, node);
    svg.append(g);
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = Level.isOlymp() && l.olymp ? l.olymp : l.text;   // олимпиадный уровень — подпись глубже
    el.style.setProperty('--c', color);
    tagsEl.append(el);
    return { at, pts, obj, g, path, node, el };
  }).filter(Boolean);

  return { id, group, base, built, height: half.y * 2 + 0.6, radius: Math.max(half.x, half.y, half.z), center: new THREE.Vector3(0, -0.15, 0), tags };
}

// Подписи расставляются заново каждый кадр и держатся за свои точки на модели.
// От узла линия уходит наискосок наружу (вверх или вниз — по положению узла), затем
// под тупым углом переходит в горизонтальную полку, на конце которой подпись.
const P = new THREE.Vector3(), C = new THREE.Vector3();
const SLOPE = Math.tan(THREE.MathUtils.degToRad(35));   // наклон косого отрезка
const SHELF = 22;                                        // длина горизонтальной полки, пикселей
const HYST = 30;                                         // запас перед сменой стороны подписи, пикселей
const EASE = 0.18;                                       // доля пути до нового места подписи за кадр
function layoutTags() {
  if (!spec || mode !== 'specimen') { svg.style.display = tagsEl.style.display = 'none'; return; }
  svg.style.display = tagsEl.style.display = '';
  const W = innerWidth, H = innerHeight;
  const minY = topEl.getBoundingClientRect().bottom + 10;
  const maxY = cardEl.getBoundingClientRect().top - 10;
  P.copy(spec.center).project(camera);
  const cx = (P.x + 1) / 2 * W, cy = (1 - P.y) / 2 * H;
  const sides = { l: [], r: [] };
  for (const t of spec.tags) {
    if (t.obj) t.at.setFromMatrixPosition(t.obj.matrixWorld);   // подпись едет вместе с частью образца
    t.hidden = !!t.obj && !t.obj.visible;
    t.el.style.display = t.g.style.display = t.hidden ? 'none' : '';
    if (t.hidden) continue;
    P.copy(t.at).project(camera);
    t.x = (P.x + 1) / 2 * W;
    t.y = (1 - P.y) / 2 * H;
    // Сторона подписи (слева/справа) и направление выноски (вверх/вниз) меняются только с запасом:
    // иначе у середины образца при вращении подпись «дребезжит», перескакивая туда-обратно.
    if (!t.side || (t.side === 'l' && t.x > cx + HYST) || (t.side === 'r' && t.x < cx - HYST)) t.side = t.x < cx ? 'l' : 'r';
    if (t.up === undefined || (t.up && t.y > cy + HYST) || (!t.up && t.y < cy - HYST)) t.up = t.y < cy;
    if (t.pts) {
      // Контур вокруг группы, раздутый на 9 пикселей; выноска выходит из его крайней точки
      // в сторону подписи.
      const toScreen = v => { P.copy(v).project(camera); return [(P.x + 1) / 2 * W, (1 - P.y) / 2 * H]; };
      const mx = t.x, my = t.y;
      const h = hull2d(t.pts.map(toScreen)).map(([x, y]) => { const d = Math.hypot(x - mx, y - my) || 1; return [x + (x - mx) / d * 9, y + (y - my) / d * 9]; });
      t.node.setAttribute('d', 'M' + h.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + 'Z');
      // Линия выходит из контура на уровне центра группы, со стороны подписи. Эта точка при
      // вращении движется непрерывно (крайняя вершина контура перескакивала бы с угла на угол).
      const left = t.side === 'l';
      let tip = null;
      for (let i = 0; i < h.length; i++) {
        const [x1, y1] = h[i], [x2, y2] = h[(i + 1) % h.length];
        if ((y1 - my) * (y2 - my) > 0 || y1 === y2) continue;
        const x = x1 + (my - y1) / (y2 - y1) * (x2 - x1);
        if (!tip || (left ? x < tip[0] : x > tip[0])) tip = [x, my];
      }
      tip ||= h.reduce((b, p) => (left ? p[0] < b[0] : p[0] > b[0]) ? p : b);
      t.x = tip[0]; t.y = tip[1];
    }
    // Скобки должны обнимать сам текст: ширина подписи — по самой длинной её строке.
    if (!t.sized) {
      const r = document.createRange();
      r.selectNodeContents(t.el);
      const line = Math.max(...[...r.getClientRects()].map(q => q.width));
      if (line > 0) { t.el.style.width = Math.ceil(line + 1) + 'px'; t.sized = true; }
    }
    t.h = t.el.offsetHeight;
    t.w = t.el.offsetWidth;
    t.ly = t.y + (t.up ? -30 : 30);
    // Точка на дальней стороне образца — выноска бледнее.
    C.copy(camera.position).sub(t.at);
    t.back = !t.pts && C.dot(t.at) < 0;
    sides[t.side].push(t);
  }
  for (const s in sides) {
    // Подписи одной стороны не налезают друг на друга: раздвигаем сверху вниз, потом снизу вверх.
    const list = sides[s].sort((p, q) => p.ly - q.ly);
    let prev = minY;
    for (const t of list) { t.ly = Math.max(t.ly, prev); prev = t.ly + t.h + 4; }
    let next = maxY;
    for (let i = list.length - 1; i >= 0; i--) { const t = list[i]; t.ly = Math.min(t.ly, next - t.h); next = t.ly - 4; }
    const k = s === 'l' ? -1 : 1;
    for (const t of list) {
      const dy = Math.abs(t.ly - t.y);
      let ex = t.x + k * Math.min(Math.max(dy / SLOPE, 24), 80);     // точка излома
      // Конец полки (здесь начинается подпись) не дальше края экрана. Если подпись не помещается,
      // излом сдвигается к узлу — угол остаётся тупым, полка никогда не поворачивает назад.
      const edge = s === 'l' ? 4 + t.w : W - 4 - t.w;
      let end = ex + k * SHELF;
      if (k * (end - edge) > 0) {
        end = edge;
        ex = t.x + k * Math.max(k * (end - k * SHELF - t.x), 8);
        if (k * (end - ex) < 8) end = ex + k * 8;
      }
      // Подпись не прыгает на новое место, а плавно доезжает до него.
      const left = Math.min(Math.max(s === 'l' ? end - t.w : end, 4), W - 4 - t.w);   // подпись всегда целиком на экране
      t.sl = t.sl === undefined ? left : t.sl + (left - t.sl) * EASE;
      t.sy = t.sy === undefined ? t.ly : t.sy + (t.ly - t.sy) * EASE;
      end = s === 'l' ? t.sl + t.w : t.sl;
      ex = t.x + k * Math.min(Math.max(Math.abs(t.sy - t.y) / SLOPE, 24), 80);
      if (k * (end - ex) < 8) ex = end - k * 8;
      t.ly = t.sy;
      t.el.className = 'tag ' + s;
      t.el.style.left = t.sl + 'px';
      t.el.style.top = (t.ly - 3) + 'px';
      t.el.style.opacity = t.back ? 0.5 : 1;
      t.g.style.opacity = t.back ? 0.4 : 1;
      t.path.setAttribute('d', 'M' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + t.ly.toFixed(1) + 'L' + end.toFixed(1) + ' ' + t.ly.toFixed(1));
      if (!t.pts) t.node.setAttribute('transform', 'translate(' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + ')');
    }
  }
}

function showCard(id) {
  const a = ATLAS[id];
  setCollapsed(false);
  const tabs = Object.keys(a.card);
  // Олимпиадный уровень: между обычными вкладками — маленькая кнопка ★. Она прячет
  // обычные вкладки и открывает одну олимпиадную: факты, ловушки и переход к молекуле.
  // На телефоне так меньше интерфейса, а текста — сколько нужно.
  const ol = Level.isOlymp() && a.olymp;
  const tab = (t, i) => '<button type="button" data-i="' + i + '"' + (t === 'Ошибка' ? ' class="warn"' : '') + '>' +
    (t === 'Ошибка' ? '⚠ Типичная ошибка' : t) + '</button>';
  const star = ol ? '<button type="button" class="star" aria-label="Олимпиадный уровень">★<span class="lbl"></span></button>' +
    '<button type="button" class="close" aria-label="Вернуться к обычным вкладкам">✕</button>' : '';
  cardEl.innerHTML = '<div class="head"><span class="no">' + code(a) + '</span><span class="name">' + a.name + '</span><span class="lat">' + a.lat +
    '</span><span class="count">' + (a.no ? String(a.no).padStart(2, '0') + ' / ' + TOTAL : a.source || '') + '</span></div>' +
    '<div class="chips">' + (a.data || []).map(([k]) => '<div class="chip"><span>' + k + ': <em></em></span></div>').join('') + '</div>' +
    '<div class="tabs">' + tabs.map((t, i) => (t === 'Ошибка' ? star : '') + tab(t, i)).join('') + '</div><ul></ul>' +
    (ol && a.olymp.open ? '<button class="go more" type="button" hidden>' + a.olymp.openText + '</button>' : '');
  // Образец с несколькими анимациями (цитоскелет): кнопки выбора и строка-репортаж над карточкой.
  const anim = spec && spec.id === id && spec.built && spec.built.modes;
  if (anim) {
    cardEl.insertAdjacentHTML('afterbegin', '<div class="status"></div><div class="modes">' +
      anim.map(m => '<button type="button" data-m="' + m.id + '">' + m.text + '</button>').join('') + '</div>');
    const mbtns = [...cardEl.querySelectorAll('.modes button')];
    const mark = () => mbtns.forEach(b => b.classList.toggle('on', b.dataset.m === spec.built.getMode()));
    mbtns.forEach(b => { b.onclick = () => { spec.built.setMode(b.dataset.m); mark(); }; });
    mark();
    // Пауза: останавливает выбранную анимацию, вращать образец при этом можно.
    cardEl.insertAdjacentHTML('afterbegin', '<button type="button" class="pause" aria-label="Пауза">❚❚</button>');
    const pause = cardEl.querySelector('.pause');
    const showPause = () => {
      const p = !!spec.userPaused;
      pause.textContent = p ? '▶' : '❚❚';
      pause.ariaLabel = p ? 'Продолжить' : 'Пауза';
      pause.classList.toggle('on', p);
    };
    pause.onclick = e => { e.stopPropagation(); spec.userPaused = !spec.userPaused; spec.built.setPaused(spec.userPaused); showPause(); };
    spec.userPaused = false;
    spec.built.setPaused(false);
    showPause();
    showStatus(spec.built.status());   // репортаж сразу, чтобы масштаб кадра учитывал его высоту
  }
  cardEl.insertAdjacentHTML('afterbegin', '<div class="grip" title="Смахните вниз, чтобы свернуть"></div>');   // «ручка» — самая верхняя
  cardEl.classList.remove('olymp-on');
  cardEl.querySelectorAll('.chip em').forEach((em, i) => setTimeout(() => decode(em, a.data[i][1]), 150 * i));
  const list = cardEl.querySelector('ul');
  const btns = [...cardEl.querySelectorAll('.tabs button[data-i]')];
  const more = cardEl.querySelector('.more');
  let last = 0;
  const show = items => {
    list.innerHTML = items;
    list.classList.remove('reveal');
    void list.offsetWidth;
    list.classList.add('reveal');
    fitView();
    teletype(list);
  };
  // Переключение «обычные вкладки ↔ олимпиада»: луч сканирования по полосе вкладок.
  const morph = back => {
    cardEl.classList.remove('morph', 'back');
    void cardEl.offsetWidth;
    cardEl.classList.add('morph');
    cardEl.classList.toggle('back', back);
  };
  const open = i => {
    last = i;
    if (cardEl.classList.contains('olymp-on')) {
      morph(true);
      cardEl.querySelector('.star .lbl').textContent = '';
    }
    cardEl.classList.remove('olymp-on');
    btns.forEach((b, j) => b.classList.toggle('on', i === j));
    if (more) more.hidden = true;
    show(a.card[tabs[i]].map(s => '<li>' + s + '</li>').join(''));
  };
  btns.forEach((b, i) => { b.onclick = () => open(i); });
  if (ol) {
    const starBtn = cardEl.querySelector('.star');
    starBtn.onclick = () => {
      if (cardEl.classList.contains('olymp-on')) return;
      cardEl.classList.add('olymp-on');
      morph(false);
      setTimeout(() => { if (cardEl.classList.contains('olymp-on')) decode(starBtn.querySelector('.lbl'), ' Олимпиада', 800); }, 350);
      if (more) more.hidden = false;
      show(a.olymp.facts.map(s => '<li>' + s + '</li>').join('') +
        (a.olymp.traps ? '<li class="sub">⚠ Ловушки олимпиадного уровня</li>' + a.olymp.traps.map(s => '<li class="trap">' + s + '</li>').join('') : ''));
    };
    cardEl.querySelector('.close').onclick = () => open(last);
    if (more) more.onclick = () => switchSpecimen(a.olymp.open, id);
  }
  cardEl.style.display = 'block';
  cardEl.scrollTop = 0;   // новая карточка — с начала, даже если прошлую прокрутили
  open(0);
}

// Образец показывается в свободной части экрана — между верхней панелью и карточкой:
// сдвигаем «окно» камеры (setViewOffset), а не сам образец.
let viewY = null, viewTarget = 0;
function fitView(instant) {
  const W = innerWidth, H = innerHeight;
  if (!spec || mode === 'cell') {
    // В обзоре клетки «окно» сдвигается только в режиме «Следить»: участник держится посередине
    // между верхней панелью и панелью «Жизни клетки», уехавшей вниз.
    viewTarget = follow && life && life.isOn() ? H / 2 - (topEl.getBoundingClientRect().bottom + lifeEl.getBoundingClientRect().top) / 2 : 0;
    if (viewY === null) { viewY = viewTarget; camera.setViewOffset(W, H, 0, viewY, W, H); }
    return;
  }
  const t = document.body.classList.contains('min-ui') ? 10 : topEl.getBoundingClientRect().bottom;
  const b = cardEl.getBoundingClientRect().top;
  viewTarget = H / 2 - (t + b) / 2;
  if (instant || viewY === null) { viewY = viewTarget; camera.setViewOffset(W, H, 0, viewY, W, H); }
  return (b - t) / H;
}
// Для проверки: window.__view() — куда сдвинуто «окно» камеры и где карточка.
window.__view = () => ({ viewY, viewTarget, top: topEl.getBoundingClientRect().bottom, card: cardEl.getBoundingClientRect().top, H: innerHeight, min: document.body.classList.contains('min-ui') });
// Каждый кадр «окно» камеры плавно подъезжает к нужному месту.
function easeView() {
  if (viewY === null || Math.abs(viewTarget - viewY) < 0.5) return;
  viewY += (viewTarget - viewY) * 0.15;
  camera.setViewOffset(innerWidth, innerHeight, 0, viewY, innerWidth, innerHeight);
}

// Карточку можно свернуть жестом: смахнуть вниз — остаётся только строка репортажа (или
// название), верхняя панель уезжает, образец становится крупнее. Смахнуть вверх или нажать на
// «ручку» — карточка возвращается.
function setCollapsed(on) {
  cardEl.classList.toggle('min', on);
  document.body.classList.toggle('min-ui', on);
  fitView();
}
let swipe = null;
cardEl.addEventListener('pointerdown', e => { swipe = { y: e.clientY, top: cardEl.scrollTop }; });
cardEl.addEventListener('pointerup', e => {
  if (!swipe || e.target.closest('.pause')) { swipe = null; return; }
  const dy = e.clientY - swipe.y, min = cardEl.classList.contains('min');
  if (!min && dy > 40 && swipe.top <= 0) setCollapsed(true);
  else if (min && (dy < -30 || Math.abs(dy) < 8)) setCollapsed(false);
  swipe = null;
});

function viewDistance(free) {
  const v = THREE.MathUtils.degToRad(camera.fov / 2);
  const vf = Math.atan(Math.tan(v) * free);
  const hf = Math.atan(Math.tan(v) * camera.aspect * 0.72);   // по бокам остаётся место для подписей
  return spec.radius * 1.15 / Math.sin(Math.min(vf, hf));   // с запасом: высокие образцы (цитоскелет) не упираются в верхнюю панель
}

function crossfade(swap) {
  fadeEl.classList.add('on');
  setTimeout(async () => { await swap(); fadeEl.classList.remove('on'); }, 500);
}

function flyTo(pos, target, seconds, then) {
  fly = { t: 0, seconds, then, fromPos: camera.position.clone(), toPos: pos, fromTarget: controls.target.clone(), toTarget: target };
  controls.enabled = false;
}

function openSpecimen(id, instant) {
  saved = { pos: camera.position.clone(), target: controls.target.clone() };
  pickEl.style.display = 'none';
  const go = () => crossfade(async () => {
    mode = 'specimen';
    cell.group.visible = false;
    await showSpecimen(id);
    $('back').textContent = '← К клетке';
  });
  // Подлетаем к ближайшему из органоидов этого вида, потом переходим на стенд.
  // Молекулы, которых нет в клетке (проба PDB), открываются сразу.
  if (instant || !cell.parts[id]) { go(); return; }
  const objs = cell.parts[id].objects;
  const near = objs.reduce((p, o) => (o.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) < p.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) ? o : p));
  const box = new THREE.Box3().setFromObject(near);
  const c = box.getCenter(new THREE.Vector3());
  const dir = camera.position.clone().sub(c).normalize();
  mode = 'flying';
  flyTo(c.clone().add(dir.multiplyScalar(box.getSize(new THREE.Vector3()).length() * 1.1)), c, 1.1, go);
}

// Образец на стенде: собрать, показать карточку, поставить камеру.
async function showSpecimen(id) {
  spec = await buildSpecimen(id);
  scene.add(spec.group);
  top('Образец ' + code(ATLAS[id]), 'Вращайте образец пальцем. Подписи следуют за моделью.');   // название — в карточке
  showCard(id);
  const free = fitView(true);   // новый образец — сразу в нужное место, без подъезда
  const d = viewDistance(free);
  controls.target.copy(spec.center);
  camera.position.set(...(ATLAS[id].view || [0.35, 0.55, 1])).normalize().multiplyScalar(d).add(spec.center);
  remember();
  controls.minDistance = d * 0.45;
  controls.maxDistance = d * 1.8;
  controls.enabled = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;
}

function dropSpecimen() {
  scene.remove(spec.group);
  // Геометрия модели общая с клеткой (кэш загрузчика) — освобождаем только стенд.
  for (const g of [spec.base, spec.built && spec.built.group]) {
    if (g) g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  spec = null;
}

// Переход со стенда на стенд: из карточки ядра — к нуклеосоме и обратно.
// from — откуда пришли: кнопка «←» тогда ведёт назад к нему, а не в клетку.
function switchSpecimen(id, from) {
  crossfade(async () => {
    dropSpecimen();
    await showSpecimen(id);
    spec.from = from;
    $('back').textContent = from ? '← ' + ATLAS[from].name : '← К клетке';
  });
}

function closeSpecimen() {
  crossfade(() => {
    dropSpecimen();
    cardEl.classList.remove('min');
    document.body.classList.remove('min-ui');
    mode = 'cell';
    cardEl.style.display = 'none';
    camera.clearViewOffset();
    viewY = viewTarget = 0;
    controls.autoRotate = false;
    cell.group.visible = true;
    camera.position.copy(saved.pos);
    controls.target.copy(saved.target);
    home = cellHome;
    controls.minDistance = 3;
    controls.maxDistance = 26;
    top('Атлас клетки', 'Животная клетка. Вращайте пальцем, нажмите на органоид.');
    $('back').textContent = '← Меню';
    choose(selected);
  });
}

$('back').onclick = () => {
  if (mode === 'specimen') spec.from ? switchSpecimen(spec.from) : closeSpecimen();
  else if (mode === 'cell') location.href = 'index.html';
};
controls.addEventListener('start', () => { controls.autoRotate = false; });
// Сдвиг двумя пальцами ограничен: центр вида не уходит дальше края образца (или клетки),
// чтобы его нельзя было «потерять» за краем экрана.
const CELL_CENTER = new THREE.Vector3();
controls.addEventListener('change', () => {
  if (follow && mode === 'cell') return;   // в режиме «Следить» камера сама идёт за участником
  const c = spec && mode === 'specimen' ? spec.center : CELL_CENTER;
  const max = spec && mode === 'specimen' ? spec.radius * 1.1 : 3.5;
  const off = controls.target.clone().sub(c);
  if (off.length() > max) {
    const back = off.clone().setLength(off.length() - max);
    controls.target.sub(back);
    camera.position.sub(back);
  }
});
// Двойное касание по пустому месту — плавно вернуть исходный вид.
let lastTap = 0, cellHome = null;
function resetView() {
  if (!home || fly || mode === 'flying') return;
  const then = () => { controls.enabled = true; };
  flyTo(home.pos.clone(), home.target.clone(), 0.7, then);
}

// Строка-репортаж образца: заголовок этапа «расшифровывается», объяснение проявляется,
// точки показывают номер этапа, полоска — сколько этапу осталось.
function showStatus(s, el = cardEl.querySelector('.status')) {
  if (!el) return;
  if (el.dataset.head !== s.head) {
    el.dataset.head = s.head;
    el.innerHTML = '<div class="sh"></div><div class="sd">' + s.detail + '</div>' +
      (s.total ? '<div class="sp">' + Array.from({ length: s.total }, (_, i) => '<i' + (i === s.step ? ' class="on"' : i < s.step ? ' class="done"' : '') + '></i>').join('') +
        '<b><u></u></b></div>' : '');
    decode(el.querySelector('.sh'), s.head, 450);
    if (el.closest('#card')) fitView();
  }
  const bar = el.querySelector('.sp u');
  if (bar) bar.style.width = (s.frac * 100).toFixed(1) + '%';
}

// ---------- «Жизнь клетки» ----------
// Кнопка под верхней панелью включает процессы в обзоре клетки; строка-репортаж — там же.
let life = null;
const lifeEl = $('life');
lifeEl.innerHTML = '<button type="button" class="go">▶ Жизнь клетки</button>' +
  '<button type="button" class="go follow">◎ Следить</button><div class="procs"></div><div class="status"></div>';
const [lifeBtn, followBtn] = lifeEl.querySelectorAll('button');
// Выбор процесса: играет один, с начала.
function showProcs() {
  const box = lifeEl.querySelector('.procs');
  box.innerHTML = life.processes.map(p => '<button type="button" data-p="' + p.id + '" class="' + (p.small ? 'small' : '') + (p.id === life.getProcess() ? ' on' : '') + '">' + p.name + '</button>').join('');
  box.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      life.setProcess(b.dataset.p);
      const st = lifeEl.querySelector('.status');
      st.innerHTML = ''; delete st.dataset.head;
      showProcs();
    };
  });
}
let follow = false;
function setFollow(on) {
  follow = on;
  followBtn.classList.toggle('active', on);
  followBtn.textContent = on ? '◎ Обзор' : '◎ Следить';
  controls.autoRotate = false;
  controls.minDistance = on ? 0.8 : 3;
  if (!on && cellHome) flyTo(cellHome.pos.clone(), cellHome.target.clone(), 1.2, () => { controls.enabled = true; });
}
lifeBtn.onclick = () => {
  life.setOn(!life.isOn());
  showProcs();
  lifeEl.classList.toggle('on', life.isOn());
  lifeBtn.textContent = life.isOn() ? '■ Стоп' : '▶ Жизнь клетки';
  const st = lifeEl.querySelector('.status');
  st.innerHTML = ''; delete st.dataset.head;
  if (!life.isOn() && follow) setFollow(false);
};
followBtn.onclick = () => setFollow(!follow);

// «Следить»: камера плавно подъезжает к главному участнику процесса и сопровождает его.
// Вращать вокруг него пальцем по-прежнему можно.
const FOLLOW_DIST = 2.9;   // чуть дальше: вокруг участника видно соседние органоиды
function followCamera(dt) {
  const k = 1 - Math.exp(-dt * 2.5);
  const off = camera.position.clone().sub(controls.target);
  const goal = controls.target.clone().lerp(life.focus(), k);
  camera.position.copy(goal).add(off.setLength(THREE.MathUtils.lerp(off.length(), FOLLOW_DIST, k)));
  controls.target.copy(goal);
}

// Удержание пальца (или кнопки мыши) в любом месте экрана — пауза: анимации стоят, пока палец
// прижат, отпустили — идут дальше. Короткое касание и вращение работают как раньше.
let hold = false, holdTimer = 0, holdStart = null;
const holdEl = document.createElement('div');
holdEl.id = 'hold';
holdEl.textContent = '❚❚ Пауза — отпустите палец';
document.body.append(holdEl);
addEventListener('pointerdown', e => {
  holdStart = [e.clientX, e.clientY];
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { hold = true; holdEl.classList.add('on'); }, 350);
});
addEventListener('pointermove', e => {
  if (holdStart && !hold && Math.hypot(e.clientX - holdStart[0], e.clientY - holdStart[1]) > 12) clearTimeout(holdTimer);
});
const release = () => { clearTimeout(holdTimer); holdStart = null; hold = false; holdEl.classList.remove('on'); };
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
addEventListener('contextmenu', e => e.preventDefault());   // долгое нажатие не открывает меню браузера

// ---------- касания ----------

renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  top('Телефону не хватило памяти', 'Нажмите «Продолжить» — атлас откроется заново.');
  pickEl.innerHTML = '<button class="go" type="button">Продолжить</button>';
  pickEl.style.display = 'block';
  pickEl.querySelector('.go').onclick = () => location.reload();
});

const ray = new THREE.Raycaster();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('dblclick', resetView);
renderer.domElement.addEventListener('pointerup', e => {
  if (e.pointerType === 'touch' && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 8) {
    const now = performance.now();
    if (now - lastTap < 320) { resetView(); lastTap = 0; } else lastTap = now;
  }
});
renderer.domElement.addEventListener('pointerup', e => {
  if (mode !== 'cell' || !cell || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
  const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(p, camera);
  const ids = ray.intersectObject(cell.group, true).map(h => h.object.userData.id).filter(id => id && ATLAS[id]);
  choose(ids.find(id => !BACKDROP.includes(id)) || BACKDROP.map(b => ids.find(id => id === b)).find(Boolean) || null);
});

// ---------- анимация ----------

const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(), t = clock.elapsedTime;
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / fly.seconds);
    const k = ease(fly.t);
    camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
    if (fly.t === 1) { const then = fly.then; fly = null; then(); }
  }
  // «Жизнь клетки» идёт только в обзоре; панель с кнопкой видна только там.
  // В режиме «Следить» панель плавно уезжает вниз экрана и не закрывает участника.
  if (life) {
    lifeEl.style.display = mode === 'cell' ? 'block' : 'none';
    const down = follow && life.isOn();
    const want = down ? innerHeight - 22 - lifeEl.offsetHeight : 118;
    if (Math.abs((parseFloat(lifeEl.style.top) || 118) - want) > 1) lifeEl.style.top = want + 'px';
    if (!down && viewY) fitView();   // после «Обзора» «окно» плавно возвращается на место
    if (cell.group.visible && life.isOn()) {
      life.update(hold ? 0 : dt, camera);
      showStatus(life.status(), lifeEl.querySelector('.status'));
      if (follow && !fly) followCamera(dt);
      fitView();
    }
  }
  // Клетка: органоиды покачиваются, выбранный пульсирует ярче.
  if (cell && cell.group.visible) {
    cell.update(t);
    for (const id in cell.parts) {
      const k = id === selected ? 1.5 + 0.4 * Math.sin(t * 5) : 1;
      const kk = k * (life ? life.glow(id) : 1);
      for (const m of cell.parts[id].materials) if (m.uniforms) m.uniforms.strength.value = (m.userData.base ?? 1) * kk;
    }
  }
  easeView();
  if (spec) {
    spec.base.update(t, spec.height);
    if (spec.built) {
      if (spec.built.setPaused) spec.built.setPaused(hold || spec.userPaused);   // удержание пальца тоже ставит на паузу
      spec.built.update(t);
    }
    // Строка-репортаж: при смене события — «расшифровка» нового текста.
    if (spec.built && spec.built.status) showStatus(spec.built.status());
  }
  controls.update();
  layoutTags();
  if (probe && useBloom) {
    if (probe.wait > 0) probe.wait -= dt;
    else {
      probe.frames++; probe.time += dt;
      if (probe.time > 3) { if (probe.frames / probe.time < 30) { useBloom = false; if (glowBtn.isConnected) showGlow(); } probe = null; }
    }
  }
  if (useBloom) composer.render();
  else renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fitView();
});
