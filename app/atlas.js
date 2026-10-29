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
import { ATLAS, TOTAL } from './atlas-data.js';

// «Атлас клетки»: обзор животной клетки и органоиды крупным планом на стенде
// «биосканера» — с выносками частей и карточкой (строение, функции, типичная ошибка).

const $ = id => document.getElementById(id);
const topEl = $('top'), pickEl = $('pick'), cardEl = $('card'), fadeEl = $('fade');
const svg = $('leaders'), tagsEl = $('tags');
const BACKDROP = ['membrane'];   // прозрачная оболочка: выбирается, только если под ней ничего нет
const code = a => 'ORG-' + String(a.no).padStart(2, '0');

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
controls.enablePan = false;

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
  camera.position.set(0.6, 3.6, camera.aspect < 1 ? 22 : 10.5);
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
  const line = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const circle = (r, n = 96) => new THREE.BufferGeometry().setFromPoints([...Array(n)].map((_, i) => {
    const a = i / n * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }));
  g.add(new THREE.LineLoop(circle(radius), line(0x00e5ff, 0.9)));
  g.add(new THREE.LineLoop(circle(radius * 0.82), line(0x00e5ff, 0.35)));
  const hexRing = new THREE.LineLoop(circle(radius * 1.12, 6), line(0x39ff14, 0.7));
  g.add(hexRing);
  // Риски по краю, как на шкале прибора.
  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, r2 = radius * (i % 6 ? 0.94 : 0.88);
    ticks.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius), new THREE.Vector3(Math.cos(a) * r2, 0, Math.sin(a) * r2));
  }
  const tickLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), line(0x00e5ff, 0.5));
  g.add(tickLines);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(floor);
  // Кольцо сканирования проходит снизу вверх через органоид.
  const scan = new THREE.Mesh(new THREE.RingGeometry(radius * 0.97, radius * 1.02, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
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

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

async function buildSpecimen(id) {
  const a = ATLAS[id];
  // Модель из Blender (общая с клеткой) или образец, построенный в коде.
  const built = a.build === 'membrane' ? createMembrane() : null;
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
  const tags = (a.labels || []).map(l => {
    const at = anchorOn(holder, l.part, l.dir);
    if (!at) return null;
    const color = '#' + new THREE.Color(PARTS[l.part]?.color ?? 0x00e5ff).getHexString();
    const g = svgEl('g');
    const path = svgEl('path');
    const node = svgEl('g');
    node.append(svgEl('circle', { r: 8, class: 'spin' }), svgEl('circle', { r: 4.2, class: 'ring' }), svgEl('circle', { r: 2, class: 'core' }));
    node.style.stroke = node.style.fill = color;
    g.append(path, node);
    svg.append(g);
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = l.text;
    el.style.setProperty('--c', color);
    tagsEl.append(el);
    return { at, g, path, node, el };
  }).filter(Boolean);

  return { id, group, base, built, height: half.y * 2 + 0.6, radius: Math.max(half.x, half.y, half.z), center: new THREE.Vector3(0, -0.15, 0), tags };
}

// Подписи расставляются заново каждый кадр и держатся за свои точки на модели.
// От узла линия уходит наискосок наружу (вверх или вниз — по положению узла), затем
// под тупым углом переходит в горизонтальную полку, на конце которой подпись.
const P = new THREE.Vector3(), C = new THREE.Vector3();
const SLOPE = Math.tan(THREE.MathUtils.degToRad(35));   // наклон косого отрезка
const SHELF = 22;                                        // длина горизонтальной полки, пикселей
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
    P.copy(t.at).project(camera);
    t.x = (P.x + 1) / 2 * W;
    t.y = (1 - P.y) / 2 * H;
    // Скобки должны обнимать сам текст: ширина подписи — по самой длинной её строке.
    if (!t.sized) {
      const r = document.createRange();
      r.selectNodeContents(t.el);
      const line = Math.max(...[...r.getClientRects()].map(q => q.width));
      if (line > 0) { t.el.style.width = Math.ceil(line + 1) + 'px'; t.sized = true; }
    }
    t.h = t.el.offsetHeight;
    t.w = t.el.offsetWidth;
    t.ly = t.y + (t.y < cy ? -30 : 30);
    // Точка на дальней стороне образца — выноска бледнее.
    C.copy(camera.position).sub(t.at);
    t.back = C.dot(t.at) < 0;
    (t.x < cx ? sides.l : sides.r).push(t);
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
      t.el.className = 'tag ' + s;
      t.el.style.left = Math.min(Math.max(s === 'l' ? end - t.w : end, 4), W - 4 - t.w) + 'px';   // подпись всегда целиком на экране
      t.el.style.top = (t.ly - 3) + 'px';
      t.el.style.opacity = t.back ? 0.5 : 1;
      t.g.style.opacity = t.back ? 0.4 : 1;
      t.path.setAttribute('d', 'M' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + t.ly.toFixed(1) + 'L' + end.toFixed(1) + ' ' + t.ly.toFixed(1));
      t.node.setAttribute('transform', 'translate(' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + ')');
    }
  }
}

function showCard(id) {
  const a = ATLAS[id];
  const tabs = Object.keys(a.card);
  cardEl.innerHTML = '<div class="head"><span class="no">' + code(a) + '</span><span class="name">' + a.name + '</span><span class="lat">' + a.lat +
    '</span><span class="count">' + String(a.no).padStart(2, '0') + ' / ' + TOTAL + '</span></div>' +
    '<div class="chips">' + (a.data || []).map(([k]) => '<div class="chip"><span>' + k + ': <em></em></span></div>').join('') + '</div>' +
    '<div class="tabs">' + tabs.map((t, i) => '<button type="button" data-i="' + i + '"' + (t === 'Ошибка' ? ' class="warn"' : '') + '>' +
      (t === 'Ошибка' ? '⚠ Типичная ошибка' : t) + '</button>').join('') + '</div><ul></ul>';
  cardEl.querySelectorAll('.chip em').forEach((em, i) => setTimeout(() => decode(em, a.data[i][1]), 150 * i));
  const list = cardEl.querySelector('ul');
  const btns = [...cardEl.querySelectorAll('.tabs button')];
  const open = i => {
    btns.forEach((b, j) => b.classList.toggle('on', i === j));
    list.innerHTML = a.card[tabs[i]].map(s => '<li>' + s + '</li>').join('');
    fitView();
    teletype(list);
  };
  btns.forEach((b, i) => { b.onclick = () => open(i); });
  cardEl.style.display = 'block';
  open(0);
}

// Образец показывается в свободной части экрана — между верхней панелью и карточкой:
// сдвигаем «окно» камеры (setViewOffset), а не сам образец.
function fitView() {
  const W = innerWidth, H = innerHeight;
  if (!spec || mode === 'cell') { camera.clearViewOffset(); return; }
  const t = topEl.getBoundingClientRect().bottom, b = cardEl.getBoundingClientRect().top;
  camera.setViewOffset(W, H, 0, H / 2 - (t + b) / 2, W, H);
  return (b - t) / H;
}

function viewDistance(free) {
  const v = THREE.MathUtils.degToRad(camera.fov / 2);
  const vf = Math.atan(Math.tan(v) * free);
  const hf = Math.atan(Math.tan(v) * camera.aspect * 0.72);   // по бокам остаётся место для подписей
  return spec.radius * 1.05 / Math.sin(Math.min(vf, hf));
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
  // Подлетаем к ближайшему из органоидов этого вида, потом переходим на стенд.
  const objs = cell.parts[id].objects;
  const near = objs.reduce((p, o) => (o.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) < p.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) ? o : p));
  const box = new THREE.Box3().setFromObject(near);
  const c = box.getCenter(new THREE.Vector3());
  const dir = camera.position.clone().sub(c).normalize();
  const go = () => crossfade(async () => {
    mode = 'specimen';
    cell.group.visible = false;
    spec = await buildSpecimen(id);
    scene.add(spec.group);
    top('Образец ' + code(ATLAS[id]), 'Вращайте образец пальцем. Подписи следуют за моделью.');   // название — в карточке
    showCard(id);
    const free = fitView();
    const d = viewDistance(free);
    controls.target.copy(spec.center);
    camera.position.set(...(ATLAS[id].view || [0.35, 0.55, 1])).normalize().multiplyScalar(d).add(spec.center);
    controls.minDistance = d * 0.45;
    controls.maxDistance = d * 1.8;
    controls.enabled = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    $('back').textContent = '← К клетке';
  });
  if (instant) { go(); return; }
  mode = 'flying';
  flyTo(c.clone().add(dir.multiplyScalar(box.getSize(new THREE.Vector3()).length() * 1.1)), c, 1.1, go);
}

function closeSpecimen() {
  crossfade(() => {
    scene.remove(spec.group);
    // Геометрия модели общая с клеткой (кэш загрузчика) — освобождаем только стенд.
    for (const g of [spec.base, spec.built && spec.built.group]) {
      if (g) g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    spec = null;
    mode = 'cell';
    cardEl.style.display = 'none';
    camera.clearViewOffset();
    controls.autoRotate = false;
    cell.group.visible = true;
    camera.position.copy(saved.pos);
    controls.target.copy(saved.target);
    controls.minDistance = 3;
    controls.maxDistance = 26;
    top('Атлас клетки', 'Животная клетка. Вращайте пальцем, нажмите на органоид.');
    $('back').textContent = '← Меню';
    choose(selected);
  });
}

$('back').onclick = () => { if (mode === 'specimen') closeSpecimen(); else if (mode === 'cell') location.href = 'index.html'; };
controls.addEventListener('start', () => { controls.autoRotate = false; });

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
renderer.domElement.addEventListener('pointerup', e => {
  if (mode !== 'cell' || !cell || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
  const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(p, camera);
  const ids = ray.intersectObject(cell.group, true).map(h => h.object.userData.id).filter(id => id && ATLAS[id]);
  choose(ids.find(id => !BACKDROP.includes(id)) || ids[0] || null);
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
  // Клетка: органоиды покачиваются, выбранный пульсирует ярче.
  if (cell && cell.group.visible) {
    cell.update(t);
    for (const id in cell.parts) {
      const k = id === selected ? 1.5 + 0.4 * Math.sin(t * 5) : 1;
      for (const m of cell.parts[id].materials) if (m.uniforms) m.uniforms.strength.value = (m.userData.base ?? 1) * k;
    }
  }
  if (spec) { spec.base.update(t, spec.height); if (spec.built) spec.built.update(t); }
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
