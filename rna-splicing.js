import { createSplicingScene, REACTION } from './rna-splicing-scene.js';
import { RNA_BASES, SPLICING_INTRONS, basesAfterSplicing, markBoundary } from './transcription-sequence.js';

const byId = id => document.getElementById(id);
const parts = {
  e1: 'Экзон 1', i1: 'Интрон 1', e2: 'Экзон 2', i2: 'Интрон 2', e3: 'Экзон 3',
};
const sources = {
  book: ['Биология, 11 класс · § 24', 'https://profil.adu.by/mod/book/view.php?id=3964'],
  steps: ['Исследование двух шагов сплайсинга', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6461851/'],
  timing: ['Исследование времени сплайсинга', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7060811/'],
};
const why = 'Когда полимераза копирует ген, в пре-мРНК попадают копии и экзонов, и интронов. Чтобы получить мРНК, по которой рибосома сможет собирать белок, клетка удаляет интроны и соединяет экзоны в нужном порядке. Экзоны могут включать участки, которые тоже не переводятся в белок.\nВ § 24 рРНК и тРНК упоминаются в общем объяснении строения генов. У рРНК и тРНК свои гены и свои роли. Рибосомная РНК входит в состав рибосомы, а транспортная доставляет аминокислоты. Здесь показано созревание копии гена, по которому клетка будет собирать белок.';
const frames = [
  ['Цельная пре-мРНК', 'В копии гена ещё есть интроны. Клетка уберёт их, чтобы соединить экзоны в одну цепь.', why, sources.book],
  ['Сплайсосома удерживает РНК', 'Белки и малые РНК комплекса ставят начало интрона рядом с нужной точкой внутри него.',
    'Сплайсосома узнаёт сигналы в пре-мРНК и сближает первую границу интрона с точкой ветвления. На модели эта граница слева, ближе к началу цепи. После поворота камеры ориентируйся по метке 5′.\nФиолетовая поверхность передаёт форму комплекса. Учебная цепь, размеры её участков и движение показаны схематически.', sources.steps],
  ['У интрона образовалась петля', 'Связь с левым экзоном разомкнулась, но сам экзон всё ещё удерживает сплайсосома. Справа интрон остаётся прикреплённым.',
    'Почему первой размыкается именно левая связь? Сплайсосома сближает 5′-границу интрона и аденозин внутри него. Аденозин образует новую связь с началом интрона, и одновременно освобождается 3′-конец левого экзона.\nЭтот свободный конец нужен для второго шага. Он соединится с правым экзоном, а интрон уйдёт целой петлёй. Бирюзовая метка показывает свободный конец, а золото на правой стороне — ещё целую связь. Форма петли в анимации схематична.', sources.steps],
  ['Экзоны соединяются', 'Свободный конец левого экзона соединяется с правым экзоном. Тогда петля интрона отделяется.',
    'Освободившийся на первом шаге 3′-конец левого экзона теперь участвует во второй реакции. Образуется связь между экзонами, а та, которая удерживала интрон справа, размыкается.\nБирюзовый цвет показывает новый стык. Удалённый интрон позже разбирается клеткой.', sources.steps],
];
const scene = createSplicingScene(byId('stage'), updateMarkers, onBase);
const primary = (label, run) => [label, run, true];
const modelLink = ['Рассмотреть сплайсосому', openModel];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let phase = 'overview';
let completed = 0;
let active;
let marked = [];
let time = 0;
let limit = 0;
let job;
let running = false;
let animationFrame;
let modelOpen = false;
let markers = [];
let noteFrame = -1;
let comparison;
let savedFocus;

function note(title, short, full, source) {
  byId('note-title').textContent = title;
  byId('note').textContent = short;
  const paragraphs = full.split('\n').map(text => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  });
  byId('detail-copy').replaceChildren(...paragraphs);
  byId('details').scrollTop = 0;
  const link = byId('detail-source');
  link.hidden = !source;
  if (source) [link.textContent, link.href] = source;
  byId('copy-map').hidden = phase !== 'overview' || completed > 0 || source !== sources.book;
}

for (const label of ['ДНК · ген', 'Пре-мРНК · копия']) {
  const rowTitle = document.createElement('strong');
  rowTitle.textContent = label;
  byId('copy-map').append(rowTitle, ...Object.entries(parts).map(([id, name]) => {
    const cell = document.createElement('span');
    cell.dataset.kind = id.startsWith('i') ? 'intron' : 'exon';
    cell.dataset.part = id;
    cell.textContent = name;
    return cell;
  }));
}

function task(title, copy, error = false) {
  byId('task-title').textContent = title;
  byId('task-copy').textContent = copy;
  byId('task').dataset.feedback = error ? 'error' : '';
}

function makeButton(label, action, prominent) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (prominent) button.className = 'primary';
  button.onclick = action;
  return button;
}

function actions(...items) {
  byId('actions').replaceChildren(...items.map(item => makeButton(...item)));
}

function labels(...items) {
  markers = items.map(([name, point, onPick, kind = '', offset = -34]) => {
    const button = makeButton(name, onPick);
    button.className = 'marker';
    button.dataset.kind = kind;
    const line = document.createElement('span');
    line.className = 'pointer-line';
    line.setAttribute('aria-hidden', 'true');
    return { point, button, line, offset };
  });
  byId('labels').replaceChildren(...markers.flatMap(item => [item.line, item.button]));
  updateMarkers();
}

function updateMarkers() {
  const width = byId('stage').clientWidth;
  const height = byId('stage').clientHeight;
  for (const { point, button, line, offset } of markers) {
    const projected = scene.screenPoint(point);
    if (!projected) {
      line.hidden = button.hidden = true;
      continue;
    }
    const [x, y] = projected;
    const hidden = x < 1 || x > width - 1 || y < 5 || y > height - 5;
    line.hidden = button.hidden = hidden;
    if (hidden) continue;
    const half = button.offsetWidth / 2 + 4;
    const tagY = Math.max(18, Math.min(height - 18, y + offset));
    button.style.left = `${Math.max(half, Math.min(width - half, x))}px`;
    button.style.top = `${tagY}px`;
    line.style.left = `${x}px`;
    line.style.top = `${Math.min(y, tagY)}px`;
    line.style.height = `${Math.abs(tagY - y)}px`;
  }
}

function draw() {
  const focused = phase !== 'overview' && phase !== 'summary';
  scene.render({
    completed: phase === 'summary' ? comparison : completed,
    intron: focused ? active : null,
    progress: focused ? time : 0,
    marked,
  });
}

function endOfPart(id, side) {
  const positions = RNA_BASES.filter(base => base.part === id);
  return side === 'left' ? positions[0].index : positions.at(-1).index;
}

function endLabels() {
  return [
    ['Кэп · 5′', 'cap', () => note('Кэп на начале РНК',
      'Он появился, пока полимераза ещё достраивала цепь.',
      'Кэп защищает начало мРНК от разрушения. Позже его узнают белки, которые помогают начать трансляцию.',
      ['Структура комплекса кэпирования человека', 'https://www.nature.com/articles/s41467-024-48963-1']), 'join', 36],
    ['Поли(А) · 3′', 'tail', () => note('Поли(А)-хвост на конце РНК',
      'Голубые звенья А добавили к 3′-концу после разреза.',
      'С поли(А)-хвостом связываются белки. Эти взаимодействия помогают мРНК сохранять стабильность и влияют на то, как её использует рибосома.',
      ['Исследование роли поли(А)-хвоста', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11260481/']), 'join', 36],
  ];
}

function overview() {
  phase = 'overview';
  active = completed;
  time = limit = 0;
  note(completed ? 'Пре-мРНК после первого сплайсинга' : 'Зачем клетка убирает интроны?', completed
    ? 'Первый интрон уже отделился. Теперь найди второй.'
    : 'На концах этой РНК уже есть кэп и поли(А)-хвост. Теперь уберём интроны и соединим экзоны.',
  why + '\nВ учебном примере мы разбираем сплайсинг после обработки концов. В клетке отдельные интроны могут удаляться уже во время транскрипции.', sources.book);
  task(completed ? 'Найди второй интрон' : 'Что убрать из копии гена?',
    'На экране копия гена — пре-мРНК. Янтарные участки уйдут, а розовые и лиловый соединятся.');
  byId('progress-area').hidden = true;
  actions();
  const groups = new Map();
  for (const base of basesAfterSplicing(completed)) {
    if (!groups.has(base.part)) groups.set(base.part, []);
    groups.get(base.part).push(base.index);
  }
  byId('parts').replaceChildren(...Array.from(groups.keys(), id => {
    const button = makeButton(parts[id], () => inspectPart(id));
    button.dataset.kind = id.startsWith('i') ? 'intron' : 'exon';
    return button;
  }));
  draw();
  labels(...Array.from(groups, ([id, bases], i) => [parts[id], bases[Math.floor(bases.length / 2)],
    () => inspectPart(id), id.startsWith('i') ? 'intron' : 'exon', i % 2 ? 38 : -34]), ...endLabels());
}

function inspectPart(id) {
  if (id === `i${active + 1}`) {
    startIntron();
    return;
  }
  if (id.startsWith('e')) {
    note(parts[id], 'Этот участок сохранится в мРНК после сплайсинга.',
      'После удаления интрона экзоны образуют непрерывную РНК. В экзонах могут быть и участки, которые рибосома не переводит в белок.');
    task('Поищи соседний интрон', 'Экзон остаётся. Найди янтарный участок между двумя экзонами.', true);
  } else {
    task('Начнём с первого интрона', 'Покажи интрон между экзонами 1 и 2. Второй разберёшь после него.');
  }
}

function onBase(index) {
  const id = RNA_BASES[index].part;
  if (phase === 'overview') inspectPart(id);
  if (phase === 'choose-join' && !running && time === limit) {
    const expected = active === 0 ? 'e2' : 'e3';
    choosePartner(id === expected);
  }
}

function startIntron() {
  phase = 'boundaries';
  marked = [];
  byId('parts').replaceChildren();
  note('Границы интрона', 'Граница — это связь между двумя соседними звеньями РНК.',
    'Сплайсосома распознаёт места, где интрон начинается и заканчивается. Найди переходы между янтарным интроном и розовыми экзонами.');
  task(`Отметь обе границы интрона ${active + 1}`, active
    ? 'Определи два стыка и нажми на них в любом порядке.'
    : 'Найди две связи, на которых меняется цвет цепи. Стык внутри самого интрона тоже можно проверить.');
  draw();
  boundaryChoices();
}

function boundaryChoices() {
  const { first, last } = SPLICING_INTRONS[active];
  const choices = [first - 1, Math.floor((first + last) / 2), last];
  const names = ['А', 'Б', 'В'];
  const label = (i, n) => (marked.includes(i) ? '✓ ' : '') + `Стык ${names[n]}`;
  labels(...choices.map((i, n) => [label(i, n), [i, i + 1], () => selectBoundary(i), 'join', n === 1 ? -40 : 37]));
  actions(...choices.map((i, n) => [label(i, n), () => selectBoundary(i)]));
}

function selectBoundary(index) {
  if (phase !== 'boundaries') return;
  const check = markBoundary(active, marked, index);
  if (check.status === 'incorrect') {
    task('Этот стык внутри интрона', 'С обеих сторон янтарные звенья. Граница находится там, где интрон соседствует с экзоном.', true);
    return;
  }
  if (check.status === 'already') {
    task('Этот стык уже отмечен', 'Теперь найди другой конец того же интрона.');
    return;
  }
  marked = check.bonds;
  draw();
  if (check.status === 'partial') {
    task('Одна граница найдена', 'Бирюзовая связь отмечена. Найди вторую сторону интрона.');
    boundaryChoices();
    return;
  }
  phase = 'assembly';
  labels();
  task('Обе границы найдены', 'Посмотри, как сплайсосома подходит к отмеченному участку.');
  actions(primary('Собрать сплайсосому', assemble), modelLink);
}

async function assemble() {
  phase = 'loading';
  actions();
  task('Подготавливаем сплайсосому', 'Загружается 3D-модель комплекса.');
  try {
    await scene.getStructure();
  } catch {
    phase = 'assembly';
    task('Модель не загрузилась', 'Попробуй ещё раз. Отмеченные границы сохранены.', true);
    actions(primary('Повторить загрузку', assemble));
    return;
  }
  animateTo(1, () => {
    phase = 'loop';
    task('Проследи за началом интрона', 'Запусти первый шаг и посмотри, куда попадёт его 5′-край.');
    showCurrentActions();
  });
}

function formLoop() {
  animateTo(2, () => {
    phase = 'choose-join';
    task('С чем соединится левый экзон?', 'У него теперь свободный 3′-конец. Справа интрон ещё связан с последующим экзоном. Выбери, с чем продолжится цепь.');
    showCurrentActions();
  });
}

function choosePartner(right) {
  if (phase !== 'choose-join' || time !== limit || running) return;
  if (!right) {
    task('Петля уйдёт из цепи', 'Найди экзон справа от интрона. После соединения экзонов между ними появится общий стык.', true);
    return;
  }
  animateTo(3, () => {
    phase = 'joined';
    task('Получился новый стык', 'Бирюзовая связь соединяет экзоны. Янтарная петля отделилась.');
    showCurrentActions();
  });
}

function showCurrentActions() {
  const { first, last } = SPLICING_INTRONS[active];
  labels();
  if (time < limit - 0.01 || running || phase === 'motion') {
    actions();
    return;
  }
  if (phase === 'loop') {
    labels(['Граница 5′', [first - 1, first], () => note('Начало интрона',
      'Первая реакция произойдёт на границе, которая ближе к 5′-концу пре-мРНК.', frames[1][2], sources.steps), 'join', -41],
    ['Граница 3′', [last, last + 1], () => note('Конец интрона',
      'Эта связь пока останется целой. Её разомкнёт вторая реакция.', frames[1][2], sources.steps), 'still-linked', -41],
    ['Сплайсосома', 'protein', openModel, '', 42]);
    actions(primary('Образовать петлю', formLoop), modelLink);
  }
  if (phase === 'choose-join') {
    const loopTop = first + Math.floor((last - first - 2) / 2);
    labels(['Петля интрона', loopTop, () => note(...frames[2]), 'intron', -30],
      ['3′-конец экзона', first - 1, () => note('Освободился 3′-конец',
        'Левый экзон остался в сплайсосоме. Его свободный конец сможет соединиться с правым экзоном.', frames[2][2], sources.steps), 'join', 36],
      ['Связь ещё цела', [last, last + 1], () => note('Интрон ещё прикреплён справа',
        'Первая реакция освободила левый экзон. Справа связь интрона со следующим экзоном пока целая.', frames[2][2], sources.steps), 'still-linked', -25],
      ['Правый экзон', last + 2, () => choosePartner(true), '', 37]);
    actions(primary('Соединить с правым экзоном', () => choosePartner(true)),
      ['Соединить с интроном', () => choosePartner(false)], modelLink);
  }
  if (phase === 'joined') {
    labels(['Стык экзонов', [first - 1, last + 1], explainJoin, 'join', 38],
      ['Отделившийся интрон', first + Math.floor((last - first - 2) / 2), explainLoop, 'intron', -28]);
    actions(primary(active === 0 ? 'Ко второму интрону' : 'Сравнить результат', nextIntronOrSummary), modelLink);
  }
}

function explainJoin() {
  note(...frames[3]);
}

function explainLoop() {
  note('Отделившийся интрон', 'Он ушёл из цепи целой петлёй.',
    'После отделения клетка размыкает петлю и разбирает интрон. На экране экзоны остаются частью той же РНК.');
}

function animateTo(end, after) {
  phase = 'motion';
  limit = end;
  byId('progress-area').hidden = false;
  labels();
  actions();
  task('Понаблюдай за РНК', 'Поставь движение на паузу или вернись к нужному кадру ползунком.');
  byId('timeline-label').textContent = 'Кадры сплайсинга';
  startPlayback(after);
}

const timeline = byId('timeline');
const playback = byId('playback');

function updateTimeline() {
  timeline.max = limit;
  timeline.value = time;
  const index = time >= REACTION.join ? 3 : time >= REACTION.loop ? 2 : time >= 0.16 ? 1 : 0;
  byId('frame-name').textContent = frames[index][0];
  timeline.setAttribute('aria-valuetext', frames[index][0]);
  playback.textContent = running ? 'Пауза' : time >= limit ? '▶ Повторить кадры' : '▶ Продолжить';
  if (index !== noteFrame) {
    noteFrame = index;
    note(...frames[index]);
  }
}

function startPlayback(after = null) {
  if (running) return;
  if (after) job = after;
  running = true;
  lastFrame = 0;
  if (time >= limit) time = 0;
  updateTimeline();
  showCurrentActions();
  animationFrame = requestAnimationFrame(advance);
}

let lastFrame;
function advance(now) {
  if (!running || modelOpen) return;
  const delta = lastFrame ? Math.min(0.075, (now - lastFrame) / 1000) : 0;
  const seconds = time < 1 ? 1.45 : time < 2 ? 2.5 : 2.25;
  lastFrame = now;
  time = Math.min(limit, time + delta / (reducedMotion ? 0.55 : seconds));
  draw();
  updateTimeline();
  if (time < limit) {
    animationFrame = requestAnimationFrame(advance);
    return;
  }
  running = false;
  const after = job;
  job = null;
  updateTimeline();
  if (after) after();
  else showCurrentActions();
}

function pause() {
  cancelAnimationFrame(animationFrame);
  running = false;
  updateTimeline();
}

playback.onclick = () => {
  if (running) pause();
  else startPlayback();
};
timeline.oninput = () => {
  const requested = Number(timeline.value);
  pause();
  time = requested;
  // Reaching a new step via the slider commits the same visual state as playback.
  if (job && time >= limit) {
    const after = job;
    job = null;
    after();
  }
  draw();
  updateTimeline();
  showCurrentActions();
};

function nextIntronOrSummary() {
  completed++;
  marked = [];
  comparison = completed;
  if (completed < SPLICING_INTRONS.length) overview();
  else summary(completed);
}

function summary(visible) {
  phase = 'summary';
  byId('lesson-heading').textContent = visible ? 'Итог процессинга' : 'Сплайсинг';
  comparison = visible;
  marked = [];
  byId('progress-area').hidden = true;
  note(visible ? 'МРНК после процессинга' : 'РНК до удаления интронов',
    visible ? 'Кэп, три соединённых экзона и поли(А)-хвост теперь видны на одной молекуле.'
      : 'Кэп и поли(А)-хвост уже на месте. Между экзонами пока остаются два интрона.',
    'Процессинг — обработка РНК при созревании. Кэп появился ещё во время элонгации. После разреза к новому 3′-концу добавился поли(А)-хвост. При сплайсинге два интрона отделились, а три экзона соединились.\nТак мы разобрали события в нашем примере. В клетке отдельные интроны могут удаляться ещё до появления поли(А)-хвоста.', sources.timing);
  task(visible ? 'Проследи путь всей цепи' : 'Сравни цепь до и после сплайсинга',
    visible ? 'Нажми на кэп, экзон или хвост, чтобы вспомнить, откуда появился этот участок.'
      : 'Янтарные участки отделятся. На концах цепи кэп и поли(А)-хвост сохранятся.');
  draw();
  labels(...(visible ? ['e1', 'e2', 'e3'] : Object.keys(parts)).map((id, i) => {
    const point = endOfPart(id, 'left');
    return [parts[id], point, () => note(parts[id],
      id.startsWith('i') ? 'Этот участок отделяется петлёй.' : 'Этот участок сохраняется в цепи.',
      frames[0][2]), id.startsWith('i') ? 'intron' : 'exon', i % 2 ? 37 : -35];
  }), ...endLabels());
  actions(['До сплайсинга', () => summary(0)], ['После сплайсинга', () => summary(completed)],
    ['Повторить сплайсинг', () => { completed = 0; overview(); }], modelLink);
  if (visible) {
    const link = document.createElement('a');
    link.href = 'translation.html';
    link.className = 'primary';
    link.textContent = 'К трансляции →';
    byId('actions').append(link);
  }
  for (const [i, button] of Array.from(byId('actions').children).slice(0, 2).entries()) {
    button.setAttribute('aria-pressed', String(i === (visible ? 1 : 0)));
  }
}

async function openModel(event) {
  if (modelOpen) return;
  savedFocus = event?.currentTarget;
  modelOpen = true;
  if (running) pause();
  try {
    await scene.getStructure();
  } catch {
    modelOpen = false;
    task('Модель не загрузилась', 'Можно повторить попытку и продолжить с того же кадра.', true);
    return;
  }
  byId('lesson').hidden = byId('labels').hidden = true;
  byId('structure').hidden = false;
  showMolecularLayer('all');
  byId('close-model').focus();
}

const molecularLayers = {
  all: ['Сплайсосома крупным планом', 'Фиолетовый — белки комплекса. Розовая цепь — копия гена. Голубые цепи помогают её обработать.'],
  rna: ['Два типа РНК', 'Розовое — пре-мРНК, которую обрабатывают. Голубое — малые РНК, которые помогают сплайсосоме.'],
  substrate: ['Пре-мРНК · розовая цепь', 'Это фрагменты РНК, над которой работает сплайсосома. На учебной схеме эта цепь содержит экзоны и интроны.'],
  helpers: ['Малые РНК · голубые цепи', 'Эти РНК входят в состав сплайсосомы. Они помогают удерживать нужные участки пре-мРНК рядом.'],
};

function showMolecularLayer(layer) {
  for (const button of byId('structure-layers').children) {
    button.setAttribute('aria-pressed', String(button.dataset.layer === layer));
  }
  note(...molecularLayers[layer],
    'Здесь показано экспериментальное состояние сплайсосомы человека после образования петли. В модели видны участки, для которых исследователи смогли определить положение. Промежутки между фрагментами не следует читать как места разрезов.\nДля пошагового сравнения экзонов и интрона вернись к учебной цепи кнопкой «К сплайсингу».');
  byId('structure-caption').textContent = 'Поверни модель или оставь на экране нужный слой.';
  scene.showStructure(true, layer);
}

byId('structure-layers').addEventListener('click', event => {
  const button = event.target.closest('[data-layer]');
  if (button) showMolecularLayer(button.dataset.layer);
});
byId('close-model').onclick = () => {
  if (!modelOpen) return;
  modelOpen = false;
  byId('lesson').hidden = byId('labels').hidden = false;
  byId('structure').hidden = true;
  scene.showStructure(false);
  if (phase === 'summary') summary(comparison);
  else if (time > 0) { noteFrame = -1; updateTimeline(); }
  else note('Границы интрона', 'Отмечены оба стыка между интроном и соседними экзонами.', frames[1][2]);
  if (savedFocus?.isConnected) savedFocus.focus();
  else byId('actions').querySelector('button')?.focus();
};
byId('details-toggle').onclick = () => {
  const panel = byId('details');
  panel.hidden = !panel.hidden;
  const button = byId('details-toggle');
  button.textContent = panel.hidden ? 'Подробнее' : 'Свернуть';
  button.setAttribute('aria-expanded', String(!panel.hidden));
};

if (new URLSearchParams(location.search).get('frame') === 'mature') {
  completed = SPLICING_INTRONS.length;
  summary(completed);
} else {
  overview();
}
