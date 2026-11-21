import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCell } from './cellmodel.js';
import { createNucleus, ORI } from './nucleus.js';
import { loadModel } from './organelles.js';
import { createMolecule } from './transcription-preview-molecule.js';
import { createTranscriptionInspector } from './transcription-inspector.js';
import { createElongation } from './transcription-elongation.js';
import { createTermination } from './transcription-termination.js';
import { createOlympiadInitiation } from './transcription-initiation-olymp.js';

const stage = document.getElementById('stage');
const where = document.getElementById('where');
const instruction = document.getElementById('instruction');
const description = document.getElementById('description');
const actions = document.getElementById('actions');
const geneMap = document.getElementById('gene-map');
const spotsLayer = document.getElementById('spots');
const veil = document.getElementById('veil');
const glowButton = document.getElementById('glow');
const movieControls = document.getElementById('movie-controls');
const movieProgress = document.getElementById('movie-progress');
const movieToggle = document.getElementById('movie-toggle');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.06, 145);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minPolarAngle = 0.76;
controls.maxPolarAngle = 2.25;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.27, 0.36, 0.87));
composer.addPass(new OutputPass());

const params = new URLSearchParams(location.search);
const olymp = window.Level.isOlymp();
const speed = THREE.MathUtils.clamp(Number(params.get('speed')) || 1, 0.4, 12);
const canGlow = renderer.extensions.has('EXT_color_buffer_float');
let useGlow = canGlow && params.get('bloom') !== '0';
let probe = null;
let cell, nucleus, molecule, cellPickables, film, ending;
let afterFilm;
let phase = 'loading', active, playing, selected, index, count;
let spots = [];
const place = new THREE.Vector3();
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const inspector = createTranscriptionInspector({ scene, camera, controls, fit, frame, animate, canOpen: () => !playing });
inspector.magnifier.onclick = () => {
  const duringFilm = phase === 'film';
  if (duringFilm) pauseFilm();
  inspector.open(active, false, duringFilm || phase === 'film-question' || phase === 'film-review' || phase === 'termination');
};
document.getElementById('part-return').onclick = inspector.close;
const partForSpot = {
  nucleus: 'nucleus', chromatin: 'chromatin', nucleolus: 'nucleolus', factors: 'factors',
  promoter: 'promoter', 'coding-area': 'gene', polymerase: 'pol', complex: 'factors', gene: 'gene',
  'start-site': 'start', 'position-one': 'start', 'far-site': 'gene', 'upper-strand': 'other', template: 'template',
  'rna-slot': 'active', 'other-strand': 'other', 'move-polymerase': 'pol',
  'shift-ahead': 'template', 'shift-back': 'template',
};

function tell(title, copy, kind = '') {
  instruction.textContent = title;
  description.textContent = copy;
  description.dataset.kind = kind;
}

function goal(id, label, at, onClick, object = null) { return { id, label, at, onClick, object }; }
function site(id, label, point, offset, onClick) {
  const at = () => (typeof point === 'function' ? point() : point.clone()).add(offset);
  return { ...goal(id, label, at, onClick), point };
}

function tapSpot(item) {
  const id = partForSpot[item.id] || (item.id.startsWith('base-') ? 'nucleotide' : null);
  if (id) {
    const at = item.object ? () => item.object.getWorldPosition(new THREE.Vector3()) : item.point || item.at;
    inspector.explain(id, at);
  }
  item.onClick();
}

function setSpots(list = []) {
  spots = list.map(item => {
    const button = document.createElement('button');
    button.className = 'spot';
    button.type = 'button';
    button.dataset.object = item.id;
    button.textContent = item.label;
    if (item.id.startsWith('base-')) button.setAttribute('aria-pressed', 'false');
    button.onclick = () => tapSpot(item);
    const marker = item.point ? document.createElement('span') : null;
    if (marker) { marker.className = 'socket'; marker.setAttribute('aria-hidden', 'true'); }
    return { ...item, button, marker };
  });
  spotsLayer.replaceChildren(...spots.flatMap(({ button, marker }) => marker ? [marker, button] : [button]));
  positionSpots();
}

function positionSpots() {
  for (const { at, button, point, marker } of spots) {
    place.copy(typeof at === 'function' ? at() : at).project(camera);
    button.hidden = place.z < -1 || place.z > 1 || Math.abs(place.x) > 0.99 || Math.abs(place.y) > 0.99;
    button.style.left = `${THREE.MathUtils.clamp((1 + place.x) * 50, 7, 93)}%`;
    button.style.top = `${THREE.MathUtils.clamp((1 - place.y) * 50, 5, 95)}%`;
    if (marker) {
      place.copy(typeof point === 'function' ? point() : point).project(camera);
      marker.hidden = place.z < -1 || place.z > 1;
      marker.style.left = `${(1 + place.x) * 50}%`;
      marker.style.top = `${(1 - place.y) * 50}%`;
    }
  }
}

function setAction(text, action) {
  setActions(text ? [text, action] : null);
}

function setActions(...items) {
  actions.replaceChildren(...items.filter(Boolean).map(([text, action, pressed]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.onclick = action;
    if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
    return button;
  }));
}

function updateGlow() {
  glowButton.hidden = !canGlow;
  glowButton.setAttribute('aria-pressed', String(useGlow));
  glowButton.textContent = useGlow ? '✦' : '✧';
}
glowButton.onclick = () => { useGlow = !useGlow; probe = null; updateGlow(); };
updateGlow();

function fit(width, height, margin = 1.15) {
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  return Math.max(width / camera.aspect, height) * margin / (2 * Math.tan(halfFov));
}

function frame(target, position, minDistance, maxDistance) {
  controls.target.copy(target);
  camera.position.copy(position);
  controls.minDistance = minDistance;
  controls.maxDistance = maxDistance;
  controls.update();
  camera.updateMatrixWorld();
}

const vector = (x, y, z) => new THREE.Vector3(x, y, z);

function show(group, title, color, fog = 0) {
  active?.removeFromParent();
  active = group;
  scene.add(group);
  where.textContent = title;
  scene.background = new THREE.Color(color);
  scene.fog = fog ? new THREE.FogExp2(color, fog) : null;
  probe = { delay: 2, elapsed: 0, frames: 0 };
}

function animate(duration, draw) {
  if (playing) throw new Error('Animation already running');
  return new Promise(resolve => { playing = { duration, draw, resolve, time: 0 }; });
}

async function switchView(target, near, change) {
  controls.enabled = false;
  const previous = camera.position.clone();
  const center = controls.target.clone();
  const end = target.clone().add(near);
  await animate(1.05, (k, t) => {
    camera.position.lerpVectors(previous, end, k);
    controls.target.lerpVectors(center, target, k);
    veil.style.opacity = String(Math.max(0, (t - 0.68) / 0.32));
  });
  change();
  await animate(0.48, k => { veil.style.opacity = String(1 - k); });
  controls.enabled = true;
}

function startCell() {
  ending?.reset();
  setFilmControls(false);
  geneMap.hidden = true;
  inspector.clear();
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  phase = 'cell';
  show(cell.group, 'Животная клетка', 0x040710);
  const distance = fit(9, 6.1, 1.03);
  frame(vector(0, 0, 0), vector(0.4, 2.9, distance), distance * 0.48, distance * 1.5);
  setSpots();
  setAction('Подсказка', () => {
    const organelle = cell.parts.nucleus.objects[0];
    setSpots([goal('nucleus', 'Ядро', () => organelle.position.clone().add(vector(0, 0.7, 1.45)), openNucleus)]);
    tell('Найди ядро в клетке', 'Ищи крупный органоид с оболочкой. Внутри него находится ДНК хромосом.');
  });
  tell('Где начнётся транскрипция?', 'Транскрипция — это синтез РНК по одной из цепей ДНК. Начнём с поиска ДНК хромосом. Поверни клетку и нажми на органоид, в котором она хранится.');
}

async function openNucleus() {
  if (phase !== 'cell') return;
  phase = 'transition';
  setSpots();
  setAction();
  const target = cell.parts.nucleus.objects[0].position.clone();
  tell('Приближаемся к ядру', 'В ядре этот ген находится на одной из молекул ДНК в составе хроматина.');
  await switchView(target, vector(0.3, 0.2, 1.65), () => {
    show(nucleus.group, 'Ядро · хроматин', 0x05071a, 0.15);
    const z = camera.aspect < 0.9 ? 3.9 : 3.1;
    frame(vector(0.12, 0, 0), vector(0.62, 0.40, z), 1.2, 4.4);
  });
  phase = 'nucleus';
  inspector.explain('chromatin', ORI);
  tell('Найди доступный участок ДНК', 'Участок подсвечен между нуклеосомами. Здесь удобно рассмотреть место, где соберётся комплекс.');
  setAction('Подсказка', () => setSpots([
    goal('chromatin', 'Доступная ДНК', ORI.clone().add(vector(0, 0.33, 0.22)), openDNA),
    goal('nucleolus', 'Ядрышко', () => nucleus.nucleolus.position, wrongChromatin),
  ]));
}

function wrongChromatin(object = nucleus.nucleolus) {
  if (object === nucleus.nucleolus) inspector.explain('nucleolus', () => nucleus.nucleolus.position.clone());
  else inspector.explain('chromatin', ORI);
  tell('Поищи саму нить ДНК', 'Рядом с нуклеосомами виден свободный от гистонов участок. Нажми на светящийся отрезок.', 'error');
}

async function openDNA() {
  if (phase !== 'nucleus') return;
  phase = 'transition';
  setSpots();
  setAction();
  tell('Входим в крупный план ДНК', 'Сейчас можно увидеть две цепи и участок, с которого начинается сборка комплекса.');
  await switchView(ORI, vector(0.16, 0.13, 0.37), () => {
    molecule.reset();
    show(molecule.group, 'ДНК · инициация', 0x050914, 0.014);
    const target = vector(0, -0.82, 0);
    const distance = fit(7.5, 5.5, 1.06);
    frame(target, vector(0, -0.46, distance), distance * 0.65, distance * 1.35);
    controls.minAzimuthAngle = -0.55;
    controls.maxAzimuthAngle = 0.55;
  });
  introducePromoter();
}

const explainSpot = () => {};
function startMarker(onClick = explainSpot) {
  return site('position-one', '+1', molecule.startSite, vector(0, 0.79, 0.28), onClick);
}

function introducePromoter() {
  phase = 'introduction';
  inspector.explain('dna', molecule.startSite);
  tell('Найди площадку старта', 'Чтобы переписать нужный участок ДНК в РНК, клетка сначала находит промотор. Нажми на его метку.');
  setSpots([site('promoter', 'Промотор', molecule.promoter, vector(0, 0.52, 0), introduceStart)]);
}

function introduceStart() {
  tell('Промотор помогает найти точку начала', 'Промотор — последовательность нуклеотидов, то есть звеньев ДНК, у которой собираются белки перед началом синтеза. Нажми на +1, чтобы узнать, с какого места начнётся запись.');
  setSpots([startMarker(introduceEnd)]);
}

function introduceEnd() {
  tell('Где работа закончится?', 'В крупном плане показано только начало. Нажми «Терминатор» на схеме, чтобы узнать, что произойдёт дальше.');
  geneMap.hidden = false;
  setSpots();
}

geneMap.addEventListener('click', event => {
  const topic = event.target.closest('button')?.dataset.topic;
  if (topic === 'promoter') {
    inspector.explain(topic, molecule.promoter);
    setSpots([site('promoter', 'Промотор', molecule.promoter, vector(0, 0.52, 0), explainSpot)]);
  } else if (topic === 'start') {
    inspector.explain(topic, molecule.startSite);
    setSpots([startMarker()]);
  } else if (topic === 'terminator') {
    inspector.explain(topic);
    setSpots();
    tell('Терминатор находится дальше по ходу полимеразы', 'В этом эпизоде соберём белки у промотора и запустим синтез РНК.');
    setAction('Познакомиться с белками', introduceProteins);
  }
});

function introduceProteins() {
  geneMap.hidden = true;
  molecule.factors.visible = true;
  molecule.polymerase.visible = true;
  inspector.explain('factors', molecule.factorStart);
  tell('Кто запускает транскрипцию?', 'Факторы транскрипции — белки-помощники. Они распознают промотор и помогают разместить РНК-полимеразу II. Полимераза — фермент, который читает ДНК и соединяет звенья в РНК. Нажми на белки, чтобы рассмотреть их.');
  setSpots([
    goal('factors', 'Факторы', molecule.factorStart.clone().add(vector(0, -0.44, 0.15)), explainSpot, molecule.factors),
    goal('polymerase', 'Полимераза II', molecule.polStart.clone().add(vector(0, -0.61, 0.48)), explainSpot, molecule.polymerase),
    startMarker(),
  ]);
  setAction('Начать сборку', startAssembly);
}

function startAssembly() {
  molecule.reset();
  index = molecule.START;
  count = 0;
  selected = null;
  phase = 'factor';
  molecule.factors.visible = true;
  inspector.explain('dna', molecule.startSite);
  tell('Возьми факторы транскрипции', 'Эти белки помогают собрать комплекс у промотора. Нажми на золотистую группу в сцене.');
  setAction();
  setSpots([goal('factors', 'Факторы', molecule.factorStart.clone().add(vector(0, -0.44, 0.15)), chooseFactor, molecule.factors), startMarker()]);
}

function chooseFactor() {
  phase = 'factor-target';
  tell('Куда поставить факторы?', 'Промотор — участок ДНК, возле которого начинается сборка транскрипционного комплекса.');
  setSpots([
    site('promoter', 'Промотор', molecule.promoter, vector(0, 0.52, 0), attachFactors),
    site('coding-area', 'Внутри гена', molecule.downstream, vector(0, 0.49, 0), () =>
      tell('Поищи участок сборки', 'Копирование пойдёт внутрь гена. Для сборки комплекса нужен промотор.', 'error')),
    startMarker(),
  ]);
}

async function attachFactors() {
  phase = 'motion';
  setSpots();
  tell('Факторы занимают промотор', 'Золотистые белки удерживаются у начала гена и помогают правильно расположить фермент.');
  const { factors, factorStart, factorEnd } = molecule;
  await animate(1.15, k => { factors.position.lerpVectors(factorStart, factorEnd, k); });
  phase = 'polymerase';
  molecule.polymerase.visible = true;
  tell('Возьми РНК-полимеразу II', 'Факторы закрепились у промотора. Выбери коралловый фермент, который будет считывать ДНК.');
  setSpots([goal('polymerase', 'Полимераза II', molecule.polStart.clone().add(vector(0, -0.61, 0.48)), choosePolymerase, molecule.polymerase), startMarker()]);
}

function choosePolymerase() {
  phase = 'pol-target';
  tell('Куда поставить полимеразу?', 'Найди белки, уже собравшиеся у промотора. Вместе с ними полимераза образует комплекс.');
  setSpots([
    goal('complex', 'К факторам', molecule.factorEnd.clone().add(molecule.factorLift), attachPolymerase, molecule.factors),
    goal('gene', 'На участок гена', molecule.downstream.clone().add(vector(0, 0.48, 0)), () =>
      tell('Нужна площадка для сборки', 'Полимераза II собирается с факторами около промотора.', 'error')),
    startMarker(),
  ]);
}

async function attachPolymerase() {
  phase = 'motion';
  setSpots();
  tell('Комплекс собирается на ДНК', 'Полимераза подходит к факторам и занимает положение у точки начала синтеза.');
  await animate(1.4, k => {
    molecule.polymerase.position.lerpVectors(molecule.polStart, molecule.polEnd, k);
    molecule.polymerase.rotation.y = -0.35 * (1 - k);
    molecule.layout(0, molecule.START, molecule.START, k);
  });
  phase = 'open';
  inspector.explain('bubble', molecule.startSite);
  tell('Какой участок ДНК раскроется?', 'Комплекс собран. Найди область у +1 — позиции первого нуклеотида будущей РНК.');
  setAction('Как раскрывается ДНК', inspectOpening);
  setSpots([
    site('start-site', 'У точки +1', molecule.startSite, vector(0, 0.42, 0.22), openBubble),
    site('far-site', 'Дальше по гену', molecule.downstream, vector(0, 0.47, 0), () =>
      tell('Вернись к точке начала синтеза', 'Комплекс сначала раскрывает небольшой участок ДНК в области старта.', 'error')),
  ]);
}

function inspectOpening() {
  inspector.explain('bubble', molecule.startSite);
  inspector.open(active, true);
}

async function openBubble() {
  phase = 'motion';
  setSpots();
  setAction();
  tell('Две цепи локально расходятся', 'XPB помогает открыть участок около +1. Здесь размыкаются пары оснований, а остовы обеих цепей остаются целыми.');
  controls.enabled = false;
  const from = camera.position.clone(), oldTarget = controls.target.clone();
  const target = vector(molecule.center(index) + 0.38, -0.50, 0);
  const z = fit(4.75, 4.90);
  const end = vector(target.x, target.y + 0.42, z);
  controls.minDistance = z * 0.67;
  await animate(2, k => {
    molecule.layout(k, index);
    camera.position.lerpVectors(from, end, k);
    controls.target.lerpVectors(oldTarget, target, k);
  });
  controls.enabled = true;
  phase = 'strand';
  inspector.explain('bubble', molecule.startSite);
  setAction('Как раскрывается ДНК', inspectOpening);
  tell('Какую цепь подать в полимеразу?', 'Цепи разошлись в области старта. По матричной цепи фермент пойдёт от 3′ к 5′.');
  setSpots([
    site('upper-strand', 'Верхняя цепь', () => molecule.strand(0, index + 1), vector(0, 0.43, 0), () =>
      tell('Верхняя цепь здесь нематричная', 'По стрелке верхняя цепь идёт 5′ → 3′. Матричная должна идти 3′ → 5′, потому что полимераза добавляет новые звенья к 3′-концу РНК и растит её 5′ → 3′. Сравни концы нижней цепи.', 'error')),
    site('template', 'Нижняя цепь', () => molecule.strand(1, index + 1), vector(0, -0.48, 0), chooseTemplate),
  ]);
}

async function chooseTemplate() {
  phase = 'motion';
  setSpots();
  setAction();
  molecule.highlightTemplate();
  tell('Матричная цепь в активном центре', 'По стрелке нижняя цепь идёт 3′ → 5′. Это позволяет полимеразе строить комплементарную РНК 5′ → 3′.');
  await animate(0.85, k => molecule.layout(1 + 0.05 * Math.sin(Math.PI * k), index));
  chooseNucleotide();
}

function chooseNucleotide() {
  phase = 'nucleotide';
  selected = null;
  molecule.setCandidates(index);
  const base = molecule.templateBase(index);
  const detail = count === 1
    ? `Первый нуклеотид занял позицию +1. Выбери второй напротив ${base}. Полимераза соединит эти два звена.`
    : `В активном центре на матричной ДНК сейчас ${base}. Выбери нуклеотид, который образует с ним пару.`;
  tell(`Подбери нуклеотид для позиции +${count + 1}`, detail);
  if (count === 0) inspector.explain('pairing');
  setSpots(nucleotideOptions());
  setAction('Как подобрать пару?', () =>
    inspector.explain('pairing'));
}

function nucleotideOptions() {
  return molecule.candidates.map(nt => goal(`base-${nt.userData.base}`, nt.userData.base,
    () => nt.position.clone().add(vector(0, -0.28, 0.21)), () => chooseNucleotideSite(nt), nt));
}

function chooseNucleotideSite(nucleotide) {
  const needsTargets = phase !== 'rna-target';
  phase = 'rna-target';
  selected?.scale.setScalar(1);
  selected = nucleotide;
  nucleotide.scale.setScalar(1.24);
  tell(`Куда поставить ${nucleotide.userData.base}?`, 'Найди место напротив открытого основания матричной ДНК внутри полимеразы.');
  if (needsTargets) {
    const hadFocus = spotsLayer.contains(document.activeElement);
    setSpots([
      ...nucleotideOptions(),
      site('rna-slot', 'Активный центр', () => molecule.rnaSite(index), vector(0, -0.39, 0), attachNucleotide),
      site('other-strand', 'Верхняя цепь', () => molecule.strand(0, index), vector(0, 0.43, 0), () =>
        tell('Этот участок вне активного центра', 'Полимераза синтезирует РНК по нижней, матричной цепи.', 'error')),
    ]);
    if (hadFocus) spots.find(item => item.object === selected)?.button.focus({preventScroll: true});
  }
  for (const item of spots) {
    if (item.object) item.button.setAttribute('aria-pressed', String(item.object === selected));
  }
}

async function attachNucleotide() {
  const base = selected.userData.base;
  if (base !== molecule.expected(index)) {
    tell('Основания не образуют пару', `На матрице сейчас ${molecule.templateBase(index)}. Нажми на другой нуклеотид и попробуй снова.`, 'error');
    return;
  }
  phase = 'motion';
  setSpots();
  setAction();
  for (const nucleotide of molecule.candidates) nucleotide.visible = nucleotide === selected;
  const origin = selected.position.clone();
  const titles = ['Первый нуклеотид на месте', 'Появляется первая связь в РНК', 'РНК становится длиннее'];
  const details = [
    `У точки +1 нуклеотид ${base} подходит к основанию ${molecule.templateBase(index)} на матричной цепи.`,
    'Два нуклеотида заняли соседние позиции. Полимераза соединяет их в начало цепочки РНК.',
    'Новый нуклеотид подходит к матрице и соединяется с 3′-концом растущей РНК.',
  ];
  const addition = Math.min(count, titles.length - 1);
  tell(titles[addition], details[addition]);
  await animate(1.25, k => molecule.attachPreview(selected, origin, index, k));
  selected.visible = false;
  count++;
  molecule.grow(count);
  if (count === 1) {
    index++;
    molecule.layout(1, molecule.START, index);
    return chooseNucleotide();
  }
  if (count === molecule.practiceLength) return review();
  phase = 'shift';
  setSpots([goal('move-polymerase', 'Сдвинуть фермент', () => molecule.polymerase.position.clone().add(vector(0.41, -1.10, 0.78)), chooseShift, molecule.polymerase)]);
  tell('Пора сдвинуть полимеразу', count === 2
    ? 'Первые два нуклеотида соединены. Теперь перемести фермент дальше по матрице.'
    : 'Полимераза добавила новое звено к 3′-концу РНК. Передвинь её на следующее основание матрицы.');
}

function chooseShift() {
  phase = 'shift-target';
  tell('Куда передвинуть полимеразу?', 'Посмотри на стрелку. Выбери следующее, соседнее основание матричной цепи.');
  setSpots([
    site('shift-ahead', 'Вперёд', () => molecule.strand(1, index + 1), vector(0, -0.53, 0), moveForward),
    site('shift-back', 'Назад', () => molecule.strand(1, index - 1), vector(0, -0.53, 0), () =>
      tell('Посмотри на стрелку движения', 'В этой сцене полимераза читает матричную цепь слева направо, от 3′ к 5′.', 'error')),
  ]);
}

async function moveForward() {
  phase = 'motion';
  setSpots();
  tell('Полимераза смещается на одну позицию', 'Раскрытый участок движется вместе с ферментом, а цепи ДНК позади снова сближаются.');
  const x = molecule.polymerase.position.x;
  const shift = molecule.center(index + 1) - molecule.center(index);
  const viewX = camera.position.x;
  const targetX = controls.target.x;
  const bubbleCenter = molecule.opening.cursor;
  controls.enabled = false;
  await animate(1.55, k => {
    molecule.polymerase.position.x = x + shift * k;
    molecule.layout(1, bubbleCenter + k, index + k);
    molecule.grow(count);
    camera.position.x = viewX + shift * k;
    controls.target.x = targetX + shift * k;
  });
  controls.enabled = true;
  index++;
  chooseNucleotide();
}

async function review() {
  phase = 'review';
  inspector.explain('rna', () => molecule.rnaSite(index));
  tell('Ты собрал начало РНК', `Получилась цепочка 5′–${molecule.practiceSequence}–3′. Промотор помог определить точку +1. Полимераза читала ДНК 3′ → 5′ и достраивала РНК 5′ → 3′. Дальше она продолжит работу до области завершения.`);
  const bounds = molecule.frameTranscript();
  const size = bounds.getSize(vector());
  const target = bounds.getCenter(vector());
  const distance = fit(size.x, size.y, 1.18) + size.z * 0.72;
  const from = camera.position.clone(), center = controls.target.clone();
  const end = target.clone().add(vector(0, 0.38, distance));
  controls.enabled = false;
  controls.maxDistance = Math.max(controls.maxDistance, distance * 1.4);
  await animate(1.1, k => {
    camera.position.lerpVectors(from, end, k);
    controls.target.lerpVectors(center, target, k);
  });
  controls.enabled = true;
  setActions(['Продолжить транскрипцию', () => playFilm()], ['Пройти заново', startCell]);
}

function setFilmControls(show) {
  movieControls.hidden = !show;
  document.body.classList.toggle('showing-film', show);
  const label = show ? 'Подробнее' : 'Рассмотреть в 3D';
  inspector.magnifier.setAttribute('aria-label', label);
  inspector.magnifier.title = label;
}

function playFilm(shot, onEnd = null) {
  phase = 'film';
  afterFilm = onEnd;
  where.textContent = 'ДНК · элонгация';
  setSpots();
  setAction();
  setFilmControls(true);
  tell('Удлинение РНК', 'Поставь ролик на паузу, чтобы повернуть модель и рассмотреть детали.');
  scene.fog.density = 0.0045;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  movieToggle.textContent = 'Пауза';
  film.start(shot, shot);
  movieProgress.value = 0;
}

function pauseFilm() {
  film.pause();
  movieToggle.textContent = 'Продолжить';
}

movieToggle.onclick = () => {
  if (film.running) pauseFilm();
  else {
    film.resume();
    movieToggle.textContent = 'Пауза';
  }
};
document.getElementById('movie-restart').onclick = () => playFilm();

function filmShot(id, at) {
  inspector.explain(id, at);
  if (id === 'film-exit') tell('Общий план · воспроизведение ускоряется', 'Проследи, как фуксиевая цепь РНК становится длиннее по мере движения полимеразы.');
}

function endFilm() {
  if (afterFilm) {
    const onEnd = afterFilm;
    afterFilm = null;
    onEnd();
    return;
  }
  phase = 'film-review';
  setFilmControls(false);
  tell('РНК выросла в длинную цепь', 'Видны уже переписанный участок и полимераза у растущего конца. Следующий этап урока покажет, как транскрипция завершается.');
  setActions(['К терминации', openTermination], ['Проверить себя', () => showQuestion(0)], ['Повторить ролик', () => playFilm()]);
}

function showQuestion(number) {
  phase = 'film-question';
  setFilmControls(false);
  inspector.clear();
  const ends = number === 0;
  if (!ends) {
    molecule.elongate(molecule.movieLength, 0.1);
    const center = molecule.filmLandmark('active').add(vector(0, 0.43, 0));
    const distance = fit(5.5, 3, 1.14);
    frame(center, center.clone().add(vector(0, 0.36, distance)), 0.8, distance * 2);
  } else {
    const bounds = molecule.frameTranscript();
    const size = bounds.getSize(vector());
    const center = bounds.getCenter(vector());
    const distance = fit(size.x, size.y, 1.08) + size.z * 0.46;
    frame(center, center.clone().add(vector(0, 0.31, distance)), 0.8, distance * 2);
  }
  molecule.setFilmEndLabels(false);
  tell(ends ? 'Куда добавится следующее звено?' : 'Где ДНК сомкнётся после сдвига?',
    ends ? 'Нажми на один из концов цепочки РНК.' : 'Выбери участок, где цепи снова образуют двойную спираль.');
  setAction();
  const cursor = Math.round(molecule.opening.cursor);
  const targets = ends
    ? [['Конец слева', () => molecule.rnaEnd(true), false], ['Конец справа', () => molecule.rnaEnd(false), true]]
    : [['Участок А', () => molecule.strand(1, cursor - 3), true], ['Участок Б', () => molecule.strand(1, cursor + 4), false]];
  setSpots(targets.map(([label, point, correct], i) =>
    site(`film-choice-${i}`, label, point, vector(0, ends ? -0.72 : 0.72, 0.28), () => answerQuestion(number, correct))));
}

function answerQuestion(number, correct) {
  const ends = number === 0;
  const replay = () => playFilm(ends ? 2 : 1, () => {
    showQuestion(number);
    if (correct) answerQuestion(number, true);
  });
  if (!correct) {
    tell('Попробуй ещё раз', ends
      ? 'Начало цепочки уже вышло из фермента. Посмотри, какой конец остался у активного центра.'
      : 'Посмотри, куда движется полимераза. Где цепи уже прошли через фермент?', 'error');
    setAction('Посмотреть момент', replay);
    return;
  }
  setSpots();
  tell(ends ? 'Да, это 3′-конец РНК' : 'Да, ДНК смыкается позади фермента',
    ends ? 'Активный центр удлиняет цепь с этой стороны. Свободный 5′-конец выходит первым.'
      : 'Впереди цепи расходятся, чтобы полимераза прочитала матричную ДНК. Позади они снова образуют пары.');
  setActions(['Посмотреть момент', replay],
    ends ? ['Следующий вопрос', () => showQuestion(1)] : ['К терминации', openTermination]);
}

async function openTermination() {
  phase = 'termination-loading';
  setActions();
  setSpots();
  where.textContent = 'ДНК · терминация';
  tell('Подходим к области завершения', 'Готовим 3D-модели белков, которые помогают сформировать конец РНК.');
  try {
    ending ??= createTermination({
      molecule, asset: await loadModel('transcription-termination'), camera, controls, fit, frame, animate,
      inspector, tell, setSpots, setActions, goal, site, restartLesson: startCell,
      onComplete: () => window.Progress.markDone('transcr'),
    });
    phase = 'termination';
    ending.start();
  } catch (error) {
    tell('Сцена терминации пока недоступна', 'Попробуй открыть эпизод ещё раз.', 'error');
    setActions(['Открыть снова', openTermination], ['К началу урока', startCell]);
    console.error(error);
  }
}

let down, touchCount = 0;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', event => {
  touchCount++;
  down = touchCount === 1 ? [event.clientX, event.clientY] : null;
});
canvas.addEventListener('pointercancel', () => { touchCount = Math.max(0, touchCount - 1); down = null; });
canvas.addEventListener('pointerup', event => {
  touchCount = Math.max(0, touchCount - 1);
  const previous = down;
  down = null;
  if (!previous || Math.hypot(event.clientX - previous[0], event.clientY - previous[1]) > 8) return;
  const box = canvas.getBoundingClientRect();
  pointer.set((event.clientX - box.left) / box.width * 2 - 1, 1 - (event.clientY - box.top) / box.height * 2);
  ray.setFromCamera(pointer, camera);
  if (inspector.active) { inspector.pick(ray); return; }
  if (playing || (phase === 'film' && film.running)) return;
  if (phase !== 'cell' && phase !== 'nucleus') {
    let nearest = 19;
    let destination;
    for (const item of spots) {
      if (item.object && ray.intersectObject(item.object, true).length) { tapSpot(item); return; }
      if (item.point) {
        place.copy(typeof item.point === 'function' ? item.point() : item.point).project(camera);
        const distance = Math.hypot((place.x - pointer.x) * box.width / 2, (place.y - pointer.y) * box.height / 2);
        if (distance < nearest) { nearest = distance; destination = item; }
      }
    }
    if (destination) { tapSpot(destination); return; }
    if (phase === 'termination' && ending.inspect(ray)) return;
    if (active === molecule?.group) {
      const part = molecule.inspect(ray, molecule.opening.value > 0.7 && phase !== 'strand');
      if (part) inspector.explain(part.id, part.at);
    }
    return;
  }
  if (phase === 'cell') {
    const hits = ray.intersectObjects(cellPickables, false);
    const hit = hits.find(({ object }) => !['er', 'cytoskeleton', 'membrane'].includes(object.userData.id));
    if (hit?.object.userData.id === 'nucleus') {
      inspector.explain('nucleus', () => cell.parts.nucleus.objects[0].position.clone());
      return openNucleus();
    }
    if (hit) tell('Поищи ядро', 'Этот ген находится на хромосоме. Вращай клетку и найди органоид, который хранит хромосомы.', 'error');
    return;
  }
  const hit = ray.intersectObjects([nucleus.ori, nucleus.halo, ...nucleus.open, ...nucleus.closed, nucleus.nucleolus], false)[0];
  if (hit?.object === nucleus.ori || hit?.object === nucleus.halo) openDNA();
  else if (hit) wrongChromatin(hit.object);
});

new ResizeObserver(() => {
  const { clientWidth: w, clientHeight: h } = stage;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = `${w}px`;
  renderer.domElement.style.height = `${h}px`;
  composer.setSize(w, h);
}).observe(stage);

let previousTime;
renderer.setAnimationLoop(timestamp => {
  const dt = previousTime === undefined ? 0 : Math.min(0.12, (timestamp - previousTime) / 1000);
  previousTime = timestamp;
  if (playing) {
    playing.time += dt * speed;
    const t = Math.min(1, playing.time / playing.duration);
    playing.draw(t * t * (3 - 2 * t), t);
    if (t === 1) { const { resolve } = playing; playing = null; resolve(); }
  }
  if (phase === 'film' && film.running) {
    film.tick(dt * speed);
    movieProgress.value = film.progress;
  }
  const t = timestamp / 1000;
  if (cell && active === cell.group) cell.update(t);
  if (nucleus && active === nucleus.group) nucleus.update(t);
  if (molecule && active === molecule.group) molecule.dust.update(t);
  controls.update();
  camera.updateMatrixWorld();
  positionSpots();
  if (probe && useGlow) {
    if (probe.delay > 0) probe.delay -= dt;
    else {
      probe.frames++;
      probe.elapsed += dt;
      if (probe.elapsed > 3) {
        if (probe.frames / probe.elapsed < 30) { useGlow = false; updateGlow(); }
        probe = null;
      }
    }
  }
  if (useGlow) composer.render();
  else renderer.render(scene, camera);
});

if (olymp) tell('Загружаем инициацию…', 'Подготавливаем ДНК и комплекс белков.');
Promise.all([olymp ? null : createCell(), loadModel('pol2-preview')]).then(([animalCell, pol]) => {
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
  molecule = createMolecule(pol, { showDirections: !olymp });
  if (olymp) {
    phase = 'olymp-initiation';
    show(molecule.group, 'Олимпиадный · инициация', 0x060a15);
    createOlympiadInitiation({ molecule, inspector, controls, fit, frame, animate, tell, setActions, setSpots,
      site, inspectOpening }).start();
    return;
  }
  cell = animalCell;
  cellPickables = [];
  cell.group.traverse(obj => { if (obj.isMesh && obj.userData.id) cellPickables.push(obj); });
  nucleus = createNucleus();
  film = createElongation({ molecule, camera, controls, fit, frame, onShot: filmShot, onFinished: endFilm });
  startCell();
}).catch(error => {
  tell('Сцена не загрузилась', 'Открой страницу через локальный сервер приложения и попробуй снова.', 'error');
  setAction('Повторить', () => location.reload());
  console.error(error);
});
