import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createNucleus, ORI, VIEW } from './nucleus.js';
import { createHelix } from './helix.js';
import { createChromosome } from './chromosome.js';
import { addLights } from './style.js';
import { createCell } from './cellmodel.js';

// Органоиды собранной клетки: название и краткое описание.
const ORGANELLES = {
  membrane:   { name: 'Плазматическая мембрана', info: 'Отделяет клетку от внешней среды и регулирует обмен веществ.' },
  nucleus:    { name: 'Ядро', info: 'Хранит наследственную информацию — ДНК в составе хроматина. Оболочка двойная, с порами.' },
  er:         { name: 'Эндоплазматическая сеть', info: 'Начинается от наружной мембраны ядра и окружает его слоями цистерн. Шероховатая ЭПС с рибосомами синтезирует белки, гладкая — липиды и углеводы.' },
  ribosomes:  { name: 'Рибосомы', info: 'Здесь идёт синтез белка — трансляция.' },
  golgi:      { name: 'Аппарат Гольджи', info: 'Упаковывает и сортирует вещества, образует лизосомы.' },
  mito:       { name: 'Митохондрии', info: 'Энергетические станции клетки: синтез АТФ. Имеют собственную ДНК.' },
  centrioles: { name: 'Центриоли', info: 'Участвуют в образовании веретена деления.' },
  lysosomes:  { name: 'Лизосомы', info: 'Содержат ферменты, расщепляющие вещества.' },
  cytoskeleton: { name: 'Цитоскелет', info: 'Каркас клетки из белковых нитей: микротрубочки, микрофиламенты и промежуточные филаменты.' },
};
const BACKDROP = ['cytoskeleton', 'membrane'];   // фон: выбирается, только если под пальцем нет органоида

// Мини-задание: где удваивается ДНК клетки.
const TASK = {
  question: 'Где в клетке происходит репликация (удвоение) ДНК хромосом?',
  options: ['nucleus', 'ribosomes', 'mito', 'golgi'],
  answer: 'nucleus',
  hints: {
    ribosomes: 'Рибосомы синтезируют белок (трансляция), а не копируют ДНК.',
    mito: 'Почти верно: у митохондрий есть своя небольшая ДНК, и она тоже удваивается. Но ДНК хромосом находится в другом месте.',
    golgi: 'Аппарат Гольджи упаковывает и сортирует вещества. ДНК в нём нет.',
  },
};

const labelEl = document.getElementById('label');
const hudEl = document.getElementById('hud');
const buttonsEl = document.getElementById('buttons');
const fadeEl = document.getElementById('fade');

// Интерфейс, через который этапы показывают текст и кнопки.
const ui = {
  hud: html => { hudEl.innerHTML = html; },
  label: html => { labelEl.style.display = html ? 'block' : 'none'; if (html) labelEl.innerHTML = html; },
  buttons: (list, cls = '') => {
    buttonsEl.className = cls;
    buttonsEl.replaceChildren(...list.map(b => {
      const el = document.createElement('button');
      el.textContent = b.text;
      if (b.primary) el.className = 'primary';
      if (b.color) el.style.background = b.color;
      el.disabled = !!b.disabled;
      el.onclick = b.onClick;
      return el;
    }));
  },
};

// Освобождает память видеокарты, занятую этапом, который больше не нужен.
function disposeTree(root) {
  if (!root) return;
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

// Урок запоминает этап: если телефон перезапустит страницу, можно продолжить с того же места.
const STAGES = { nucleus: 'Внутри ядра', helix: 'Двойная спираль ДНК', chromosome: 'Хромосома' };
function saveStage(stage) { storage.set('repl-stage', stage ? JSON.stringify({ stage, t: Date.now() }) : null); }
function savedStage() {
  try {
    const v = JSON.parse(storage.get('repl-stage'));
    return v && STAGES[v.stage] && Date.now() - v.t < 3 * 3600e3 ? v.stage : null;
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

// Свечение (bloom): яркие части окутываются ореолом. Если телефон не успевает
// рисовать хотя бы 30 кадров в секунду, свечение отключается само.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.3, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// Свечение требует, чтобы видеокарта умела рисовать в «дробные» цвета; на части телефонов
// этого нет, и картинка мигает. Ученик может выключить свечение кнопкой — выбор запоминается.
const gl = renderer.getContext();
const canBloom = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
const storage = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* без сохранения */ } } };
let useBloom = canBloom && storage.get('gen-glow') !== 'off' && new URLSearchParams(location.search).get('bloom') !== '0';
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
let probe = null;          // замер частоты кадров: { wait, frames, time }
const startProbe = () => { probe = { wait: 2, frames: 0, time: 0 }; };
controls.enableDamping = true;
controls.enablePan = false;

let selected = null;     // id выбранного органоида
let mode = 'task';       // task → flying → nucleus → flying → helix
let fly = null;
let cell = null, cellHolder = null, nucleus = null, helix = null, chromo = null, helixDistance = 8;

createCell().then(c => {
  cell = c;
  cellHolder = c.group;
  scene.add(cellHolder);
  addLights(cellHolder);

  camera.position.set(0.6, 3.6, camera.aspect < 1 ? 22 : 10.5);
  controls.minDistance = 3;
  controls.maxDistance = 26;
  document.getElementById('loading').remove();
  startProbe();
  // Для проверки и демонстрации: cell.html?stage=nucleus или ?stage=helix.
  const stage = new URLSearchParams(location.search).get('stage');
  if (stage) return goStage(stage);
  const resume = savedStage();
  if (resume) {
    ui.hud('<b>Продолжить урок?</b><span>В прошлый раз вы остановились на этапе «' + STAGES[resume] + '».</span>');
    ui.buttons([
      { text: 'Продолжить: ' + STAGES[resume], primary: true, onClick: () => { ui.buttons([]); goStage(resume); } },
      { text: 'Начать сначала', onClick: () => { ui.buttons([]); saveStage(null); showTask(); } },
    ], 'column');
    return;
  }
  showTask();
});

function goStage(stage) {
  if (stage === 'nucleus') return enterNucleus();
  if (stage === 'helix') return enterHelix();
  if (stage === 'chromosome') return enterChromosome();
  showTask();
}

// ---------- задание ----------

function showTask() {
  hudEl.innerHTML = '<b>Задание</b><span>' + TASK.question + '</span><br><span class="hint">Подходящие органоиды мигают.</span>';
}

function choose(id) {
  selected = id;
  if (!id) { labelEl.style.display = 'none'; return; }
  const o = ORGANELLES[id];
  let html = '<b>' + o.name + '</b><br>' + o.info;
  if (mode === 'task' && TASK.options.includes(id)) {
    if (id === TASK.answer) {
      html = '<b class="ok">Верно — ядро!</b><br>Именно здесь находится ДНК хромосом. Летим внутрь…';
      setTimeout(flyIntoNucleus, 900);
      mode = 'flying';
    } else {
      html = '<b class="err">' + o.name + ' — не то.</b><br>' + TASK.hints[id];
    }
  }
  labelEl.innerHTML = html;
  labelEl.style.display = 'block';
}

function flyIntoNucleus() {
  const box = new THREE.Box3();
  cell.parts.nucleus.objects.forEach(o => box.expandByObject(o));
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const dir = camera.position.clone().sub(center).normalize();
  flyTo(center.clone().add(dir.multiplyScalar(radius * 0.9)), center, 2.4, enterNucleus);
}

function flyTo(pos, target, seconds, then) {
  fly = { t: 0, seconds, then, fromPos: camera.position.clone(), toPos: pos, fromTarget: controls.target.clone(), toTarget: target };
  controls.enabled = false;
}

// ---------- этап 2: внутри ядра ----------

function enterNucleus() {
  saveStage('nucleus');
  crossfade(() => {
    scene.remove(cellHolder);
    disposeTree(cellHolder);
    cell = cellHolder = null;
    nucleus = createNucleus();
    scene.add(nucleus.group);
    scene.fog = new THREE.FogExp2(0x05071a, 0.16);
    scene.background = new THREE.Color(0x05071a);
    camera.position.copy(VIEW.camera);
    controls.target.copy(VIEW.target);
    if (camera.aspect < 1) {
      // На вертикальном экране отодвигаемся, чтобы был виден и хроматин, и светящийся участок.
      controls.target.x += 0.25;
      camera.position.set(0.75, 0.45, 4.0);
    }
    controls.minDistance = 0.7;
    controls.maxDistance = 4.2;
    controls.enabled = true;
    mode = 'nucleus';
    ui.hud('<b>Внутри ядра</b><span>Это хроматин: ДНК намотана на белки-гистоны, вместе они образуют нуклеосомы. Репликация начинается в точках начала репликации — там, где ДНК свободна от гистонов. Найдите светящийся участок и нажмите на него.</span>');
    ui.label(null);
  });
}

function tapNucleus(ray) {
  const hit = ray.intersectObjects([nucleus.ori, nucleus.halo, ...nucleus.open, ...nucleus.closed, nucleus.nucleolus, nucleus.background], false)[0];
  if (!hit) return ui.label(null);
  const o = hit.object;
  if (o === nucleus.ori || o === nucleus.halo) {
    mode = 'flying';
    ui.label('<b class="ok">Точка начала репликации!</b><br>Приближаемся к молекуле ДНК…');
    const dir = camera.position.clone().sub(ORI).normalize();
    flyTo(ORI.clone().add(dir.multiplyScalar(0.25)), ORI.clone(), 1.8, enterHelix);
  } else if (o === nucleus.nucleolus) {
    ui.label('<b>Ядрышко</b><br>Здесь собираются субъединицы рибосом. Ищите светящийся участок на нитях хроматина.');
  } else if (nucleus.closed.includes(o)) {
    ui.label('<b>Плотно упакованный хроматин</b><br>Нуклеосомы уложены в толстую спираль. Здесь ДНК скрыта, и ферментам к ней не подобраться.');
  } else if (nucleus.open.includes(o)) {
    ui.label('<b>Нуклеосомы</b><br>ДНК делает почти два оборота вокруг восьми белков-гистонов. Ищите участок ДНК, который светится.');
  } else {
    ui.label('<b>Хроматин</b><br>Другие нити ДНК с белками. Ищите светящийся участок рядом с вами.');
  }
}

// ---------- этап 3: двойная спираль ----------

function enterHelix() {
  saveStage('helix');
  crossfade(() => {
    for (const g of [nucleus && nucleus.group, cellHolder]) if (g) { scene.remove(g); disposeTree(g); }
    nucleus = cell = cellHolder = null;
    scene.fog = null;
    scene.background = new THREE.Color(0x04060d);
    helix = createHelix(ui, { onFinish: enterChromosome });
    scene.add(helix.group);
    controls.target.copy(helix.focus);
    const d = helixDistance = helix.viewDistance(camera.aspect, camera.fov);
    camera.position.copy(helix.focus).add(new THREE.Vector3(0.08, 0.1, 1).multiplyScalar(d));
    controls.minDistance = 2.5;
    controls.maxDistance = d * 2.2;
    controls.enabled = true;
    mode = 'helix';
    helix.intro();
  });
}

// ---------- этап 4: хромосома и итоговый вопрос ----------

function enterChromosome() {
  saveStage('chromosome');
  crossfade(() => {
    for (const g of [helix && helix.group, nucleus && nucleus.group, cellHolder]) if (g) { scene.remove(g); disposeTree(g); }
    helix = nucleus = cell = cellHolder = null;
    scene.fog = null;
    chromo = createChromosome(ui, { onNext: finishLesson });
    scene.add(chromo.group);
    controls.target.copy(chromo.focus);
    const d = Math.max(8, 3.6 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect)));
    camera.position.set(0, 0.3, d);
    controls.minDistance = 3;
    controls.maxDistance = d * 1.5;
    controls.enabled = true;
    mode = 'chromosome';
    chromo.intro();
  });
}

// Урок пройден: отмечаем в пути и предлагаем следующую тему.
function finishLesson() {
  saveStage(null);
  Progress.markDone('repl');
  const nx = Progress.nextAfter('repl');
  const list = [];
  if (nx && nx.href) list.push({ text: 'Дальше: ' + nx.title + ' →', primary: true, onClick: () => { location.href = nx.href; } });
  else if (nx) list.push({ text: 'Дальше: ' + nx.title + ' (скоро)', disabled: true });
  list.push({ text: 'К карте пути', primary: !(nx && nx.href), onClick: () => { location.href = 'index.html'; } });
  list.push({ text: 'Пройти заново', onClick: () => { saveStage(null); location.reload(); } });
  ui.buttons(list, 'column');
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
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (mode === 'flying' || mode === 'chromosome' || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
  const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(p, camera);
  if (mode === 'nucleus') return tapNucleus(ray);
  if (mode === 'helix') return helix.tap(ray);
  if (!cell) return;
  const ids = ray.intersectObject(cell.group, true).map(h => h.object.userData.id).filter(Boolean);
  choose(ids.find(id => !BACKDROP.includes(id)) || BACKDROP.map(b => ids.find(id => id === b)).find(Boolean) || null);
});

// ---------- анимация ----------

const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const clock = new THREE.Clock();
const SPEED = +new URLSearchParams(location.search).get('speed') || 1;   // для проверки: ускорение анимации
// Для проверки в фоновой вкладке, где кадры не рисуются: прокрутить этап спирали на sec секунд.
window.__tick = async sec => { for (let k = 0; k < sec * 30; k++) { (helix || chromo).update(1 / 30, k / 30); for (let j = 0; j < 8; j++) await null; } };
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(), t = clock.elapsedTime;

  if (fly) {
    fly.t = Math.min(1, fly.t + dt / fly.seconds);
    const k = ease(fly.t);
    camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
    if (fly.t === 1) { const then = fly.then; fly = null; then(); }
  }
  if (nucleus) nucleus.update(t);
  if (chromo) chromo.update(dt * SPEED, t);
  if (helix) {
    helix.update(dt * SPEED, t);
    // Камера плавно следует за тем местом спирали, где сейчас идёт работа.
    const d = helix.track.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 2.5));
    controls.target.add(d);
    camera.position.add(d);
    if (helix.zoom.pending) {
      const off = camera.position.clone().sub(controls.target);
      const want = helixDistance * helix.zoom.k;
      const len = THREE.MathUtils.lerp(off.length(), want, Math.min(1, dt * 2));
      camera.position.copy(controls.target).add(off.setLength(len));
      if (Math.abs(len - want) < 0.02 * want) helix.zoom.pending = false;
    }
  }

  // Клетка: органоиды покачиваются, выбранный светится ярче, варианты ответа мерцают.
  // Во время полёта к ядру всё, кроме ядра, плавно гаснет.
  if (cell && cellHolder.parent) {
    cell.update(t);
    const fading = mode !== 'task';
    for (const id in cell.parts) {
      const p = cell.parts[id];
      let k = 1;
      if (id === selected) k = 1.5 + 0.4 * Math.sin(t * 5);
      else if (mode === 'task' && TASK.options.includes(id)) k = 1.15 + 0.25 * Math.sin(t * 2.5 + TASK.options.indexOf(id));
      p.fade = THREE.MathUtils.lerp(p.fade ?? 1, fading && id !== 'nucleus' ? 0 : 1, Math.min(1, dt * 2.5));
      for (const m of p.materials) if (m.uniforms) m.uniforms.strength.value = (m.userData.base ?? 1) * k * p.fade;
      for (const o of p.objects) o.visible = p.fade > 0.02;
    }
  }

  controls.update();
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
});





