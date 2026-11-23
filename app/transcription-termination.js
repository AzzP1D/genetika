import * as THREE from 'three';
import { TERMINATION } from './transcription-preview-molecule.js';
import { neon, textSprite } from './style.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const { signal, cut, initial, release } = TERMINATION;

export function createTermination({ molecule, asset, camera, controls, fit, frame, animate, inspector,
  tell, setSpots, setActions, goal, site, restartLesson, onComplete }) {
  const group = new THREE.Group();
  const protein = (name, color, scale) => {
    const model = asset.getObjectByName(`GEO-${name}`);
    if (!model) throw new Error(`В модели терминации отсутствует ${name}`);
    model.material = neon(color, { glow: 1.52, body: 0.77 });
    model.rotation.x = Math.PI / 2;
    model.scale.multiplyScalar(scale);
    group.add(model);
    return model;
  };
  const recognizer = protein('CPSF', 0xffbd62, 1.03);
  const cutter = protein('CPSF73', 0xd2a5ff, 0.91);
  const xrn2 = protein('XRN2', 0x8bdca0, 0.97);
  const actors = [[recognizer, 'term-cpsf'], [cutter, 'term-cpsf73'], [xrn2, 'term-xrn2']];
  const atom = new THREE.SphereGeometry(1, 14, 10);
  const phosphatePaint = neon(0xffc974, {glow: 1.65, body: 0.81});
  const productPaint = neon(0xf555bf, {glow: 1.42, body: 0.78});
  const phosphate = new THREE.Mesh(atom, phosphatePaint);
  phosphate.scale.setScalar(0.088);
  group.add(phosphate);
  const nmp = new THREE.Group();
  const base = new THREE.Mesh(atom, productPaint);
  base.scale.setScalar(0.138);
  nmp.add(base);
  const productP = new THREE.Mesh(atom, phosphatePaint);
  productP.scale.setScalar(0.075);
  productP.position.set(-0.15, 0.05, 0.04);
  nmp.add(productP);
  const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.15, 10), productPaint);
  bond.position.set(-0.075, 0.025, 0.02);
  bond.quaternion.setFromUnitVectors(v(0, 1, 0), productP.position.clone().normalize());
  nmp.add(bond);
  const fragments = Array.from({ length: 5 }, () => {
    const shape = nmp.clone();
    group.add(shape);
    return { shape, birth: -1, origin: new THREE.Vector3() };
  });
  const freedLabel = textSprite('Нуклеотид вышел', '#ffc1e8', 0.22);
  group.add(freedLabel);
  molecule.group.add(group);

  const state = { count: initial, showSignal: true, separation: 0, eaten: 0, departure: 0 };
  const signalPoint = () => molecule.rnaBase(signal + 2).lerp(molecule.rnaBase(signal + 3), 0.5);
  const cutPoint = () => molecule.rnaBase(cut - 1).lerp(molecule.rnaBase(cut), 0.5);
  const freeEnd = () => molecule.rnaBase(cut - 1);
  const tailEnd = () => molecule.rnaBase(cut);
  const freeEndLabel = v(-0.28, 0.42, 0.26);
  const dna = index => () => molecule.strand(1, molecule.START + index);
  const polymerase = () => molecule.filmLandmark('active');
  let cutAt, stopAt, polyAStart;

  function draw() {
    molecule.drawTermination(state.count, state);
    const index = cut + Math.floor(state.eaten);
    phosphate.visible = state.separation > 0.4 && index < Math.floor(state.count);
    if (phosphate.visible) {
      const tip = molecule.rnaBase(index);
      phosphate.position.copy(tip).add(v(-0.18, 0.05, 0.15));
    }
  }
  function task(title, copy) { setActions(); setSpots(); tell(title, copy); }
  function retry(title, copy) { tell(title, copy, 'error'); }

  function reset() {
    for (const [shape] of actors) shape.visible = false;
    for (const {shape} of fragments) shape.visible = false;
    freedLabel.visible = phosphate.visible = false;
    Object.assign(state, { count: initial, separation: 0, eaten: 0, departure: 0 });
    molecule.beginTermination();
  }

  function view(a, b = a, minWidth = 4.6) {
    const target = a.clone().lerp(b, 0.5);
    target.y = THREE.MathUtils.lerp(target.y, -0.77, 0.54);
    const width = Math.max(minWidth, Math.abs(b.x - a.x) + 2.25);
    const height = Math.max(3.9, Math.abs(b.y - a.y) + 2.5);
    const distance = fit(width, height, 1.06);
    return { target, eye: target.clone().add(v(0.24, 0.50, distance)), distance };
  }

  async function move(a, b, minWidth, duration, update) {
    const start = camera.position.clone(), center = controls.target.clone();
    const next = view(a, b, minWidth);
    controls.enabled = false;
    controls.minDistance = 0.65;
    controls.maxDistance = Math.max(controls.maxDistance, next.distance * 2.2);
    await animate(duration, (k, t) => {
      update?.(k, t);
      controls.target.lerpVectors(center, next.target, k);
      camera.position.lerpVectors(start, next.eye, k);
    });
    frame(next.target, next.eye, 0.68, next.distance * 2.15);
    controls.enabled = true;
  }

  function spot(id, label, point, offset, action) {
    return site(`termination-${id}`, label, point, offset, action);
  }

  function actor(shape, label, action, offset = v(0, -0.62, 0.22)) {
    return goal(`termination-${shape.name}`, label, () => shape.position.clone().add(offset), action, shape);
  }

  function start() {
    const replay = molecule.opening.copied !== signal;
    reset();
    state.count = signal;
    draw();
    if (replay) {
      const next = view(polymerase(), polymerase().add(v(-4, 0, 0)), 7.5);
      frame(next.target, next.eye, 0.68, next.distance * 2.15);
    }
    task('Что такое терминатор?', 'Это область ДНК, в которой полимераза заканчивает работу. У нашего гена сначала формируется конец будущей мРНК, а фермент отделяется позже. Начни с поиска сигнала, который запускает подготовку к разрезу.');
    inspector.explain('terminator', polymerase);
    setActions(['Найти сигнал на РНК', approachSignal]);
  }

  async function approachSignal() {
    task('Полимераза продолжает считывать ДНК', 'На растущей РНК появляются шесть сигнальных букв. Камера переместится к этому участку.');
    state.count = initial;
    draw();
    const predicted = signalPoint();
    state.count = signal;
    draw();
    await move(predicted, predicted.clone().add(v(3, 0, 0)), 7.2, 3.3, (_, t) => {
      state.count = THREE.MathUtils.lerp(signal, initial, t);
      draw();
    });
    locateSignal();
  }

  function locateSignal() {
    task('Найди сигнал на новой РНК', 'Полимераза уже переписала сигнальный участок. На РНК ищи шесть букв ААУААА. Белки используют этот сигнал, чтобы найти место разреза чуть дальше.');
    inspector.explain('term-signal', signalPoint);
    setSpots([
      spot('pas', 'ААУААА', signalPoint, v(0, -0.72, 0.25), selectRecognizer),
      spot('other-rna', 'ГУЦУГГ', () => molecule.rnaBase(signal + 8), v(0, -0.72, 0.25),
        () => retry('Это тоже РНК', 'В этой модели сигнал состоит из букв ААУААА. Сравни две последовательности.')),
      spot('dna', 'Участок ДНК', dna(signal + 4), v(0, 0.54, 0.24),
        () => retry('Сигнал ищем на копии', 'Сигнальный участок записан в ДНК. Комплекс распознаёт его в уже синтезированной РНК.')),
    ]);
  }

  async function selectRecognizer() {
    recognizer.visible = true;
    recognizer.position.copy(signalPoint()).add(v(1.24, -0.68, 0.28));
    task('Выбери белки, которые узнают сигнал', 'Золотистые белки находят нужные шесть звеньев на РНК. По этому сигналу клетка определяет, где сформировать конец будущей мРНК.');
    inspector.explain('term-cpsf', () => recognizer.position.clone());
    await move(signalPoint(), recognizer.position, 5.1, 0.75);
    setSpots([actor(recognizer, 'Белки распознавания', selectBindingSite, v(0, -0.43, 0.22))]);
  }

  function selectBindingSite() {
    task('Куда поставить белки распознавания?', 'Найди сигнал на РНК. Связавшись с ним, белки помогают найти место разреза дальше по цепи.');
    setSpots([
      spot('bind-pas', 'К сигналу ААУААА', signalPoint, v(0, -0.58, 0.26), bindRecognizer),
      spot('bind-dna', 'На ДНК', dna(signal + 4), v(0, 0.54, 0.24),
        () => retry('Сигнал узнают на РНК', 'Фуксиевая цепь содержит нужный сигнал. Найди ААУААА на ней.')),
    ]);
  }

  async function bindRecognizer() {
    task('Белки закрепляются у сигнала', 'Золотистая часть удерживает ААУААА. Другая часть того же комплекса разрежет РНК дальше по цепи.');
    const from = recognizer.position.clone(), end = signalPoint().add(v(0, 0.37, -0.13));
    await animate(0.95, k => recognizer.position.lerpVectors(from, end, k));
    await move(signalPoint(), cutPoint(), 7.5, 1.45);
    task('Где разрезать РНК?', 'Сигнал остался на цепи. Найди участок немного дальше в направлении 3′-конца. Здесь фермент разорвёт связь между двумя звеньями РНК.');
    inspector.explain('term-cut', cutPoint);
    setSpots([
      spot('at-signal', 'У сигнала', signalPoint, v(0, -0.66, 0.23),
        () => retry('ААУААА — ориентир', 'Комплекс узнаёт эти шесть букв, а разрез делает дальше по той же цепи.')),
      spot('at-bond', 'Дальше по РНК', cutPoint, v(0, -0.65, 0.28), cutRNA),
      spot('wrong-strand', 'На ДНК', dna(cut), v(0, 0.50, 0.24),
        () => retry('ДНК остаётся целой', 'Фермент разрезает связь между соседними звеньями РНК. Выбери место на фуксиевой цепи.')),
    ]);
  }

  async function cutRNA() {
    cutAt = cutPoint();
    const near = cutAt.clone().add(v(0.12, 0.58, 0.06));
    cutter.position.copy(near).add(v(0.35, 0.7, 0.35));
    cutter.visible = true;
    task('Лиловый фермент разделяет цепь', 'Смотри на связь у лилового белка. Длинный фрагмент получит свободный 3′-конец. Полимераза пока удерживает короткий фрагмент и продолжает синтез.');
    inspector.explain('term-cpsf73', () => cutter.position.clone());
    await move(cutAt.clone().add(v(-0.74, -0.63, 0.18)), polymerase().add(v(1.08, 0, 0)), 7.6, 1.02);
    const from = cutter.position.clone();
    await animate(0.85, k => cutter.position.lerpVectors(from, near, k));
    molecule.splitTranscript();
    await animate(2.15, k => {
      state.separation = k;
      state.count = initial + k * 2;
      draw();
    });
    recognizer.visible = cutter.visible = false;
    await move(freeEnd().add(v(-0.5, 0, 0)), polymerase(), 7.9, 0.75);
    selectProduct();
  }

  function selectProduct() {
    task('Какая РНК пойдёт на созревание?', 'Разрез создал два фрагмента. Сравни длинную отделившуюся цепь и короткий хвост, который ещё тянется от полимеразы.');
    inspector.explain('term-products', freeEnd);
    setSpots([
      spot('product', 'Отделившаяся РНК', freeEnd, freeEndLabel, introducePolyA),
      spot('tail', 'Хвост у полимеразы', tailEnd, v(0.56, 0.82, 0.15),
        () => retry('Этот фрагмент остаётся у фермента', 'Его первый нуклеотид теперь имеет свободный 5′-конец. Для созревания нужна цепь, которая уже отделилась.')),
    ]);
  }

  async function introducePolyA() {
    polyAStart = state.count;
    task('У будущей мРНК появился новый 3′-конец',
      'Справа полимераза ещё работает с другим фрагментом. Проследи, что происходит с той цепью, которая уже отделилась.');
    inspector.explain('term-poly-a', freeEnd);
    await move(signalPoint(), freeEnd().add(v(1.4, 0, 0)), 7.0, 0.85);
    task('Где вырастет поли(А)-хвост?', 'Найди свободный конец, к которому фермент сможет присоединить первое звено А.');
    const wrong = () => retry('ААУААА — сигнал внутри РНК',
      'Белки используют его как ориентир для разреза. Хвост вырастет на образовавшемся 3′-конце чуть дальше по цепи.');
    setSpots([
      spot('poly-a-end', 'Свободный 3′-конец', freeEnd, freeEndLabel, addPolyA),
      spot('poly-a-signal', 'Сигнал ААУААА', signalPoint, v(0, 0.58, 0.30), wrong),
    ]);
    setActions(['На свободном 3′-конце', addPolyA], ['На сигнале ААУААА', wrong]);
  }

  async function addPolyA() {
    molecule.setPolyA(0);
    task('Поли(А)-полимераза достраивает конец',
      'Следи за голубыми звеньями. Фермент добавляет одно А за другим к свободному концу отделившейся РНК.');
    await animate(3.8, (_, time) => {
      state.count = polyAStart + time * 2;
      draw();
      molecule.setPolyA(time);
    }, 'Кадры роста поли(А)-хвоста');
    task('Поли(А)-хвост вырос после разреза',
      'Сигнал ААУААА остался внутри цепи. Голубой хвост на 3′-конце помогает будущей мРНК дольше сохраняться. У полимеразы остался другой фрагмент. Посмотри, что с ним произойдёт.');
    setSpots([spot('poly-a', 'Поли(А)-хвост', () => molecule.tailSite(), v(0.2, 0.54, 0.3),
      () => inspector.explain('term-poly-a', () => molecule.tailSite()))]);
    setActions(['К фрагменту у полимеразы', async () => {
      task('Возвращаемся к полимеразе', 'Она ещё удерживает короткий фрагмент РНК. У него после разреза появился свободный 5′-конец.');
      await move(freeEnd(), polymerase(), 8.7, 0.85);
      introduceXrn2();
    }], ['Повторить рост хвоста', addPolyA]);
  }

  function introduceXrn2() {
    xrn2.visible = true;
    xrn2.position.copy(tailEnd()).add(v(0.47, 1.11, 0.7));
    task('Кто разберёт оставшийся хвост РНК?', 'Отделившаяся цепь пойдёт на созревание. Зелёный фермент разбирает короткий хвост по одному звену, начиная со свободного 5′-конца.');
    inspector.explain('term-xrn2', () => xrn2.position.clone());
    setSpots([actor(xrn2, 'Зелёный фермент', selectTailEnd, v(-0.25, 0.62, 0.22))]);
  }

  function selectTailEnd() {
    task('С какого конца фермент начнёт разбор?', 'Разрез дал длинной цепи новый 3′-конец, а короткому фрагменту у полимеразы — новый 5′-конец. Выбери нужный конец.');
    setSpots([
      spot('product-3', '3′ отделившейся РНК', freeEnd, freeEndLabel,
        () => retry('Это 3′-конец будущей мРНК', 'Ферменту нужен свободный 5′-конец. Проследи короткий фрагмент у полимеразы.')),
      spot('tail-5', '5′ хвоста', tailEnd, v(0.48, 0.62, 0.18), bindXrn2),
    ]);
  }

  async function bindXrn2() {
    task('Фермент узнаёт фосфат на 5′-конце', 'Золотая метка показывает фосфат на краю хвоста. Когда он входит в карман белка, первое звено оказывается рядом с местом, где будет разорвана связь.');
    const from = xrn2.position.clone();
    const contact = tailEnd().add(v(-0.18, 0.13, 0.18));
    await animate(1, k => xrn2.position.lerpVectors(from, contact, k));
    const openChemistry = () => {
      inspector.explain('term-tail-end', tailEnd);
      inspector.open(molecule.group, false, true);
    };
    inspector.explain('term-tail-end', tailEnd);
    setActions(['Как связывается фосфат?', openChemistry], ['Разобрать первое звено', () => firstHydrolysis(openChemistry)]);
  }

  function showProduct(shape, from, age) {
    shape.visible = age > 0 && age <= 1;
    shape.position.copy(from).add(v(-0.31 * age, -0.78 * age, 0.56 * age));
    shape.rotation.z = -0.45 * age;
    shape.scale.setScalar(0.78 + 0.22 * Math.sin(Math.PI * age));
  }

  async function firstHydrolysis(openChemistry) {
    task('Как отделяется одно звено?', 'Вода участвует в разрыве связи между соседними нуклеотидами. Одно звено выходит из фермента целиком. На оставшейся цепи открывается следующий 5′-фосфат.');
    inspector.explain('term-hydrolysis', tailEnd);
    const origin = tailEnd();
    await move(origin.clone().add(v(0, -0.42, 0.33)), molecule.rnaBase(cut + 3), 4.65, 0.9);
    const product = fragments[0].shape;
    await animate(2.35, k => {
      state.eaten = k;
      draw();
      const leave = THREE.MathUtils.smoothstep(k, 0.25, 1);
      showProduct(product, origin, leave);
      freedLabel.visible = leave > 0.50;
      freedLabel.position.copy(product.position).add(v(-0.18, -0.28, 0.13));
      const head = molecule.rnaBase(cut + 1).lerp(origin, 1 - k);
      xrn2.position.copy(head).add(v(-0.18, 0.12, 0.18));
    });
    tell('Следующее звено стало крайним', 'Отделившийся нуклеотид вышел. Фермент уже у нового 5′-конца и может повторить тот же шаг.');
    setActions(['Рассмотреть связь', openChemistry], ['Проследить разбор хвоста', chase]);
  }

  async function chase() {
    task('Кто движется быстрее?', 'После сигнального участка полимераза замедляется. Зелёный фермент отщепляет звенья быстрее, чем полимераза добавляет новые. Хвост между ними становится короче.');
    inspector.explain('term-xrn2', () => xrn2.position.clone());
    freedLabel.visible = false;
    for (const fragment of fragments) { fragment.shape.visible = false; fragment.birth = -1; }
    await move(molecule.rnaBase(cut + 1), polymerase(), 8.75, 0.95);
    const count = state.count;
    const center = camera.position.clone(), target = controls.target.clone();
    const shift = (release - count) * (molecule.center(1) - molecule.center(0));
    let nextFragment = 0;
    let removed = Math.floor(state.eaten);
    controls.enabled = false;
    await animate(5.8, (k, time) => {
      state.count = THREE.MathUtils.lerp(count, release, 1 - Math.pow(1 - time, 2.6));
      const amount = state.count - cut;
      state.eaten = 1 + (amount - 1) * k;
      while (removed < Math.floor(state.eaten)) {
        const fragment = fragments[nextFragment++ % fragments.length];
        fragment.origin.copy(molecule.rnaBase(cut + removed++));
        fragment.birth = time;
      }
      draw();
      for (const fragment of fragments) {
        if (fragment.birth < 0) continue;
        const age = 0.03 + (time - fragment.birth) * 6.7;
        showProduct(fragment.shape, fragment.origin, age);
      }
      const head = Math.min(Math.floor(state.count) - 1, cut + Math.floor(state.eaten));
      const next = Math.min(Math.floor(state.count) - 1, head + 1);
      const marker = molecule.rnaBase(head).lerp(molecule.rnaBase(next), state.eaten % 1);
      marker.lerp(molecule.filmLandmark('rna-exit'), THREE.MathUtils.smoothstep(k, 0.80, 1));
      xrn2.position.copy(marker).add(v(-0.16, 0.12, 0.20));
      camera.position.copy(center).add(v(shift * k, 0, 0));
      controls.target.copy(target).add(v(shift * k, 0, 0));
    });
    for (const {shape} of fragments) shape.visible = false;
    controls.enabled = true;
    stopAt = polymerase();
    await move(stopAt, stopAt, 5.1, 0.85);
    task('Почему полимераза завершает работу?', 'Зелёный фермент разобрал хвост до выхода РНК. После этого полимераза легче отделяется от ДНК. Рассмотри причины или выбери, что отделится.');
    inspector.explain('term-detach', polymerase);
    setActions(['Почему она сходит?', showReasons]);
    setSpots([
      actor(molecule.polymerase, 'Полимераза II', detach, v(0.28, -0.36, 0.5)),
      spot('dna-stays', 'Двойная спираль', dna(release - 1), v(-0.43, 0.76, 0.41),
        () => retry('ДНК остаётся в ядре', 'Считывание прекращает коралловый фермент. Покажи, что отделится от двойной спирали.')),
    ]);
  }

  async function detach() {
    task('Полимераза сходит с ДНК', 'Фермент дошёл до выхода РНК и помог полимеразе отделиться. Она перестала удерживать цепи ДНК раздельно, и они снова образовали спираль.');
    await animate(2.15, k => {
      state.departure = k;
      draw();
      xrn2.position.copy(molecule.filmLandmark('rna-exit')).add(v(-0.25, -0.33 * k, 0.22));
    });
    xrn2.visible = false;
    await compareEvents();
  }

  function showReasons() {
    inspector.explain('term-detach', () => stopAt.clone());
    inspector.open(molecule.group, false, true);
  }

  async function compareEvents() {
    setActions();
    setSpots();
    await move(cutAt.clone().add(v(-2.15, -0.37, 0)), stopAt, 10.5, 1.12);
    summary();
  }

  function summary() {
    onComplete();
    task('Транскрипция завершилась', 'Полимераза сошла с ДНК. У отделившейся РНК уже есть кэп и поли(А)-хвост. В показанном примере осталось убрать интроны.');
    inspector.explain('term-summary', () => cutAt.clone().lerp(stopAt, 0.5));
    setSpots([
      spot('compare-cut', 'Разрез РНК', () => cutAt.clone(), v(0, -0.71, 0.24),
        () => inspector.explain('term-products', freeEnd)),
      spot('compare-stop', 'Сход полимеразы', () => stopAt.clone(), v(0, 0.77, 0.32),
        () => inspector.explain('term-detach', () => stopAt.clone())),
    ]);
    setActions(['Почему она сходит?', showReasons], ['Вся пре-мРНК', wholeProduct], ['К сплайсингу', openSplicing],
      ['Повторить терминацию', start], ['К началу урока', restartLesson]);
  }

  async function wholeProduct() {
    task('Пре-мРНК с кэпом и поли(А)-хвостом', 'Рассмотри оба конца цепи. Дальше сплайсосома соединит экзоны и уберёт интроны.');
    const first = () => molecule.rnaBase(0);
    const start = first(), end = freeEnd();
    await move(start, end, Math.abs(end.x - start.x) + 8.5, 1.35);
    inspector.explain('term-whole', freeEnd);
    setSpots([
      spot('whole-5', 'Кэп · 5′', () => molecule.capSite(), v(1.05, -0.75, 0.33),
        () => inspector.explain('rna-cap', () => molecule.capSite())),
      spot('whole-3', 'Поли(А) · 3′', () => molecule.tailSite(), v(-1.05, -0.75, 0.33),
        () => inspector.explain('term-poly-a', () => molecule.tailSite())),
    ]);
    setActions(['К сплайсингу', openSplicing], ['Сравнить два места', compareEvents]);
  }

  function openSplicing() {
    location.href = 'rna-splicing.html';
  }

  function inspect(ray) {
    for (const [shape, info] of actors) {
      if (shape.visible && ray.intersectObject(shape, true).length) {
        inspector.explain(info, () => shape.position.clone());
        return true;
      }
    }
    return false;
  }

  reset();
  return { start, reset, inspect };
}
