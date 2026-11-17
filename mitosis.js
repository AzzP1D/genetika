import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { motes } from './style.js';
import { STAGES } from './mitosis-data.js';
import { SCENES } from './mitosis-stages.js';
import { DEMOS } from './mitosis-demo.js';
import { createWorld } from './mitocell.js';
import { ease } from './motion.js';

// Урок «Митоз»: общий каркас — сцена, камера, свечение, смена этапов, запоминание места.
// Клетка (mitocell.js) одна на весь урок: готовые этапы меняют её состояние и переходят друг
// в друга без затемнения. Этап, который ещё не построен, показывает только название и текст.
//
// Этап — функция build(ctx) из mitosis-stages.js. ctx:
//   ui, scene, camera, controls, world (клетка), next() — этап пройден,
//   fly(pos, target, сек) — плавный перелёт камеры, fit(радиус) — расстояние, с которого шар
//   такого радиуса виден целиком, lock(да/нет) — запретить ученику вращать сцену,
//   fade(fn) — сменить картинку через затемнение.
// Этап возвращает (всё, кроме intro, не обязательно):
//   intro()            — показать текст и кнопки;
//   update(dt, t)      — шаг анимации: dt — секунды с прошлого кадра, t — время урока;
//   tap(ray)           — короткое нажатие, ray — луч от пальца;
//   drag(phase, x, y)  — движение пальца: phase — 'down', 'move' или 'up';
//   leave()            — убрать за собой при уходе с этапа;
//   group              — своя отдельная сцена (у образцов): при уходе удаляется.

// Для проверки: mitosis.html?stage=anaphase — сразу нужный этап, ?demo=chromosome — образец
// объекта вне урока (mitosis-demo.js), &speed=3 — ускорить анимации,
// &bloom=0 — без свечения; window.__tick(сек) — прокрутить анимацию, когда панель браузера скрыта.
const params = new URLSearchParams(location.search);
// Скорость — только положительное число: при отрицательном или NaN таймеры этапов идут назад
// и камера уезжает в точку, из которой уже не вернуться.
const speedParam = parseFloat(params.get('speed'));
const SPEED = Number.isFinite(speedParam) && speedParam > 0 ? Math.min(speedParam, 20) : 1;


const hudEl = document.getElementById('hudText');
const railEl = document.getElementById('rail');
const labelEl = document.getElementById('label');
const buttonsEl = document.getElementById('buttons');
const fadeEl = document.getElementById('fade');

// Интерфейс, через который этапы показывают текст и кнопки (как в «Репликации ДНК»).
const ui = {
  hud: html => { hudEl.innerHTML = html; },
  label: html => { labelEl.style.display = html ? 'block' : 'none'; if (html) labelEl.innerHTML = html; },
  buttons: (list, cls = '') => {
    buttonsEl.className = cls;
    buttonsEl.replaceChildren(...list.map(b => {
      const el = document.createElement('button');
      el.textContent = b.text;
      if (b.primary) el.className = 'primary';
      el.disabled = !!b.disabled;
      el.onclick = b.onClick;
      return el;
    }));
  },
};

// Полоска этапов над заголовком: пройденные, текущий, оставшиеся.
function showRail(i) {
  railEl.innerHTML = STAGES.map((s, k) => '<i class="' + (k < i ? 'done' : k === i ? 'now' : '') + '"></i>').join('') +
    '<em>' + (i + 1) + ' / ' + STAGES.length + '</em>';
}

// Освобождает память видеокарты, занятую этапом, который больше не нужен.
function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

const storage = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* без сохранения */ } } };

// Урок запоминает этап: если телефон перезапустит страницу, можно продолжить с того же места.
function saveStage(id) { storage.set('mito-stage', id ? JSON.stringify({ stage: id, t: Date.now() }) : null); }
function savedStage() {
  try {
    const v = JSON.parse(storage.get('mito-stage'));
    const i = v && Date.now() - v.t < 3 * 3600e3 ? STAGES.findIndex(s => s.id === v.stage) : -1;
    return i > 0 ? i : null;
  } catch (e) { return null; }
}

// Плавная смена сцены через затемнение.
function crossfade(swap) {
  fadeEl.classList.add('on');
  setTimeout(() => { swap(); fadeEl.classList.remove('on'); }, 650);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));   // выше телефону тяжело, а глазу разница почти не видна
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;   // без тонирования — кислотные цвета остаются яркими
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060d);

// Ближняя и дальняя границы не слишком далеко друг от друга: иначе на части телефонов
// не хватает точности глубины, и близкие поверхности «мерцают».
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 26;
const homeView = () => new THREE.Vector3(0, 1.2, camera.aspect < 1 ? 16 : 9);
const fit = radius => radius * 1.1 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));

// Плавный перелёт камеры. Пока она летит, ученик сцену не вращает.
let flight = null, locked = false, grabbed = false;
function fly(pos, target, seconds = 1.6) {
  flight = { t: 0, seconds, fromPos: camera.position.clone(), toPos: pos, fromTarget: controls.target.clone(), toTarget: target };
  controls.enabled = false;
  grabbed = false;
}
function lock(on) { locked = on; }

// Светящаяся «пыль» — фон всех этапов.
const dust = motes(260, 7);
scene.add(dust);

// Свечение (bloom). Если телефон не успевает рисовать 30 кадров в секунду, оно отключается само;
// ученик может выключить его и кнопкой ✦ — выбор общий с другими уроками.
// Свечение требует «дробного» буфера: там, где его нет, composer не создаём вовсе —
// иначе каждый кадр переключает фреймбуферы и картинка выходит чёрной.
const gl = renderer.getContext();
const canBloom = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
const composer = canBloom ? new EffectComposer(renderer) : null;
if (composer) {
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.3, 0.78));
  composer.addPass(new OutputPass());
}
let useBloom = canBloom && storage.get('gen-glow') !== 'off' && params.get('bloom') !== '0';
let probe = null;          // замер частоты кадров: { wait, frames, time }
const glowBtn = document.getElementById('glow');
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

// ---------- этапы ----------

let index = -1;      // номер текущего этапа
let stage = null;    // сам этап (null, пока он не построен)
let world = null;    // клетка: создаётся при входе в первый готовый этап

function leave() {
  if (!stage) return;
  if (stage.leave) stage.leave();
  if (stage.group) { scene.remove(stage.group); disposeTree(stage.group); }
  stage = null;
}

// jump — пришли не с предыдущего этапа (сразу на этап, «Назад», «Продолжить»):
// клетку и камеру ставим в начало этапа мгновенно.
function enter(i, jump = true) {
  const carryMetaphase = !jump && index >= 0 && STAGES[index].id === 'metaphase' && STAGES[i].id === 'anaphase';
  leave();
  index = i;
  const s = STAGES[i];
  saveStage(i > 0 ? s.id : null);
  showRail(i);
  ui.label(null);
  flight = null;
  grabbed = false;
  lock(false);

  const build = SCENES[s.id];
  if (world) world.group.visible = !!build;
  if (build) {
    if (!world) { world = createWorld(); scene.add(world.group); }
    controls.minDistance = 0.8;
    controls.maxDistance = fit(world.radius.cell) * 1.4;
    // Состояние клетки приводим к началу этапа всегда: иначе после обычного «Далее»
    // клетка остаётся в состоянии прошлого этапа (центросомы на полюсах и т. п.).
    if (!carryMetaphase) world.pose(s.id);
    if (jump) {
      camera.position.set(0.15, 0.22, 1).normalize().multiplyScalar(fit(world.radius.cell) * 1.12);
      controls.target.set(0, 0, 0);
    }
    return mount(build);
  }
  camera.position.copy(homeView());
  controls.target.set(0, 0, 0);
  ui.hud('<b>' + s.title + '</b><span>' + s.text + '</span><br><span class="hint">Каркас урока: сцена и задания этапа появятся на следующих шагах.</span>');
  const list = [];
  if (i > 0) list.push({ text: '← Назад', onClick: () => go(i - 1) });
  list.push({ text: i + 1 < STAGES.length ? 'Далее →' : 'Завершить урок', primary: true, onClick: next });
  ui.buttons(list);
}

function mount(build) {
  stage = build({ ui, scene, camera, controls, world, next, fly, fit, lock, fade: crossfade });
  if (stage.group) scene.add(stage.group);
  stage.intro();
}

function go(i) { ui.buttons([]); crossfade(() => enter(i)); }
// Между двумя готовыми этапами клетка продолжает жить — переход без затемнения.
function next() {
  const i = index + 1;
  if (i >= STAGES.length) return finish();
  if (SCENES[STAGES[index].id] && SCENES[STAGES[i].id]) { ui.buttons([]); enter(i, false); }
  else go(i);
}

// Урок пройден: отмечаем в пути и предлагаем следующую тему.
function finish() {
  leave();
  saveStage(null);
  Progress.markDone('mitosis');
  railEl.querySelectorAll('i').forEach(el => { el.className = 'done'; });
  ui.hud('<b>Урок пройден!</b><span>Митоз: от интерфазы до двух дочерних клеток.</span>');
  const nx = Progress.nextAfter('mitosis');
  const list = [];
  if (nx && nx.href) list.push({ text: 'Дальше: ' + nx.title + ' →', primary: true, onClick: () => { location.href = nx.href; } });
  else if (nx) list.push({ text: 'Дальше: ' + nx.title + ' (скоро)', disabled: true });
  list.push({ text: 'К карте пути', primary: !(nx && nx.href), onClick: () => { location.href = 'index.html'; } });
  list.push({ text: 'Пройти заново', onClick: () => go(0) });
  ui.buttons(list, 'column');
}

document.getElementById('loading').remove();
probe = { wait: 2, frames: 0, time: 0 };
{
  const demo = DEMOS[params.get('demo')];
  const direct = STAGES.findIndex(s => s.id === params.get('stage'));
  const resume = savedStage();
  if (demo) { railEl.remove(); camera.position.copy(homeView()); mount(demo); }
  else if (direct >= 0) enter(direct);
  else if (resume) {
    showRail(resume);
    camera.position.copy(homeView());
    ui.hud('<b>Продолжить урок?</b><span>В прошлый раз вы остановились на этапе «' + STAGES[resume].title + '».</span>');
    ui.buttons([
      { text: 'Продолжить: ' + STAGES[resume].title, primary: true, onClick: () => go(resume) },
      { text: 'Начать сначала', onClick: () => go(0) },
    ], 'column');
  } else enter(0);
}

// ---------- касания ----------

// Если видеокарта всё же «сбросилась» (нехватка памяти), предлагаем продолжить с того же этапа.
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  ui.hud('<b>Телефону не хватило памяти</b><span>Ничего страшного: урок продолжится с того же этапа.</span>');
  ui.label(null);
  ui.buttons([{ text: 'Продолжить', primary: true, onClick: () => location.reload() }]);
});

const ray = new THREE.Raycaster();
let down = null;
const drag = (phase, e) => { if (stage && stage.drag && !flight) stage.drag(phase, e.clientX, e.clientY); };
renderer.domElement.addEventListener('pointerdown', e => {
  if (!stage || flight) return;
  down = [e.clientX, e.clientY];
  if (stage.drag) {
    const grabbedNow = stage.drag('down', e.clientX, e.clientY);
    if (grabbedNow) { grabbed = true; controls.enabled = false; }
  }
}, true);
renderer.domElement.addEventListener('pointermove', e => { if (grabbed) drag('move', e); });
renderer.domElement.addEventListener('pointercancel', e => {
  if (grabbed) { grabbed = false; drag('up', e); controls.enabled = !flight; }
  down = null;
});
renderer.domElement.addEventListener('pointerup', e => {
  const from = down;
  down = null;
  if (grabbed) {
    grabbed = false;
    drag('up', e);
    controls.enabled = !flight;
    return;
  }
  if (!stage || !stage.tap || flight || !from || Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 8) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  stage.tap(ray);
});

// ---------- анимация ----------

// Всё движение считается от времени, прошедшего с прошлого кадра (dt), а не от числа кадров:
// на слабом телефоне анимация идёт с той же скоростью, только менее плавно.
let time = 0;
function step(dt) {
  dt *= SPEED;
  time += dt;
  dust.update(time);
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / flight.seconds);
    const k = ease(flight.t);
    camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
    if (flight.t === 1) { flight = null; controls.enabled = true; }
  }
  if (world && world.group.visible) world.update(dt, time);
  if (stage && stage.update) stage.update(dt, time);
}
window.__tick = sec => { for (let k = 0; k < sec * 30; k++) step(1 / 30); return time; };
window.__view = { camera, controls, get world() { return world; } };   // для проверки: камера и состояние клетки

const timer = new THREE.Timer();
timer.connect(document);   // после возврата на вкладку время не «прыгает»
renderer.setAnimationLoop(stamp => {
  timer.update(stamp);
  const dt = Math.min(timer.getDelta(), 0.1);   // долгий кадр не превращается в рывок
  step(dt);
  controls.update();
  if (probe && useBloom) {
    if (probe.wait > 0) probe.wait -= dt;
    else {
      probe.frames++; probe.time += dt;
      if (probe.time > 3) { if (probe.frames / probe.time < 30) { useBloom = false; if (glowBtn.isConnected) showGlow(); } probe = null; }
    }
  }
  if (useBloom && composer) composer.render();
  else renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});
