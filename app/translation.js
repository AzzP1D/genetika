import { createSplicingScene } from './rna-splicing-scene.js';
import { EXPORT_FRAMES } from './rna-export-scene.js';
import { PROTEIN_DETAILS } from './rna-protein-details.js';
import { RNA_BASES, SPLICING_INTRONS, basesAfterSplicing } from './transcription-sequence.js';

const byId = id => document.getElementById(id);
if (new URLSearchParams(location.search).get('from') === 'map') {
  const back = byId('back');
  back.href = 'index.html';
  back.textContent = '← К карте';
}

const parts = {
  cap: [
    'Кэп на 5′-конце',
    'Кэп защищает начало мРНК. На модели он зелёный.',
    'Кэп добавился к 5′-концу, когда полимераза ещё достраивала РНК. После сплайсинга он остался на том же конце молекулы.',
  ],
  e1: [
    'Экзон 1',
    'Первый экзон начинается сразу за кэпом и соединён со вторым экзоном.',
    'До сплайсинга между первым и вторым экзонами был интрон. После его удаления конец первого экзона соединился с началом второго. Бирюзовая перемычка показывает этот стык.',
  ],
  e2: [
    'Экзон 2',
    'Средний экзон расположен между двумя бирюзовыми стыками.',
    'До сплайсинга по обе стороны второго экзона находились интроны. После их удаления он оказался между первым и третьим экзонами в одной непрерывной цепи.',
  ],
  e3: [
    'Экзон 3',
    'Последний экзон идёт от второго стыка до поли(А)-хвоста.',
    'Когда второй интрон отделился, левый край третьего экзона соединился со вторым. Другой край третьего экзона находится у 3′-конца мРНК.',
  ],
  tail: [
    'Поли(А)-хвост на 3′-конце',
    'Голубые звенья А добавлены к концу РНК.',
    'После разреза клетка добавила к новому 3′-концу цепочку из аденозинов. С этим хвостом связываются белки, которые помогают мРНК сохраняться.',
  ],
};
const completed = SPLICING_INTRONS.length;
const matureBases = basesAfterSplicing(completed);
const partButtons = [...byId('parts').querySelectorAll('button')];
const endButtons = [...byId('markers').querySelectorAll('button')];
const exportMarkers = [...byId('export-markers').children];
const stage = byId('stage');
const selection = byId('selection');
const details = byId('details');
const toggle = byId('details-toggle');
const timeline = byId('timeline');
const duration = EXPORT_FRAMES.at(-1);
const progressKey = 'gen-translation-export';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const introCopy = ['note-title', 'note', 'detail-copy'].map(id => byId(id).textContent);
const introSummary = [byId('scene-title').textContent, byId('scene-copy').textContent];
const exportSummary = [
  'Выход мРНК из ядра',
  'Та же зрелая мРНК пройдёт из ядра через ядерную пору в цитоплазму.',
];
const arrived = 'Та же зрелая мРНК прошла через ядерную пору и теперь находится в цитоплазме.';
const membraneExplanation = 'Ядерная оболочка состоит из двух мембран. В месте поры они соединяются, а белковый комплекс образует проход между ядром и цитоплазмой.';
const frames = [
  ['До поры', 'Транспортный фактор уже связан с мРНК.', 'Белки, связанные со зрелой мРНК в ядре, помогают ей подготовиться к выходу. Золотистая модель показывает часть транспортного фактора NXF1–NXT1.'],
  ['У входа в пору', 'Комплекс мРНК и белков подходит к поре со стороны ядра.', 'Транспортный фактор взаимодействует с белками ядерной поры и помогает мРНК пройти через неё.'],
  ['В поре', 'Часть цепи уже снаружи, а часть ещё в ядре.', 'Следи за кэпом и голубым поли(А)-хвостом. В учебном разрезе цепь вытянута, чтобы её части были видны. В клетке мРНК проходит через пору в комплексе с белками.'],
  ['На стороне цитоплазмы', 'Цепь вышла целиком. Транспортный фактор начинает отделяться.', 'На внешней стороне поры дополнительные белки, в том числе DDX19, помогают снять транспортный фактор с мРНК.'],
  ['мРНК вышла', 'Кэп, три экзона и поли(А)-хвост теперь в цитоплазме.', 'Транспортный фактор отделился от мРНК. Та же цепь теперь находится в цитоплазме, где работают рибосомы.'],
];

function loadCheckpoint() {
  const stages = ['find', 'ready', 'watch', 'quiz', 'done'];
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey));
    if (stages.includes(saved?.phase)) return {
      phase: saved.phase,
      time: Number.isFinite(saved.time) ? Math.max(0, Math.min(duration, saved.time)) : 0,
    };
  } catch { /* resume is optional when storage is unavailable */ }
  return { phase: 'intro', time: 0 };
}

let { phase, time } = loadCheckpoint();
let scene;
let selectedPoint;
let hintShown = false;
let request;
let playing = false;
let lastUpdate;
let shownFrame = -1;
let savedHalfSecond = -1;
let playButton;
let checkButton;
let inspection;

function saveCheckpoint() {
  try {
    if (phase === 'intro') localStorage.removeItem(progressKey);
    else localStorage.setItem(progressKey, JSON.stringify({ phase, time }));
  } catch { /* the lesson remains available without storage */ }
}

function showNote(title, note, detail, error = false) {
  byId('note-title').textContent = title;
  const copy = byId('note');
  copy.textContent = note;
  copy.classList.toggle('feedback-error', error);
  byId('detail-copy').textContent = detail;
  details.scrollTop = 0;
}

function inspect(part, point = part) {
  showNote(...parts[part]);
  for (const button of partButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.part === part));
  }
  selectedPoint = point;
}

function placeMarker(marker, point, offset) {
  const at = scene.screenPoint(point);
  if (!at || at[0] < 0 || at[0] > stage.clientWidth || at[1] < 0 || at[1] > stage.clientHeight) {
    marker.hidden = true;
    return;
  }
  const [x, y] = at;
  marker.hidden = false;
  const half = marker.offsetWidth / 2;
  marker.style.left = `${Math.max(half, Math.min(stage.clientWidth - half, x))}px`;
  const height = marker.offsetHeight / 2;
  marker.style.top = `${Math.max(height, Math.min(stage.clientHeight - height, y + offset))}px`;
}

function updateMarkers() {
  if (inspection) {
    if (inspection.ready) {
      for (const marker of byId('specimen-markers').children) {
        placeMarker(marker, marker.dataset.mesh, Number(marker.dataset.offset));
      }
    }
    return;
  }
  if (phase === 'intro') {
    for (const button of endButtons) placeMarker(button, button.dataset.end, -25);
    if (selectedPoint !== undefined) placeMarker(selection, selectedPoint, 0);
    return;
  }
  for (const marker of exportMarkers) {
    const point = marker.dataset.point;
    if ((point === 'pore' && phase === 'find' && !hintShown) ||
        (point === 'factor' && (phase === 'find' || time >= duration)) ||
        (point === 'ddx19' && time < EXPORT_FRAMES[3]) ||
        (point === 'membranes' && phase !== 'ready' && phase !== 'find')) {
      marker.hidden = true;
      continue;
    }
    const offsets = { pore: 18, factor: -27, ddx19: -30 };
    placeMarker(marker, point, offsets[point] ?? 0);
  }
}

for (const button of partButtons) {
  const part = button.dataset.part;
  const bases = matureBases.filter(base => base.part === part);
  const index = bases[Math.floor(bases.length / 2)]?.index;
  button.onclick = () => inspect(part, index);
}
for (const button of endButtons) button.onclick = () => inspect(button.dataset.end);
for (const button of byId('export-markers').querySelectorAll('[data-select]')) {
  button.onclick = () => selectExportObject(button.dataset.select);
}
toggle.onclick = () => {
  details.hidden = !details.hidden;
  toggle.setAttribute('aria-expanded', String(!details.hidden));
  toggle.textContent = details.hidden ? 'Подробнее' : 'Свернуть';
};

function action(label, run, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.classList.toggle('primary', primary);
  button.onclick = run;
  return button;
}

function colorHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function populateSpecimen(specimen) {
  byId('specimen-title').textContent = specimen.title;
  byId('specimen-structure').textContent = specimen.structure;
  const source = byId('specimen-source');
  source.href = `https://www.rcsb.org/structure/${specimen.pdb}`;
  source.textContent = `RCSB PDB ${specimen.pdb}`;
  byId('specimen-functions').replaceChildren(...specimen.functions.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  byId('specimen-legend').replaceChildren(...specimen.parts.map(part => {
    const item = document.createElement('li');
    item.textContent = part.label;
    item.style.setProperty('--component', colorHex(part.color));
    return item;
  }));
  byId('specimen-markers').replaceChildren(...specimen.parts.filter(part => part.offset).map(part => {
    const marker = document.createElement('span');
    marker.textContent = part.label;
    marker.style.color = colorHex(part.color);
    marker.dataset.mesh = part.mesh;
    marker.dataset.offset = part.offset;
    return marker;
  }));
  byId('specimen-copy').scrollTop = 0;
}

async function openSpecimen(key, trigger) {
  if (inspection) return;
  pause();
  const specimen = PROTEIN_DETAILS[key];
  const session = { trigger, stageLabel: stage.getAttribute('aria-label'), ready: false };
  inspection = session;
  stage.setAttribute('aria-label', `Трёхмерный образец. ${specimen.title}`);
  populateSpecimen(specimen);
  byId('lesson-panels').hidden = byId('export-markers').hidden = byId('back').hidden = true;
  byId('close-specimen').hidden = byId('specimen-panel').hidden = false;
  byId('specimen-reset').hidden = true;
  byId('close-specimen').focus({ preventScroll: true });
  const status = byId('specimen-status');
  status.textContent = 'Загружается 3D-образец…';
  status.hidden = false;

  try {
    if (!scene) throw new Error('WebGL unavailable');
    const model = await scene.getSpecimen(specimen.asset);
    if (inspection !== session) return;
    scene.showSpecimen(model, specimen);
    session.ready = true;
    byId('specimen-markers').hidden = byId('specimen-reset').hidden = false;
    status.hidden = true;
  } catch {
    if (inspection === session) status.textContent = '3D-образец недоступен. Описание и источник доступны ниже.';
  }
}

function closeSpecimen() {
  if (!inspection) return;
  const { trigger, ready, stageLabel } = inspection;
  inspection = null;
  if (ready) scene?.closeSpecimen();
  stage.setAttribute('aria-label', stageLabel);
  for (const id of ['specimen-panel', 'specimen-markers', 'specimen-status', 'close-specimen']) byId(id).hidden = true;
  byId('lesson-panels').hidden = byId('back').hidden = false;
  byId('export-markers').hidden = !scene;
  trigger.focus({ preventScroll: true });
}

for (const button of document.querySelectorAll('[data-specimen]')) {
  button.onclick = () => openSpecimen(button.dataset.specimen, button);
}
byId('close-specimen').onclick = closeSpecimen;
byId('specimen-reset').onclick = () => scene?.resetView();
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && inspection) closeSpecimen();
});

function showHint(wrong = false) {
  hintShown = true;
  showNote('Где проходит мРНК?', wrong
    ? 'Ты выбрал мембрану. Найди проход между ядром и цитоплазмой.'
    : 'Поищи зелёный указатель у прохода в оболочке.', membraneExplanation, wrong);
}

function selectExportObject(object) {
  if (phase === 'find') {
    if (object === 'pore') go('ready');
    else if (object === 'membrane') showHint(true);
  } else if (phase === 'ready' || (phase === 'watch' && object)) {
    if (phase === 'watch') { pause(); shownFrame = -1; }
    if (object === 'membrane') showNote('Две мембраны', 'Они отделяют ядро от цитоплазмы.', membraneExplanation);
    if (object === 'factor') showNote('Белки экспорта', 'Золотистая модель показывает транспортный фактор.', frames[1][2]);
    if (object === 'pore') showNote('Ядерная пора', 'Через этот проход мРНК выходит в цитоплазму.', membraneExplanation);
    if (object === 'ddx19') showNote('Фермент DDX19B', 'Помогает снять транспортный фактор с мРНК.', frames[3][2]);
  }
}

function startFilm() {
  time = 0;
  go('watch');
  if (!reducedMotion) play();
}

function answer(hint) {
  if (hint) {
    showNote('Вспомни путь цепи', hint, membraneExplanation, true);
    return;
  }
  window.Progress.markDone('transl-export');
  go('done');
}

function showActions() {
  const resetView = () => scene?.resetView();
  const buttonResetView = scene && action('Вернуть вид', resetView);
  const actions = {
    intro: () => [action('К ядерной поре →', () => go('find'), true), buttonResetView],
    find: () => scene ? [action('Подсказка', () => showHint()), buttonResetView] : [
      action('Ядерная пора', () => selectExportObject('pore')),
      action('Участок оболочки', () => selectExportObject('membrane')),
    ],
    ready: () => [action('Показать выход', startFilm, true), buttonResetView],
    watch: () => {
      playButton = action('Продолжить', () => playing ? pause() : play(), true);
      checkButton = action('Дальше →', () => go('quiz'));
      return [playButton, checkButton, buttonResetView];
    },
    quiz: () => [
      action('Через ядерную пору', () => answer()),
      action('Через участок мембраны', () => answer('В оболочке есть белковый проход. Вспомни, как он называется.')),
      action('Через ядрышко', () => answer('Ядрышко находится внутри ядра. Посмотри, через что цепь пересекла оболочку.')),
    ],
    done: () => [action('Повторить выход', () => { time = 0; go('watch'); }, true),
      action('Пройти с начала', () => go('intro'))],
  }[phase]();
  byId('lesson-controls').replaceChildren(...actions.filter(Boolean));
}

function showLesson() {
  const intro = phase === 'intro';
  byId('parts').hidden = !intro;
  byId('markers').hidden = !intro || !scene;
  byId('export-markers').hidden = intro || !scene;
  for (const button of byId('export-markers').querySelectorAll('[data-select]')) {
    button.disabled = phase === 'quiz' || phase === 'done';
  }
  byId('model-source').hidden = intro;
  byId('timeline-controls').hidden = phase !== 'watch';
  stage.setAttribute('aria-label', intro ? 'Трёхмерная модель зрелой мРНК' : 'МРНК у разреза ядерной оболочки');
  const [title, copy] = intro ? introSummary : exportSummary;
  byId('scene-title').textContent = title;
  byId('scene-copy').textContent = phase === 'quiz' || phase === 'done' ? arrived : copy;
  showActions();

  if (intro) {
    scene?.leaveExport();
    selectedPoint = undefined;
    selection.hidden = true;
    partButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
    showNote(...introCopy);
  } else if (phase === 'find') {
    scene?.renderExport(0, 'find');
    showNote('Найди выход из ядра', scene
      ? 'Поверни модель и нажми на ядерную пору.'
      : 'Через какую часть ядерной оболочки выйдет мРНК?', membraneExplanation);
  } else if (phase === 'ready') {
    scene?.renderExport(0, 'ready');
    showNote('Пора найдена', 'Рядом с мРНК видны белки экспорта. Посмотри, как они помогают ей пройти через пору.', frames[0][2]);
  } else if (phase === 'watch') {
    showFrame();
  } else {
    scene?.renderExport(duration, 'ready');
    if (phase === 'quiz') showNote('Как мРНК попала в цитоплазму?', 'Выбери путь, который ты увидел на модели.', membraneExplanation);
    else showNote('Этап пройден', 'Зрелая мРНК вышла из ядра через ядерную пору с помощью белков экспорта.', frames.at(-1)[2]);
  }
}

function go(next) {
  pause();
  phase = next;
  if (next === 'intro' || next === 'find') time = 0;
  if (next === 'quiz' || next === 'done') time = duration;
  hintShown = false;
  shownFrame = -1;
  showLesson();
  saveCheckpoint();
  byId('lesson-controls').querySelector('button')?.focus({ preventScroll: true });
}

function showFrame() {
  scene?.renderExport(time, 'ready');
  const index = EXPORT_FRAMES.findLastIndex(frame => frame <= time + 0.001);
  timeline.value = time;
  byId('previous-frame').disabled = time === 0;
  byId('next-frame').disabled = time >= duration;
  if (index !== shownFrame) {
    shownFrame = index;
    const label = `${index + 1} из ${frames.length} · ${frames[index][0]}`;
    byId('frame-name').textContent = label;
    timeline.setAttribute('aria-valuetext', label);
    byId('scene-copy').textContent = time >= duration ? arrived : exportSummary[1];
    showNote(...frames[index]);
  }
  playButton.textContent = playing ? 'Пауза' : time >= duration ? 'Повторить' : 'Продолжить';
  checkButton.disabled = time < duration;
  checkButton.classList.toggle('primary', time >= duration);
  playButton.classList.toggle('primary', time < duration);
}

function pause() {
  cancelAnimationFrame(request);
  playing = false;
  if (phase === 'watch' && playButton) showFrame();
  saveCheckpoint();
}

function play() {
  if (playing) return;
  if (time >= duration) time = 0;
  lastUpdate = null;
  playing = true;
  showFrame();
  request = requestAnimationFrame(tick);
}

function tick(now) {
  time = Math.min(duration, time + (lastUpdate === null ? 0 : Math.min(0.075, (now - lastUpdate) / 1000)));
  lastUpdate = now;
  if (time >= duration) return pause();
  showFrame();
  const halfSecond = Math.floor(time * 2);
  if (savedHalfSecond !== halfSecond) {
    savedHalfSecond = halfSecond;
    saveCheckpoint();
  }
  request = requestAnimationFrame(tick);
}

function seek(point) {
  time = point;
  pause();
}

timeline.max = duration;
timeline.oninput = () => seek(Number(timeline.value));
byId('previous-frame').onclick = () => seek(EXPORT_FRAMES.findLast(frame => frame < time - 0.001) ?? 0);
byId('next-frame').onclick = () => seek(EXPORT_FRAMES.find(frame => frame > time + 0.001) ?? duration);
byId('restore-scene').onclick = () => location.reload();
window.addEventListener('pagehide', saveCheckpoint);
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });

function onContextLost() {
  scene = null;
  closeSpecimen();
  pause();
  byId('glow').hidden = true;
  byId('model-unavailable').hidden = false;
  byId('restore-scene').hidden = false;
  showLesson();
}

try {
  scene = createSplicingScene(stage, updateMarkers, index => inspect(RNA_BASES[index].part, index), {
    glowButton: byId('glow'), selectObject: selectExportObject, onContextLost,
  });
  scene.render({ completed, intron: null, progress: 0, marked: [] });
} catch (error) {
  byId('model-unavailable').hidden = false;
  console.error(error);
}
showLesson();
