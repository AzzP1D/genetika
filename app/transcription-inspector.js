import * as THREE from 'three';
import { loadModel } from './organelles.js';
import { neon, textSprite } from './style.js';
import { openTerminationDetail, terminationDetails } from './transcription-termination-detail.js';

const papers = {
  opening: ['He и соавт., Nature (2016)', 'https://pubmed.ncbi.nlm.nih.gov/27193682/'],
  xpb: ['Schilbach и соавт., Nature (2021)', 'https://pubmed.ncbi.nlm.nih.gov/33902107/'],
  motor: ['Перемещение ДНК белком Ssl2 у дрожжей · Fishburn и соавт. (2015)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4386358/'],
  synthesis: ['Cheung и соавт., EMBO J. (2011)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3243610/'],
  elongation: ['Комплекс элонгации · RCSB PDB 5FLM', 'https://www.rcsb.org/structure/5FLM'],
  pas: ['Распознавание ААУААА · Sun и соавт. (2018)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5816196/'],
  termination: ['Терминация Pol II · Eaton и соавт. (2018)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5830926/'],
  slowing: ['Замедление Pol II · Eaton и соавт. (2020)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6938672/'],
  cap: ['Кэпирование растущей РНК · структура комплекса', 'https://www.nature.com/articles/s41467-024-48963-1'],
  polyA: ['Распознавание сигнала полиаденилирования', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4215183/'],
};

const releaseSteps = [
  ['Что замедляет полимеразу?', 'Один из белков помогает полимеразе двигаться вдоль ДНК. После сигнального участка с этого белка снимают фосфатные метки, небольшие химические группы. Полимераза замедляется, и зелёный фермент успевает её догнать.', papers.slowing],
  ['Как зелёный фермент догоняет полимеразу?', 'После разреза у хвоста появляется свободный 5′-конец. Зелёный фермент отщепляет звенья быстрее, чем полимераза добавляет новые. Поэтому РНК между двумя ферментами укорачивается, и зелёный фермент достигает места, где она выходит из полимеразы.', papers.termination],
  ['Почему комплекс распадается?', 'Разбор хвоста у выхода РНК помогает полимеразе отделиться. Синтез прекращается, и спираль ДНК смыкается. Точный ход отделения продолжают изучать. Учебная анимация показывает итог этого процесса.', papers.slowing],
];

const parts = {
  nucleus: ['Ядро', 'Хранит хромосомную ДНК. В ядре работает полимераза II, которая транскрибирует этот ген.'],
  nucleolus: ['Ядрышко', 'Здесь собираются субъединицы рибосом. Наш белок-кодирующий ген нужно найти на нити хроматина.'],
  chromatin: ['Хроматин', 'ДНК и связанные с ней белки. Доступный участок ДНК позволяет комплексу подойти к промотору.'],
  promoter: ['Промотор', 'Участок ДНК, где собирается комплекс инициации. Его положение помогает расположить полимеразу относительно точки +1.', 'dna', papers.opening],
  terminator: ['Терминатор · область завершения', 'Это область ДНК, где работа полимеразы подходит к концу. Для нашего гена сначала освобождается будущая мРНК. Полимераза сходит с ДНК немного позже и дальше по гену.', null, papers.termination,
    'В этом учебном примере показан распространённый путь завершения транскрипции белок-кодирующего гена у млекопитающих. После сигнала в РНК формируется её 3′-конец. Полимераза ещё какое-то время считывает ДНК и затем отделяется. Расстояние между событиями в 3D сокращено.'],
  gene: ['Транскрибируемый участок', 'Эту часть гена полимераза прочитает после старта. Площадка сборки комплекса расположена у промотора.', 'dna', papers.opening],
  factors: ['Факторы транскрипции', 'Это белки-помощники. Они помогают распознать промотор и поставить полимеразу так, чтобы она начала работу в нужном месте. В крупном плане несколько факторов выделены золотым.', 'factors', papers.opening],
  pol: ['РНК-полимераза II', 'Это фермент, который строит РНК. Он удерживает ДНК в своей щели, считывает одну из её цепей и соединяет подходящие нуклеотиды.', 'pol', papers.opening],
  clamp: ['Зажим полимеразы II', 'Подвижная часть фермента помогает удерживать ДНК у щели. В крупном плане можно рассмотреть всю Pol II и положение ДНК в комплексе.', 'pol', papers.opening],
  xpb: ['XPB в составе TFIIH', 'Использует энергию АТФ и перемещает двухцепочечную ДНК относительно комплекса. Возникающее закручивание помогает открыть участок у старта.', 'xpb', papers.xpb],
  'olymp-complex': ['Комплекс у промотора', 'Полимераза и белки-помощники уже заняли свои места на ДНК. Метка +1 показывает, откуда начнётся копирование.', 'mechanism', papers.opening],
  'olymp-promoter': ['Две метки у начала гена', 'Промотор — участок ДНК, где собираются полимераза и белки-помощники. +1 обозначает первое звено ДНК, которое будет скопировано в РНК.', 'dna', papers.opening],
  'olymp-helper': ['Белок, который помогает открыть ДНК', 'Его имя — XPB. Он расходует энергию АТФ, чтобы переместить участок двойной спирали. Это помогает двум цепям разойтись у точки старта. На лупе можно увидеть, где расположен XPB.', 'xpb', papers.motor],
  tfiih: ['Комплекс TFIIH', 'В начале транскрипции его субъединица XPB помогает раскрыть ДНК. В крупном плане XPB выделен отдельно.', 'xpb', papers.xpb],
  bubble: ['Раскрытие ДНК у старта', 'Локально размыкаются водородные связи между основаниями. Сахарофосфатный остов каждой цепи сохраняется.', 'mechanism', papers.xpb],
  start: ['+1 · Точка начала транскрипции', 'Это место первого переписываемого звена ДНК. Напротив него полимераза ставит первое звено РНК. Дальше по ходу фермента идут +2, +3 и так далее. Перед точкой +1 находится −1. Промотор служит площадкой сборки и помогает найти эту точку.', null, papers.opening],
  dna: ['Двойная спираль ДНК', 'Две цепи направлены противоположно. При инициации они расходятся только около точки старта.', 'dna', papers.opening],
  template: ['Матричная цепь', 'Полимераза читает её от 3′ к 5′. Новые нуклеотиды добавляются к 3′-концу РНК, поэтому РНК растёт от 5′ к 3′.', 'dna', papers.synthesis],
  other: ['Нематричная цепь', 'При раскрытии её отводят от активного центра. Для показанного гена она направлена слева направо от 5′ к 3′.', 'dna', papers.opening],
  active: ['Активный центр', 'Здесь полимераза располагает основание матричной ДНК напротив подходящего нуклеотида. В этом месте образуется связь между звеньями РНК.', null, papers.synthesis],
  nucleotide: ['Нуклеотид РНК', 'Строительное звено РНК. Подходящий нуклеотид образует пару с открытым основанием матричной ДНК.', null, papers.synthesis],
  pairing: ['Комплементарность · как подобрать пару', 'Слева основание матричной ДНК, справа подходящее звено РНК. А → У, Т → А, Г → Ц, Ц → Г. В РНК напротив А ставим урацил (У).'],
  rna: ['Растущая РНК', 'Первые нуклеотиды образуют короткий гибрид с матричной ДНК в ферменте. Следующее звено добавляется к 3′-концу РНК.', null, papers.synthesis],
  'film-promoter': ['Полимераза уходит от промотора', 'Фермент отходит от площадки старта и продвигается по ДНК. В полимеразе остаётся 3′-конец растущей РНК.', null, papers.elongation,
    'Промотор помог расположить полимеразу и определить точку +1. Теперь фермент читает матричную цепь дальше, от 3′ к 5′, и удлиняет РНК. Уже собранные звенья образуют начало той же цепочки.'],
  'film-entry': ['ДНК раскрывается перед ферментом', 'Обе цепи входят в транскрипционный пузырь. Одна из них служит образцом для новой РНК.', null, papers.elongation,
    'Цепи расходятся на коротком участке у полимеразы. Связи между основаниями временно размыкаются, а остовы ДНК остаются целыми. Матричная цепь проходит к активному центру. Вторая огибает его, и позади фермента цепи снова образуют пары.'],
  'rna-cap': ['Кэп на 5′-конце', 'Первые звенья РНК уже вышли из полимеразы. Другие ферменты добавляют кэп, пока РНК растёт с 3′-конца.', null, papers.cap,
    'Кэп содержит изменённый гуанозин. Он связан с первым звеном РНК через три фосфатные группы. Эта метка защищает начало мРНК. Позже её узнают белки, которые помогают рибосоме начать трансляцию.'],
  'term-poly-a': ['Новый 3′-конец · поли(А)-хвост', 'Разрез освободил 3′-конец будущей мРНК. Поли(А)-полимераза добавляет звенья А к этому концу.', null, papers.polyA,
    'Сигнал ААУААА помогает выбрать место разреза немного дальше по цепи. Он остаётся внутри РНК. Хвост достраивается из звеньев А без копирования ДНК. С ним связываются белки, которые помогают поддерживать стабильность мРНК. Длина хвоста в анимации сокращена.'],
  'film-active': ['Новое звено присоединяется к 3′-концу', 'Полимераза ставит подходящий нуклеотид напротив основания ДНК и соединяет его с растущей РНК.', null, papers.elongation,
    'Активный центр удерживает основание матричной ДНК и подходящий нуклеозидтрифосфат. Полимераза образует связь с 3′-концом РНК. Затем фермент смещается к следующему основанию, и цикл повторяется. Поэтому цепь растёт 5′ → 3′.'],
  'film-exit': ['РНК выходит из полимеразы', 'Ранняя часть РНК выходит через отдельный канал. ДНК позади фермента снова образует спираль.', null, papers.elongation,
    'Внутри фермента несколько новых звеньев РНК временно образуют пары с матричной ДНК. По мере движения РНК отделяется от матрицы и выходит 5′-концом вперёд. Новые звенья по-прежнему добавляются к 3′-концу внутри фермента. В общем плане воспроизведение ускорено.'],
  'term-signal': ['ААУААА · сигнал на РНК', 'Шесть букв на РНК, по которым белки находят область будущего 3′-конца.', null, papers.pas,
    'У многих белок-кодирующих генов млекопитающих ААУААА — сигнал полиаденилирования. Комплекс CPSF узнаёт его в растущей РНК. Место разреза обычно отстоит примерно на 10–30 нуклеотидов в сторону 3′-конца. После обработки к этому концу добавится поли(А)-хвост.'],
  'term-cpsf': ['Белки, которые узнают сигнал', 'Золотистые белки удерживают участок ААУААА. По нему находят место будущего разреза дальше по РНК.', null, papers.pas,
    'Золотой объект показывает распознающую часть CPSF. В клетке она работает вместе с другими белками. На учебной модели распознающую и режущую части выделили цветом и разнесли по двум местам, где они действуют.'],
  'term-cut': ['Место разреза РНК', 'Сигнал ААУААА остаётся на длинной цепи. Разрез делают дальше в сторону 3′-конца.', null, papers.pas,
    'CPSF73 разрывает одну связь между соседними нуклеотидами РНК. У отделённой цепи образуется новый 3′-конец, а у оставшегося фрагмента появляется новый 5′-конец. Двойная спираль ДНК при этом сохраняется.'],
  'term-cpsf73': ['Фермент, который разрезает РНК', 'Лиловая деталь отмечает часть комплекса, которая разрывает связь между двумя звеньями РНК.', null, papers.termination,
    'Этот фермент называется CPSF73. Он входит в комплекс CPSF, который распознаёт сигнал на РНК и помогает сформировать конец будущей мРНК.'],
  'term-products': ['Два фрагмента после разреза', 'Длинная цепь отделилась. Короткий хвост остался связан с работающей полимеразой.', null, papers.termination,
    'В нашем примере длинная цепь — пре-мРНК, которую ещё нужно обработать. На её новом 3′-конце формируется поли(А)-хвост. Короткий фрагмент с открытым 5′-концом поступает на разбор.'],
  'term-xrn2': ['Фермент, который разбирает хвост РНК', 'Он снимает по одному звену со свободного 5′-конца и постепенно приближается к полимеразе.', null, papers.termination,
    'XRN2 — экзонуклеаза. Это фермент, который снимает звенья с конца цепи. Он работает с короткой РНК, оставшейся у полимеразы после разреза. Когда XRN2 догоняет полимеразу, он помогает ей завершить транскрипцию.'],
  'term-tail-end': ['Открытый 5′-конец', 'После разреза на первом звене хвоста остаётся один фосфат. Он удерживается в кармане зелёного фермента.', null, papers.termination],
  'term-hydrolysis': ['Как отделяется одно звено РНК', 'Фермент с участием воды разрывает связь в остове РНК. Отделившееся звено сохраняет свой фосфат и уходит как свободный нуклеотид.', null, papers.termination,
    'XRN2 действует с конца. После каждого разрыва следующее звено становится крайним и получает открытый 5′-фосфат. Поэтому фермент может повторить реакцию вдоль всей оставшейся цепочки.'],
  'term-whole': ['Пре-мРНК после отделения', 'У цепи есть начало и конец. В учебном примере она ещё содержит экзоны и интроны. Теперь её можно рассмотреть целиком.', null, papers.termination],
  'term-first-end': ['5′-конец пре-мРНК', 'Это начало цепи. Оно появилось напротив точки +1 на ДНК, когда мы запустили транскрипцию.', null, papers.termination],
  'term-final-end': ['3′-конец пре-мРНК', 'Этот конец образовался при разрезе. Именно здесь ферменты добавляют поли(А)-хвост при созревании РНК.', null, papers.termination],
  'term-detach': ['Почему полимераза сходит с ДНК?', 'Полимераза замедляется. Зелёный фермент успевает разобрать хвост до места, где РНК выходит из полимеразы. Это помогает ей отделиться.', null, papers.slowing,
    'Три события связаны между собой. После разреза у XRN2 есть доступ к хвосту, замедление полимеразы позволяет его догнать, а разбор РНК у её выхода способствует отделению фермента.'],
  'term-summary': ['Терминация · два разных места', 'Сравни разрез РНК и сход полимеразы. Пре-мРНК отделилась раньше, а ДНК по всей длине осталась целой.', null, papers.termination,
    'После разреза у пре-мРНК уже есть 3′-конец, и её обработка может продолжаться. Полимераза останавливается дальше. Терминация завершает синтез, а процессинг подготавливает РНК к дальнейшей работе.'],
};

const steps = [
  ['ДНК удерживается', 'Факторы и полимераза собираются у промотора. Две цепи ДНК ещё образуют двойную спираль.', '5IY6', ['dna', 'factors'], papers.opening],
  ['Работа XPB', 'XPB выделен фиолетовым. Используя энергию АТФ, он перемещает участок двойной спирали. Это меняет её закручивание и помогает разойтись парам оснований у старта.', '5IY6', ['xpb', 'dna'], papers.xpb],
  ['Транскрипционный пузырь', 'У старта цепи разошлись, и матричная ДНК доступна активному центру. Две структуры получены методом криоэлектронной микроскопии. Движение между ними показано учебной анимацией.', '5IY7', ['dna'], papers.opening],
];

const meshParts = {
  pic_pol2: ['pol', 0xff728a], pic_factors: ['factors', 0xffd17b], pic_xpb: ['xpb', 0xcaa3ff],
  pic_tfiih: ['tfiih', 0x765ab4], pic_dna_a: ['dna', 0x00e5ff], pic_dna_b: ['dna', 0x71afff],
};

function makeButton(label, action) {
  const button = document.createElement('button');
  button.textContent = label;
  button.type = 'button';
  button.onclick = action;
  return button;
}

const backboneURL = new URL('./models/pol2-pic-dna.json', import.meta.url);
backboneURL.search = new URL(import.meta.url).search;

async function loadBackbones() {
  const response = await fetch(backboneURL);
  if (!response.ok) throw new Error(`Не удалось загрузить координаты ДНК (${response.status})`);
  const data = await response.json();
  const points = pdb => data[pdb].map(strand => strand.map(point => new THREE.Vector3(...point)));
  return { closed: points('5IY6'), open: points('5IY7') };
}

function dnaGuide(points) {
  const anchor = points[0][65];
  const label = textSprite('ДНК', '#7af3ff', 0.34);
  label.position.copy(anchor).add(new THREE.Vector3(0.25, 0.53, 0.26));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([anchor, label.position]),
    new THREE.LineBasicMaterial({ color: 0x7af3ff, depthTest: false, depthWrite: false }),
  );
  line.renderOrder = 9;
  const traces = points.map((strand, i) => {
    const material = new THREE.MeshBasicMaterial({
      color: i ? 0x7fb4ff : 0x5ff4ff, opacity: 0.72,
      transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth,
    });
    const curve = new THREE.CatmullRomCurve3(strand);
    const trace = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.021, 5), material);
    trace.renderOrder = 8;
    return trace;
  });
  const group = new THREE.Group();
  group.add(...traces, line, label);
  return { group, dispose() {
    group.removeFromParent();
    for (const obj of [line, ...traces]) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
    label.material.map.dispose();
    label.material.dispose();
  } };
}

function openingPreview({ closed, open }) {
  const group = new THREE.Group();
  const rod = new THREE.CylinderGeometry(0.038, 0.038, 1, 7);
  const strands = open.map((points, row) => {
    const mesh = new THREE.InstancedMesh(rod, neon(row ? 0x71afff : 0x00e5ff, { body: 0.78, glow: 1.38 }), points.length - 1);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    // Apart from the central opening the traces have the same shape. Match the
    // two exterior sections, and resample the central section to show the motion.
    const [left, right] = row ? [20, 52] : [30, 62];
    const added = points.length - closed[row].length;
    const closedCurve = new THREE.CatmullRomCurve3(closed[row]);
    const start = points.map((_, i) => {
      const offset = THREE.MathUtils.clamp((i - left) / (right - left), 0, 1) * added;
      return closedCurve.getPoint((i - offset) / (closed[row].length - 1));
    });
    return { mesh, start, points };
  });
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const axis = new THREE.Vector3(), midpoint = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), matrix = new THREE.Matrix4();
  return { group, render(gap) {
    for (const { mesh, start, points } of strands) {
      a.lerpVectors(start[0], points[0], gap);
      for (let i = 1; i < points.length; i++) {
        b.lerpVectors(start[i], points[i], gap);
        axis.subVectors(b, a);
        const length = axis.length();
        midpoint.copy(a).lerp(b, 0.5);
        rotation.setFromUnitVectors(up, axis.normalize());
        scale.set(1, length + 0.018, 1);
        mesh.setMatrixAt(i - 1, matrix.compose(midpoint, rotation, scale));
        a.copy(b);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, dispose() {
    group.removeFromParent();
    rod.dispose();
    for (const { mesh } of strands) { mesh.material.dispose(); mesh.dispose(); }
  } };
}

export function createTranscriptionInspector({ scene, camera, controls, fit, frame, animate, canOpen }) {
  const card = document.getElementById('part-info');
  const magnifier = document.getElementById('part-zoom');
  const back = document.getElementById('part-return');
  const content = document.getElementById('detail-content');
  const panels = document.getElementById('detail-controls');
  const sources = document.getElementById('detail-sources');
  const models = new Map();
  let picked, session, backboneData;

  function backbones() {
    backboneData ??= loadBackbones().catch(error => { backboneData = null; throw error; });
    return backboneData;
  }

  function explain(id, at = null) {
    const info = parts[id];
    if (!info) return;
    picked = { id, at, info };
    document.getElementById('part-title').textContent = info[0];
    document.getElementById('part-copy').textContent = info[1];
    card.hidden = false;
    magnifier.hidden = !!session || (!at && !info[2]);
  }

  function clear() { picked = null; card.hidden = true; }

  function caption(title, text, pdb, paper) {
    document.getElementById('detail-title').textContent = title;
    document.getElementById('detail-copy').textContent = text;
    const entries = [pdb && [`RCSB PDB ${pdb}`, `https://www.rcsb.org/structure/${pdb}`], paper].filter(Boolean);
    sources.replaceChildren(...entries.map(([label, link]) => {
      const a = document.createElement('a');
      a.textContent = label;
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return a;
    }));
  }

  async function experimental(pdb) {
    if (!models.has(pdb)) {
      models.set(pdb, loadModel(`pol2-pic-${pdb.toLowerCase()}`).then(group => {
        group.rotation.x = Math.PI / 2;
        const items = [];
        group.traverse(obj => {
          if (!obj.isMesh) return;
          const entry = meshParts[obj.material.name];
          if (!entry) return;
          const [id, color] = entry;
          items.push({ obj, id, bright: neon(color, {body: 0.78, glow: 1.38}),
            dim: new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.18, depthWrite: false}) });
        });
        if (items.length !== 6) throw new Error(`В ${pdb} отсутствуют компоненты структуры`);
        return { group, items };
      }).catch(error => { models.delete(pdb); throw error; }));
    }
    return models.get(pdb);
  }

  async function fitBox(bounds, close, duration = 0, draw = null) {
    const size = bounds.getSize(new THREE.Vector3());
    const target = bounds.getCenter(new THREE.Vector3());
    const d = fit(Math.max(1, size.x), Math.max(0.75, size.y), close ? 1.42 : 1.20) + size.z * 0.40;
    const position = target.clone().add(new THREE.Vector3(0, 0, d));
    if (duration) {
      const start = camera.position.clone(), center = controls.target.clone();
      controls.minDistance = 0.16;
      controls.maxDistance = Math.max(controls.maxDistance, d * 2.5);
      await animate(duration, k => {
        camera.position.lerpVectors(start, position, k);
        controls.target.lerpVectors(center, target, k);
        draw?.(k);
      });
    }
    frame(target, position, d * 0.48, d * 2.5);
  }

  function showExperiment(view, featured, isolate = false, focus = null) {
    session.view?.group.removeFromParent();
    session.group.visible = false;
    scene.fog = null;
    scene.add(view.group);
    session.view = view;
    const emphasis = new THREE.Box3();
    view.group.updateMatrixWorld(true);
    for (const item of view.items) {
      const selected = featured.includes(item.id);
      item.obj.visible = !isolate || selected;
      item.obj.material = selected ? item.bright : item.dim;
      if (selected) emphasis.expandByObject(item.obj);
    }
    const focusPart = focus && view.items.find(item => item.id === focus);
    const overview = session.overview || new THREE.Box3().setFromObject(view.group);
    if (session.picked.info[2] === 'mechanism') session.overview = overview;
    return focusPart ? new THREE.Box3().setFromObject(focusPart.obj).expandByScalar(0.46)
      : isolate ? emphasis : overview;
  }

  async function mechanismStep(step) {
    if (!session || session.waiting || session.step === step) return;
    const current = session;
    current.waiting = true;
    const [title, copy, pdb, roles, paper] = steps[step];
    const from = current.step;
    const alreadyOpen = controls.enabled;
    back.disabled = true;
    controls.enabled = false;
    for (const button of panels.children) button.disabled = true;
    try {
      const view = await experimental(pdb);
      if (from !== undefined && (from === 2 || step === 2)) {
        const motion = openingPreview(await backbones());
        caption(step === 2 ? 'Цепи ДНК расходятся' : 'Возврат к закрытой спирали',
          'Учебный переход между двумя экспериментальными состояниями. Следи за двумя голубыми линиями в центре.', null, papers.opening);
        for (const item of current.view.items) {
          if (item.id === 'dna') item.obj.visible = false;
        }
        motion.render(from === 2 ? 1 : 0);
        scene.add(motion.group);
        try {
          await fitBox(current.overview, false, 2.4, k => motion.render(step === 2 ? k : 1 - k));
        } finally {
          motion.dispose();
          for (const item of current.view.items) {
            if (item.id === 'dna') item.obj.visible = true;
          }
        }
      }
      const bounds = showExperiment(view, roles, false, step === 1 ? 'xpb' : null);
      const duration = from === undefined || (step === 2 || (from === 2 && step === 0)) ? 0 : 1;
      await fitBox(bounds, false, duration);
      current.step = step;
      caption(title, copy, pdb, paper);
    } catch (error) {
      const previous = steps[current.step];
      if (previous) caption(previous[0], `${previous[1]} Переход пока недоступен. Выбери состояние ещё раз.`, previous[2], previous[4]);
      else caption(title, `${copy} Модель пока не загрузилась.`, pdb, paper);
      console.error(error);
    } finally {
      current.waiting = false;
      back.disabled = false;
      controls.enabled = alreadyOpen;
      for (const [i, button] of [...panels.children].entries()) {
        button.disabled = false;
        button.setAttribute('aria-pressed', String(i === current.step));
      }
    }
  }

  async function open(group, forceMechanism = false, local = false) {
    if (!picked || !group || session || !canOpen()) return;
    const { info, at, id } = picked;
    if (forceMechanism && info[2] !== 'mechanism') return;
    const saved = { group, picked, position: camera.position.clone(), target: controls.target.clone(),
      near: controls.minDistance, far: controls.maxDistance, minAz: controls.minAzimuthAngle,
      maxAz: controls.maxAzimuthAngle, fog: scene.fog };
    session = saved;
    controls.enabled = false;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minDistance = 0.16;
    back.hidden = false;
    back.disabled = true;
    magnifier.hidden = true;
    content.hidden = false;
    document.body.classList.add('inspecting');
    panels.replaceChildren();
    caption(info[0], info[1], null, info[3]);
    try {
      const anchor = typeof at === 'function' ? at() : at;
      if (anchor) {
        const direction = saved.position.clone().sub(saved.target).normalize();
        const distance = saved.position.distanceTo(saved.target) * 0.5;
        const near = anchor.clone().addScaledVector(direction, Math.max(0.65, local ? Math.min(5.2, distance) : distance));
        await animate(0.60, k => {
          camera.position.lerpVectors(saved.position, near, k);
          controls.target.lerpVectors(saved.target, anchor, k);
        });
      }
      if (terminationDetails.has(id)) {
        saved.termination = await openTerminationDetail(id, { scene, fitBox, caption, panels, back, animate, makeButton });
        saved.group.visible = false;
        scene.fog = null;
      } else if (id === 'term-detach') {
        const extra = document.createElement('details');
        extra.className = 'detail-extra';
        const prompt = document.createElement('summary');
        prompt.textContent = 'Какие белки участвуют?';
        const answer = document.createElement('p');
        answer.textContent = 'SPT5 помогает полимеразе двигаться по ДНК. Фермент PP1 снимает с SPT5 фосфатные метки, и движение полимеразы замедляется. Зелёный фермент, который догоняет её по хвосту РНК, называется XRN2.';
        extra.append(prompt, answer);
        const topics = ['Замедление', 'Разбор РНК', 'Сход фермента'];
        const tabs = topics.map((label, index) => makeButton(label, () => explainRelease(index)));
        function explainRelease(index) {
          const [title, copy, reference] = releaseSteps[index];
          caption(title, copy, null, reference);
          for (const [i, button] of tabs.entries()) button.setAttribute('aria-pressed', String(i === index));
          extra.hidden = index !== 0;
        }
        panels.replaceChildren(...tabs, extra);
        explainRelease(0);
      } else if (local) {
        caption(info[0], info[4] || info[1], null, info[3]);
      } else if (info[2] === 'mechanism') {
        panels.replaceChildren(...['Удержание ДНК', 'Работа XPB', 'Раскрытая ДНК'].map((label, i) => makeButton(label, () => mechanismStep(i))));
        await mechanismStep(0);
      } else if (info[2]) {
        const pdb = '5IY7';
        const structure = await experimental(pdb);
        const showDNA = info[2] === 'pol';
        const featured = showDNA ? ['pol', 'dna'] : [info[2]];
        const isolate = ['pol', 'factors', 'xpb'].includes(info[2]) && id !== 'tfiih';
        await fitBox(showExperiment(structure, featured, isolate), isolate);
        if (showDNA) {
          saved.guide = dnaGuide((await backbones()).open);
          scene.add(saved.guide.group);
        }
        caption(info[0], showDNA
          ? 'Две голубые линии показывают путь цепей ДНК по экспериментальным координатам. Тонкая подсветка позволяет увидеть участки, скрытые за поверхностью фермента.'
          : 'Упрощённая поверхность по экспериментальным координатам человеческого комплекса. Модель можно вращать.', pdb, info[3]);
      } else {
        caption(info[0], `Крупный план учебной модели. ${info[1]}`, null, info[3]);
      }
    } catch (error) {
      caption(info[0], `Открыт крупный план учебной модели. ${info[1]}`, null, info[3]);
      console.error(error);
    } finally {
      back.disabled = false;
      controls.enabled = true;
    }
  }

  function close() {
    if (!session) return;
    const saved = session;
    session = null;
    saved.termination?.dispose();
    saved.guide?.dispose();
    saved.view?.group.removeFromParent();
    scene.fog = saved.fog;
    saved.group.visible = true;
    controls.minAzimuthAngle = saved.minAz;
    controls.maxAzimuthAngle = saved.maxAz;
    frame(saved.target, saved.position, saved.near, saved.far);
    document.body.classList.remove('inspecting');
    content.hidden = back.hidden = true;
    explain(saved.picked.id, saved.picked.at);
    if (!magnifier.hidden) magnifier.focus();
  }

  function pick(ray) {
    if (session?.termination) {
      session.termination.pick(ray);
      return;
    }
    const items = session?.view?.items.filter(item => item.obj.visible) || [];
    const hit = ray.intersectObjects(items.map(item => item.obj), false)[0];
    if (hit) explain(items.find(item => item.obj === hit.object).id);
  }

  return { explain, clear, open, pick, get active() { return !!session; }, magnifier, close };
}
