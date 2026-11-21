import { Group, Mesh, SphereGeometry, Vector3 } from 'three';
import { neon } from './style.js';

const WORKING = 'Белок работает';
const INACTIVE = 'Белок выключен';

export function createOlympiadInitiation({ molecule, inspector, controls, fit, frame, animate,
  tell, setActions, setSpots, site, inspectOpening }) {
  const results = document.getElementById('olymp-results');
  const start = molecule.START;
  const observed = new Set();
  let prediction;
  let current;
  const helper = new Group();
  const proteinShape = new SphereGeometry(1, 28, 20);
  const proteinPaint = neon(0xb483e5, { glow: 1.4, body: 0.71 });
  const inactivePaint = neon(0x827f9a, { glow: 0.88, body: 0.76 });
  for (const [x, y, sx, sy, sz] of [[0, 0.03, 0.20, 0.16, 0.14], [0.17, -0.06, 0.13, 0.11, 0.12]]) {
    const shape = new Mesh(proteinShape, proteinPaint);
    shape.position.set(x, y, 0);
    shape.scale.set(sx, sy, sz);
    helper.add(shape);
  }
  molecule.group.add(helper);
  const proteinAnchor = () => helper.position.clone();
  const placeHelper = () => helper.position.copy(molecule.strand(1, start + 5)).add(new Vector3(0, -0.23, -0.18));

  function resetScene(assembled = true) {
    molecule.reset();
    helper.visible = assembled;
    helper.children.forEach(shape => { shape.material = proteinPaint; });
    if (assembled) assemble(1);
    const target = new Vector3(molecule.center(start) + 0.32, -0.05, 0);
    const distance = fit(4.65, 4.20, 1.12);
    frame(target, target.clone().add(new Vector3(0, 0.32, distance)), distance * 0.60, distance * 2.0);
  }

  function assemble(progress) {
    molecule.factors.visible = molecule.polymerase.visible = true;
    molecule.factors.position.lerpVectors(molecule.factorStart, molecule.factorEnd, Math.min(1, progress * 1.6));
    molecule.polymerase.position.lerpVectors(molecule.polStart, molecule.polEnd, progress);
    molecule.polymerase.rotation.y = -0.35 * (1 - progress);
    molecule.layout(0, start, start, progress);
    placeHelper();
  }

  function startLabel(select = () => {}) {
    return site('position-one', '+1', () => molecule.strand(1, start), new Vector3(-0.10, 0.67, 0), select);
  }

  function landmarks(showRna = false) {
    const markers = [
      startLabel(),
      site('opening-protein', 'Белок-помощник', proteinAnchor, new Vector3(-0.08, -0.55, 0),
        () => inspector.explain('olymp-helper', proteinAnchor)),
    ];
    if (showRna) {
      const rna = () => molecule.rnaEnd(false);
      markers.push(site('first-rna', 'Начало РНК', rna, new Vector3(-0.37, -0.65, 0.16),
        () => inspector.explain('rna', rna)));
    }
    setSpots(markers);
  }

  function recordObservations() {
    results.replaceChildren(...[WORKING, INACTIVE].filter(condition => observed.has(condition)).map(condition => {
      const row = document.createElement('div');
      const label = document.createElement('dt');
      const evidence = document.createElement('dd');
      label.textContent = condition;
      evidence.textContent = condition === WORKING
        ? 'ДНК у +1 открыта, короткая РНК появилась.'
        : 'ДНК у +1 закрыта, РНК не появилась.';
      row.append(label, evidence);
      return row;
    }));
    results.hidden = observed.size === 0;
  }

  function startEpisode() {
    observed.clear();
    current = null;
    recordObservations();
    setActions();
    resetScene(false);
    inspector.explain('olymp-promoter', molecule.promoter);
    tell('Найди площадку сборки', 'У начала гена есть две метки. Нажми на участок, к которому подходят полимераза и белки-помощники.');
    setSpots([
      site('olymp-promoter', 'Промотор', molecule.promoter, new Vector3(-0.38, 0.42, 0), bindComplex),
      startLabel(() => tell('У +1 начнётся синтез', 'Метка +1 показывает первое звено ДНК, которое скопируют. Сначала белки собираются на участке рядом. Найди промотор.', 'error')),
    ]);
  }

  async function bindComplex() {
    setSpots();
    controls.enabled = false;
    tell('Комплекс собирается у промотора', 'Промотор помогает расположить фермент так, чтобы начать копирование у +1.');
    await animate(1.35, assemble);
    helper.visible = true;
    controls.enabled = true;
    landmarks();
    inspector.explain('olymp-complex', molecule.startSite);
    tell('Сделай прогноз', 'Комплекс собрался у промотора. Что будет, если выключить один белок-помощник? Выбери, начнётся ли синтез РНК.');
    setActions(['Начнётся', () => compare(true)], ['Не начнётся', () => compare(false)]);
  }

  function compare(answer) {
    prediction = answer;
    showComparison();
  }

  function showComparison() {
    tell('Проверь свой прогноз', 'В двух учебных опытах ДНК и полимераза одинаковые. Меняется только активность одного белка. Сначала посмотри, что происходит у +1.');
    comparisonActions();
  }

  function comparisonActions() {
    setActions([WORKING, () => run(WORKING), current === WORKING],
      [INACTIVE, () => run(INACTIVE), current === INACTIVE],
      observed.size === 2 && ['Сделать вывод', askWhy]);
  }

  async function run(condition) {
    resetScene();
    landmarks();
    setActions();
    controls.enabled = false;
    const works = condition === WORKING;
    inspector.explain('olymp-complex', molecule.startSite);
    tell(condition, 'Следи за меткой +1. Откроется ли участок ДНК? Появится ли розовая РНК?');
    if (works) {
      await animate(1.65, k => {
        molecule.layout(k, start, start, 1);
        placeHelper();
      });
      molecule.setCandidates(start, true);
      const first = molecule.candidates.find(base => base.userData.base === molecule.expected(start));
      const second = molecule.candidates.find(base => base.userData.base === molecule.expected(start + 1));
      molecule.candidates.forEach(base => { base.visible = base === first || base === second; });
      const fromFirst = first.position.clone(), fromSecond = second.position.clone();
      await animate(1.30, (k, t) => {
        molecule.attachPreview(first, fromFirst, start, Math.min(t * 1.7, 1));
        molecule.attachPreview(second, fromSecond, start + 1, Math.max(0, (k - 0.30) / 0.70));
      });
      molecule.setCandidates(start, false);
      molecule.grow(2);
    } else {
      helper.children.forEach(shape => { shape.material = inactivePaint; });
      // Keep the assembled complex in view for the same observation time as the control.
      await animate(2.95, () => {});
    }
    controls.enabled = true;
    current = condition;
    observed.add(condition);
    recordObservations();
    landmarks(works);
    if (works) {
      inspector.explain('bubble', molecule.startSite);
      tell('ДНК открылась, синтез начался', 'Две цепи разошлись у +1. Полимераза получила доступ к матрице и соединила первые два звена РНК.');
    } else {
      inspector.explain('olymp-complex', molecule.startSite);
      tell('Полимераза на месте, РНК нет', 'Цепи у +1 остались вместе. Основания матричной цепи по-прежнему заняты парой с другой цепью.');
    }
    comparisonActions();
  }

  function askWhy() {
    tell('Что делает белок-помощник?', 'Сравни первый результат, который изменился между опытами. За какой шаг отвечает этот белок?');
    setActions(['Помогает раскрыть ДНК', finish], ['Соединяет звенья РНК', () => {
      tell('Посмотри на шаг перед синтезом', 'Во втором опыте полимераза уже на месте. Прежде чем она соединит звенья РНК, ей нужен доступ к одной цепи ДНК. Какой шаг не состоялся?', 'error');
    }], ['К двум опытам', showComparison]);
  }

  function finish() {
    inspector.explain('olymp-helper', proteinAnchor);
    const feedback = prediction ? 'В опыте с выключенным белком синтез не начался.'
      : 'Твой прогноз подтвердился.';
    tell('Доступ к матрице нужен до синтеза', `${feedback} Белок-помощник помогает развести цепи ДНК. Когда матрица открыта, полимераза может собрать по ней начало РНК.`);
    setActions(['Как раскрывается ДНК в 3D', inspectOpening], ['Повторить опыт', startEpisode]);
  }

  return { start: startEpisode };
}
