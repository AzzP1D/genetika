import { createSplicingScene } from './rna-splicing-scene.js';
import { EXPORT_FRAMES } from './rna-export-scene.js';
import { PROTEIN_DETAILS } from './rna-protein-details.js';
import { RNA_BASES, SPLICING_INTRONS, basesAfterSplicing } from './transcription-sequence.js';
import { codonChoices, INITIATION_FILMS, INITIATION_NOTES, INITIATION_STEPS,
  initiationChoice, initiationPose } from './rna-initiation.js';
import { candidates, codons, matchingBases, residues, stopIndex } from './rna-elongation.js';
import { bindCodonInspector } from './rna-codon-inspector.js';

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
const initiationMarkers = [...byId('initiation-markers').children];
const residueMarkers = residues.map(({ code, index, color }) => {
  const marker = document.createElement('span');
  marker.className = 'guide residue-marker';
  marker.dataset.point = `res-${index}`;
  marker.dataset.offset = index % 2 ? 24 : -24;
  marker.style.setProperty('--residue', `#${color.toString(16)}`);
  marker.textContent = code;
  marker.hidden = true;
  byId('initiation-markers').append(marker);
  return marker;
});
const siteButtons = [...byId('site-rail').querySelectorAll('[data-focus]')];
const siteNotes = {
  E: 'E — выход. После сдвига сюда попадает пустая тРНК и отделяется.',
  P: 'P — удержание. Здесь тРНК держит растущую цепь. При старте здесь находится тРНК с Met.',
  A: 'A — приём. Сюда приходит следующая тРНК, а на стоп-кодоне — фактор освобождения.',
};
const stage = byId('stage');
const selection = byId('selection');
const details = byId('details');
const toggle = byId('details-toggle');
const timeline = byId('timeline');
const duration = EXPORT_FRAMES.at(-1);
const progressKey = 'gen-translation-export';
const initiationStep = phase => phase.startsWith('init-') ? phase.slice(5) : null;
const initiationSummary = ['Рибосома находит начало', 'В цитоплазме та же мРНК становится инструкцией для сборки белка.'];
const filmPoints = phase => phase === 'watch' ? EXPORT_FRAMES :
  INITIATION_FILMS[initiationStep(phase)]?.map(([point]) => point);
const filmEnd = phase => filmPoints(phase)?.at(-1) ?? 0;
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
  const stages = ['find', 'ready', 'watch', 'quiz', 'done', ...INITIATION_STEPS.map(step => `init-${step}`)];
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey));
    if (stages.includes(saved?.phase)) return {
      phase: saved.phase,
      time: Number.isFinite(saved.time) ? Math.max(0, Math.min(filmEnd(saved.phase), saved.time)) : 0,
      cycleIndex: Number.isInteger(saved.cycleIndex) ? Math.max(1, Math.min(stopIndex - 1, saved.cycleIndex)) : 1,
      cut: typeof saved.cut === 'boolean' ? saved.cut : undefined,
    };
  } catch { /* resume is optional when storage is unavailable */ }
  return { phase: 'intro', time: 0 };
}

const sectionSteps = ['scan', 'codon', 'trna', 'assemble', 'site', 'done', 'elong', 'cycle', 'stop', 'release', 'product'];
let { phase, time, cycleIndex = 1, cut = sectionSteps.includes(initiationStep(phase)) } = loadCheckpoint();
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
let focusSite;
let attempted;
let guideStamp;
let initiationReady = false;
let initiationError = false;
let initiationLoading = false;

function saveCheckpoint() {
  try {
    if (phase === 'intro') localStorage.removeItem(progressKey);
    else localStorage.setItem(progressKey, JSON.stringify({ phase, time, cycleIndex, cut }));
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

function placeMarker(marker, point, offset, occupied, top = 0) {
  const at = scene.screenPoint(point);
  if (!at || at[0] < 0 || at[0] > stage.clientWidth || at[1] < 0 || at[1] > stage.clientHeight) {
    marker.hidden = true;
    return;
  }
  const [x, y] = at;
  marker.hidden = false;
  const half = marker.offsetWidth / 2;
  const height = marker.offsetHeight / 2;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const candidates = occupied ? [[0, 0], [0, -42], [0, 42], [-52, -26], [52, -26], [0, -80], [0, 80]] : [[0, 0]];
  for (const [dx, dy] of candidates) {
    const left = clamp(x + dx, half + 2, stage.clientWidth - half - 2);
    const vertical = clamp(y + offset + dy, top + height + 3, stage.clientHeight - height - 3);
    if (vertical + height > stage.clientHeight) continue;
    const rect = { left: left - half - 3, right: left + half + 3, top: vertical - height - 3, bottom: vertical + height + 3 };
    if (occupied?.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)) continue;
    occupied?.push(rect);
    marker.style.left = `${left}px`;
    marker.style.top = `${vertical}px`;
    if (occupied) {
      const toX = x - left;
      const toY = y - vertical;
      const inset = Math.min(1, half / Math.abs(toX), height / Math.abs(toY));
      marker.style.setProperty('--lead-x', `${toX * inset}px`);
      marker.style.setProperty('--lead-y', `${toY * inset}px`);
      marker.style.setProperty('--lead-length', `${Math.hypot(toX, toY) * (1 - inset)}px`);
      marker.style.setProperty('--lead-angle', `${Math.atan2(toY, toX)}rad`);
    }
    return;
  }
  marker.hidden = true;
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
  const step = initiationStep(phase);
  if (step) {
    if (!initiationReady) return;
    const visible = {
      origin: ['origin-pore', '40s', '60s', 'nucleolus'], find: ['40s', '60s'],
      cap: ['cap', 'tail'], scan: ['cap', 'trna', 'eif3', 'eif2', '40s'],
      codon: ['codon-0', 'codon-1', 'codon-2'], trna: ['aug', 'trna'],
      assemble: ['trna', '60s'], site: ['site-a', 'site-p', 'trna'], done: ['trna'],
      elong: [], cycle: [], stop: [], release: ['erf1'], product: [],
    }[step];
    const occupied = [];
    const guide = byId('reading-guide');
    const top = guide.hidden ? 0 : guide.offsetTop + guide.offsetHeight;
    for (const marker of initiationMarkers) {
      if (!visible.includes(marker.dataset.point)) marker.hidden = true;
    }
    for (const point of visible) {
      const marker = initiationMarkers.find(item => item.dataset.point === point);
      placeMarker(marker, point, Number(marker.dataset.offset), occupied, top);
    }
    for (const marker of residueMarkers) {
      if (['elong', 'cycle', 'stop', 'release', 'product'].includes(step)) {
        placeMarker(marker, marker.dataset.point, Number(marker.dataset.offset), occupied, top);
      } else marker.hidden = true;
    }
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
    const offsets = { nucleus: -24, cytoplasm: -24, pore: 18, factor: -27, ddx19: -30 };
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
  for (const id of ['lesson-panels', 'export-markers', 'initiation-markers', 'reading-guide', 'back']) byId(id).hidden = true;
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
  byId('export-markers').hidden = !scene || Boolean(initiationStep(phase));
  byId('initiation-markers').hidden = !scene || !initiationReady || !initiationStep(phase);
  if (initiationStep(phase)) drawInitiation();
  if (trigger.isConnected) trigger.focus({ preventScroll: true });
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

function renderLetters(id, letters, matches) {
  byId(id).replaceChildren(...Array.from(letters, (letter, index) => {
    const symbol = document.createElement('b');
    symbol.className = matches[index] ? 'match' : 'mismatch';
    symbol.textContent = letter;
    return symbol;
  }));
}

function drawReadingGuide(step, reading) {
  const guide = byId('reading-guide');
  guide.hidden = !reading && !['site', 'done'].includes(step) && !(step === 'trna' && attempted);
  if (guide.hidden) return;
  byId('open-codon-inspector').hidden = step !== 'elong' && step !== 'cycle';
  const first = Math.round(reading?.feed ?? 0);
  const choices = [first - 1, first, first + 1];
  const peptide = reading?.count ?? 0;
  const match = step === 'cycle' && time >= 1.5 && time <= 3.55 ? residues[cycleIndex] : attempted;
  const stamp = [step, first, peptide, focusSite, match?.anticodon, match?.index, cycleIndex, reading?.active].join('|');
  if (stamp === guideStamp) return;
  guideStamp = stamp;
  byId('site-rail').hidden = step === 'trna';
  for (const [index, button] of siteButtons.entries()) {
    const triplet = choices[index] === -1 ? codonChoices[0] : codons[choices[index]] ?? '—';
    button.lastElementChild.textContent = triplet;
    button.setAttribute('aria-pressed', String(button.dataset.focus === focusSite));
    button.classList.toggle('active-codon', button.dataset.focus === reading?.active);
  }
  const explanation = byId('site-explanation');
  explanation.hidden = !focusSite;
  explanation.textContent = siteNotes[focusSite] ?? '';
  byId('pairing').hidden = !match;
  if (match) {
    const target = step === 'trna' ? codons[0] : codons[cycleIndex];
    const matches = matchingBases(match.anticodon, target);
    renderLetters('pair-codon', target, matches);
    renderLetters('pair-anticodon', match.anticodon, matches);
  }
  const chain = byId('peptide-order');
  chain.hidden = !peptide;
  chain.replaceChildren(...residues.slice(0, peptide).map(residue => {
    const item = document.createElement('span');
    item.textContent = residue.code;
    item.style.color = colorHex(residue.color);
    item.title = residue.name;
    return item;
  }));
}

function drawInitiation() {
  const step = initiationStep(phase);
  const state = initiationPose(step, time, cut, cycleIndex, focusSite);
  drawReadingGuide(step, state.reading);
  if (initiationReady) scene?.renderInitiation(state);
}

for (const button of siteButtons) {
  button.onclick = () => {
    pause();
    focusSite = focusSite === button.dataset.focus ? undefined : button.dataset.focus;
    if (focusSite) cut = true;
    document.querySelector('[data-requires-model]')?.setAttribute('aria-pressed', String(cut));
    drawInitiation();
  };
}

async function prepareInitiation() {
  if (!scene || initiationReady || initiationLoading || initiationError) return;
  const activeScene = scene;
  initiationLoading = true;
  try {
    await activeScene.loadInitiation();
    if (activeScene !== scene) return;
    initiationReady = true;
    if (initiationStep(phase)) {
      byId('initiation-markers').hidden = Boolean(inspection);
      byId('initiation-status').hidden = true;
      for (const button of document.querySelectorAll('[data-requires-model]')) button.disabled = false;
      if (!inspection) drawInitiation();
    }
  } catch {
    if (activeScene !== scene) return;
    initiationError = true;
    if (initiationStep(phase)) {
      byId('initiation-status').textContent = 'Модель рибосомы не загрузилась. Задание доступно по кнопкам.';
    }
  } finally {
    initiationLoading = false;
  }
}

function selectInitiation(value) {
  const step = initiationStep(phase);
  const choice = initiationChoice(step, value);
  if (choice.error) {
    const [title, , detail] = INITIATION_NOTES[step];
    showNote(title, choice.error, detail, true);
    if (step === 'trna') {
      attempted = { anticodon: value };
      drawInitiation();
    }
  } else if (choice.next) {
    go(`init-${choice.next}`);
    if (INITIATION_FILMS[choice.next] && !reducedMotion) play();
  }
}

function chooseCarrier(candidate) {
  attempted = candidate;
  if (candidate.index !== cycleIndex) {
    showNote('Сравни кодон и антикодон',
      `У ${candidate.code} есть несовпадающая пара. Найди тРНК, у которой совпадают все три буквы.`,
      INITIATION_NOTES.elong[2], true);
    drawInitiation();
    return;
  }
  go('init-cycle');
  if (!reducedMotion) play();
}

function chooseStop(correct) {
  if (correct) {
    go('init-release');
    if (!reducedMotion) play();
  } else {
    showNote('УАА — сигнал остановки', 'Здесь вместо тРНК нужен фактор освобождения.', INITIATION_NOTES.stop[2], true);
  }
}

function selectSceneObject(object) {
  if (!initiationStep(phase)) return selectExportObject(object);
  if (!object) return;
  if (object.startsWith('codon-')) return selectInitiation(codonChoices[Number(object.at(-1))]);
  const allowed = { find: ['40s'], cap: ['cap', 'tail'], site: ['site-a', 'site-p'] };
  if (allowed[initiationStep(phase)]?.includes(object)) selectInitiation(object);
}

for (const button of byId('initiation-markers').querySelectorAll('[data-select]')) {
  if (button.dataset.select.startsWith('codon-')) button.textContent = codonChoices[Number(button.dataset.select.at(-1))];
  button.onclick = () => selectSceneObject(button.dataset.select);
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
  const filmActions = (next, advance = () => go(next)) => {
    playButton = action('Продолжить', () => playing ? pause() : play(), true);
    checkButton = action('Дальше →', advance);
    return [playButton, checkButton, buttonResetView];
  };
  const choice = (label, value) => action(label, () => selectInitiation(value));
  const cutButton = () => {
    const button = action('Вид изнутри', () => {
      cut = !cut;
      if (!cut) focusSite = undefined;
      button.setAttribute('aria-pressed', String(cut));
      drawInitiation();
      saveCheckpoint();
    });
    button.setAttribute('aria-pressed', String(cut));
    button.dataset.requiresModel = '';
    button.disabled = !initiationReady;
    return scene && button;
  };
  const actions = {
    intro: () => [action('К ядерной поре →', () => go('find'), true), buttonResetView],
    find: () => scene ? [action('Подсказка', () => showHint()), buttonResetView] : [
      action('Ядерная пора', () => selectExportObject('pore')),
      action('Участок оболочки', () => selectExportObject('membrane')),
    ],
    ready: () => [action('Показать выход', startFilm, true), buttonResetView],
    watch: () => filmActions('quiz'),
    quiz: () => [
      action('Через ядерную пору', () => answer()),
      action('Через участок мембраны', () => answer('В оболочке есть белковый проход. Вспомни, как он называется.')),
      action('Через ядрышко', () => answer('Ядрышко находится внутри ядра. Посмотри, через что цепь пересекла оболочку.')),
    ],
    done: () => [action('К рибосоме →', () => go('init-origin'), true),
      action('Повторить выход', () => { time = 0; go('watch'); })],
    'init-origin': () => filmActions('init-find'),
    'init-find': () => [choice('Малая субъединица 40S', '40s'), buttonResetView],
    'init-cap': () => [choice('Кэп · 5′', 'cap'), choice('Поли(А) · 3′', 'tail'), buttonResetView],
    'init-scan': () => [...filmActions('init-codon'), cutButton()],
    'init-codon': () => [...codonChoices.map(codon => choice(codon, codon)), buttonResetView],
    'init-trna': () => [...['АУГ', 'УАЦ', 'УГЦ'].map(anticodon => choice(`3′–${anticodon}–5′`, anticodon)), cutButton()],
    'init-assemble': () => [...filmActions('init-site'), cutButton()],
    'init-site': () => [choice('Участок P', 'site-p'), choice('Участок A', 'site-a'), cutButton(), buttonResetView],
    'init-done': () => [action('Собрать цепь →', () => go('init-elong', 1), true), cutButton(),
      action('Повторить инициацию', () => go('init-origin')),
      action('Вернуться к выходу', () => go('done'))],
    'init-elong': () => [...candidates(cycleIndex).map(candidate => {
      const button = action(`${candidate.code} · 3′–${candidate.anticodon}–5′`, () => chooseCarrier(candidate));
      button.title = candidate.name;
      return button;
    }), cutButton(), buttonResetView],
    'init-cycle': () => [...filmActions(null, () => cycleIndex + 1 === stopIndex ?
      go('init-stop') : go('init-elong', cycleIndex + 1)), cutButton()],
    'init-stop': () => [action('тРНК с аминокислотой', () => chooseStop(false)),
      action('Фактор eRF1', () => chooseStop(true)), cutButton()],
    'init-release': () => [...filmActions('init-product'), cutButton()],
    'init-product': () => [action('Собрать цепь заново', () => go('init-elong', 1), true),
      action('К инициации', () => go('init-done')), cutButton()],
  }[phase]();
  if (phase !== 'intro') {
    const restart = action('Начать с начала', () => {
      if (!details.hidden) toggle.click();
      go('intro');
    });
    restart.classList.add('restart-lesson');
    actions.push(restart);
  }
  byId('lesson-controls').replaceChildren(...actions.filter(Boolean));
}

function showLesson() {
  const intro = phase === 'intro';
  const step = initiationStep(phase);
  if (!step) byId('reading-guide').hidden = true;
  byId('parts').hidden = !intro;
  byId('markers').hidden = !intro || !scene;
  byId('export-markers').hidden = intro || !scene || Boolean(step);
  byId('initiation-markers').hidden = !scene || !step || !initiationReady;
  for (const button of byId('initiation-markers').querySelectorAll('[data-select]')) {
    button.disabled = ['origin', 'done', 'scan'].includes(step);
  }
  byId('initiation-status').hidden = !scene || !step || initiationReady;
  if (!byId('initiation-status').hidden) byId('initiation-status').textContent = initiationError
    ? 'Модель рибосомы не загрузилась. Задание доступно по кнопкам.' : 'Загружается модель рибосомы…';
  for (const button of byId('export-markers').querySelectorAll('[data-select]')) {
    button.disabled = phase === 'quiz' || phase === 'done';
  }
  byId('model-source').hidden = intro || Boolean(step);
  byId('initiation-source').hidden = !step;
  byId('release-specimen').hidden = !['stop', 'release', 'product'].includes(step);
  byId('timeline-controls').hidden = !filmPoints(phase);
  timeline.max = filmEnd(phase);
  timeline.setAttribute('aria-label', step ? 'Кадры трансляции' : 'Кадры выхода мРНК');
  stage.setAttribute('aria-label', step ? 'МРНК и рибосома в цитоплазме' :
    intro ? 'Трёхмерная модель зрелой мРНК' : 'МРНК у разреза ядерной оболочки');
  const translation = ['elong', 'cycle', 'stop', 'release', 'product'].includes(step);
  const [title, copy] = translation ? ['Как растёт полипептид', 'Рибосома читает мРНК по три буквы и соединяет аминокислоты.'] :
    step ? initiationSummary : intro ? introSummary : exportSummary;
  byId('scene-title').textContent = title;
  byId('scene-copy').textContent = phase === 'quiz' || phase === 'done' ? arrived : copy;
  showActions();

  if (step) {
    if (!initiationReady) {
      scene?.renderExport(duration, 'ready');
      prepareInitiation();
    }
    if (filmPoints(phase)) showFrame();
    else {
      drawInitiation();
      const [title, note, detail] = INITIATION_NOTES[step];
      showNote(title, step === 'elong' ? `Какой антикодон подойдёт к ${codons[cycleIndex]} в участке A?` : note, detail);
    }
  } else if (intro) {
    scene?.leaveInitiation();
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

function go(next, index = cycleIndex) {
  pause();
  phase = next;
  cycleIndex = index;
  attempted = focusSite = guideStamp = undefined;
  if (next === 'intro' || next === 'find' || initiationStep(next)) time = 0;
  cut = sectionSteps.includes(initiationStep(next));
  if (next === 'quiz' || next === 'done') time = duration;
  hintShown = false;
  shownFrame = -1;
  showLesson();
  saveCheckpoint();
  byId('lesson-controls').querySelector('button')?.focus({ preventScroll: true });
}

function showFrame() {
  const points = filmPoints(phase);
  const end = points.at(-1);
  const step = initiationStep(phase);
  if (step) drawInitiation();
  else scene?.renderExport(time, 'ready');
  const index = points.findLastIndex(frame => frame <= time + 0.001);
  timeline.value = time;
  byId('previous-frame').disabled = time === 0;
  byId('next-frame').disabled = time >= end;
  if (index !== shownFrame) {
    shownFrame = index;
    const [title, note, detail] = step
      ? [...INITIATION_FILMS[step][index].slice(1), INITIATION_NOTES[step][2]] : frames[index];
    const label = `${index + 1} из ${points.length} · ${title}`;
    byId('frame-name').textContent = label;
    timeline.setAttribute('aria-valuetext', label);
    if (!step) byId('scene-copy').textContent = time >= end ? arrived : exportSummary[1];
    showNote(title, note, detail);
  }
  playButton.textContent = playing ? 'Пауза' : time >= end ? 'Повторить' : 'Продолжить';
  checkButton.disabled = time < end;
  checkButton.classList.toggle('primary', time >= end);
  playButton.classList.toggle('primary', time < end);
}

function pause() {
  cancelAnimationFrame(request);
  playing = false;
  if (filmPoints(phase) && playButton) showFrame();
  saveCheckpoint();
}

bindCodonInspector(pause);

function play() {
  if (playing) return;
  if (time >= filmEnd(phase)) time = 0;
  lastUpdate = null;
  playing = true;
  showFrame();
  request = requestAnimationFrame(tick);
}

function tick(now) {
  const end = filmEnd(phase);
  time = Math.min(end, time + (lastUpdate === null ? 0 : Math.min(0.075, (now - lastUpdate) / 1000)));
  lastUpdate = now;
  if (time >= end) return pause();
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

timeline.oninput = () => seek(Number(timeline.value));
byId('previous-frame').onclick = () => seek(filmPoints(phase).findLast(frame => frame < time - 0.001) ?? 0);
byId('next-frame').onclick = () => seek(filmPoints(phase).find(frame => frame > time + 0.001) ?? filmEnd(phase));
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
    glowButton: byId('glow'), selectObject: selectSceneObject, onContextLost,
  });
  scene.render({ completed, intron: null, progress: 0, marked: [] });
} catch (error) {
  byId('model-unavailable').hidden = false;
  console.error(error);
}
showLesson();
