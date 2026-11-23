import { createSplicingScene } from './rna-splicing-scene.js';
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
    'Кэп появился, когда полимераза ещё достраивала РНК. В цитоплазме кэп узнают белки, которые помогают рибосоме начать считывание мРНК.',
  ],
  e1: [
    'Экзон 1',
    'Первый экзон начинается сразу за кэпом и соединён со вторым экзоном.',
    'В начале этого экзона есть участок, который не переводится в аминокислоты. Дальше в первом экзоне находится стартовый кодон АУГ. С него рибосома начнёт переводить запись мРНК в цепочку аминокислот.',
  ],
  e2: [
    'Экзон 2',
    'Средний экзон остался в цепи после удаления двух соседних интронов.',
    'Голубые перемычки отмечают два стыка, появившихся при сплайсинге. Через них проходит непрерывная цепь. Когда начнётся трансляция, рибосома будет читать её по три нуклеотида подряд.',
  ],
  e3: [
    'Экзон 3',
    'Последний экзон идёт от второго стыка до поли(А)-хвоста.',
    'В нашем примере в третьем экзоне есть стоп-кодон УАА. За ним мРНК ещё продолжается. Сборка цепочки аминокислот к этому моменту уже заканчивается.',
  ],
  tail: [
    'Поли(А)-хвост на 3′-конце',
    'Голубые звенья А добавлены к концу РНК.',
    'После разреза клетка добавила к новому 3′-концу цепочку из аденозинов. С ней связываются белки, которые помогают защитить мРНК от разрушения и участвуют в запуске трансляции.',
  ],
};
const completed = SPLICING_INTRONS.length;
const matureBases = basesAfterSplicing(completed);
const partButtons = [...byId('parts').querySelectorAll('button')];
const endButtons = [...byId('markers').querySelectorAll('button')];
const stage = byId('stage');
const selection = byId('selection');
let scene;
let selectedPoint;

function inspect(part, point = part) {
  const [title, note, detail] = parts[part];
  byId('note-title').textContent = title;
  byId('note').textContent = note;
  byId('detail-copy').textContent = detail;
  byId('details').scrollTop = 0;
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
  marker.style.top = `${Math.max(15, Math.min(stage.clientHeight - 15, y + offset))}px`;
}

function updateMarkers() {
  for (const button of endButtons) placeMarker(button, button.dataset.end, -25);
  if (selectedPoint !== undefined) placeMarker(selection, selectedPoint, 0);
}

for (const button of partButtons) {
  const part = button.dataset.part;
  const bases = matureBases.filter(base => base.part === part);
  const index = bases[Math.floor(bases.length / 2)]?.index;
  button.onclick = () => inspect(part, index);
}
for (const button of endButtons) button.onclick = () => inspect(button.dataset.end);

const details = byId('details');
const toggle = byId('details-toggle');
toggle.onclick = () => {
  details.hidden = !details.hidden;
  toggle.setAttribute('aria-expanded', String(!details.hidden));
  toggle.textContent = details.hidden ? 'Подробнее' : 'Свернуть';
};

try {
  scene = createSplicingScene(stage, updateMarkers, index => inspect(RNA_BASES[index].part, index));
  scene.render({ completed, intron: null, progress: 0, marked: [] });
  byId('markers').hidden = false;
} catch (error) {
  byId('model-unavailable').hidden = false;
  console.error(error);
}
