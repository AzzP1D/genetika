import * as THREE from 'three';
import { loadModel } from './organelles.js';
import { neon, textSprite } from './style.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const colors = { term_cpsf160: 0xeab46f, term_wdr33: 0xffd08c, term_cpsf30: 0xd9a4ff,
  term_rna: 0xff5fbf, term_rat1: 0x83d6a6, term_rai1: 0x6eb0c0 };
export const terminationDetails = new Set(['term-cpsf', 'term-signal', 'term-xrn2', 'term-tail-end']);
const cpsfPaper = ['Sun и соавт., PNAS (2018)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5816196/'];
const ratPaper = ['Yanagisawa и соавт., Nature Communications (2024)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11381523/'];

export async function openTerminationDetail(id, { scene, fitBox, caption, panels, back, animate, makeButton }) {
  const cpsf = id === 'term-cpsf' || id === 'term-signal';
  const pdb = cpsf ? '6DNH' : '8YFQ';
  const structure = (await loadModel(`termination-${pdb.toLowerCase()}`)).clone(true);
  structure.rotation.x = Math.PI / 2;
  structure.updateMatrixWorld(true);
  const group = new THREE.Group();
  const resources = [];
  const use = resource => { resources.push(resource); return resource; };
  const tag = (text, color, at, owner = group, height = 0.19) => {
    const label = textSprite(text, color, height);
    use(label.material.map);
    use(label.material);
    label.position.copy(at);
    owner.add(label);
    return label;
  };
  const landmark = index => structure.getObjectByName(`term_rna_${index}`).getWorldPosition(new THREE.Vector3());
  const selected = new Map();
  structure.traverse(mesh => {
    if (!mesh.isMesh || !(mesh.material.name in colors)) return;
    const name = mesh.material.name;
    selected.set(name, mesh);
    mesh.material = use(neon(colors[name], {glow: 1.30, body: 0.78}));
    if (name === 'term_rna') {
      mesh.material.depthTest = false;
      mesh.material.depthWrite = false;
      mesh.renderOrder = 3;
    }
  });
  const anatomy = new THREE.Group();
  group.add(structure, anatomy);
  const anatomyBounds = new THREE.Box3().setFromObject(structure);
  const anatomyCenter = anatomyBounds.getCenter(new THREE.Vector3());
  let chemistry, busy = false, pickable = new Map();
  const atomGeometry = use(new THREE.SphereGeometry(1, 16, 10));
  function bead(owner, paint, at, radius) {
    const mesh = new THREE.Mesh(atomGeometry, paint);
    mesh.position.copy(at);
    mesh.scale.setScalar(radius);
    owner.add(mesh);
    return mesh;
  }
  function buttons(items) {
    panels.replaceChildren(...items.map(([label, action]) => makeButton(label, () => {
      if (!busy) action();
    })));
  }
  async function motion(duration, draw) {
    busy = true;
    back.disabled = true;
    for (const button of panels.children) button.disabled = true;
    try { await animate(duration, draw); }
    finally {
      busy = false;
      back.disabled = false;
      for (const button of panels.children) button.disabled = false;
    }
  }

  function focusCPSF(signal = false) {
    anatomy.visible = signal;
    pickable = new Map([[selected.get('term_rna'), () => focusCPSF(true)]]);
    const bounds = signal ? new THREE.Box3().setFromPoints([0,1,2,3,4,5].map(landmark)).expandByScalar(0.57)
      : anatomyBounds;
    fitBox(bounds, true);
    if (signal) caption('Как CPSF узнаёт ААУААА',
      'Фуксиевая цепь лежит между WDR33 и CPSF30. Эти две части касаются оснований и вместе узнают последовательность. CPSF160 служит опорой. Вырезанный сигнал виден в структуре, место разреза РНК находится дальше по цепи.', pdb, cpsfPaper);
    else caption('Распознающая часть CPSF',
      'Поверхности построены по крио-ЭМ структуре человеческого комплекса. CPSF160 и WDR33 показаны золотистым, CPSF30 — сиреневым. Камеру можно вращать. Нажми «Распознавание ААУААА», чтобы увидеть участок РНК между белками.', pdb, cpsfPaper);
    buttons([['Весь комплекс', () => focusCPSF()], ['Распознавание ААУААА', () => focusCPSF(true)]]);
  }

  function showRat1() {
    structure.visible = anatomy.visible = true;
    if (chemistry) chemistry.group.visible = false;
    pickable = new Map([[endPhosphate, showFormula]]);
    fitBox(anatomyBounds, true);
    caption('Rat1 · дрожжевой аналог XRN2',
      'Зелёный Rat1 и голубой белок Rai1 выделены из экспериментального комплекса с полимеразой. Фуксия показывает наблюдаемый путь РНК, золото — фосфор на её 5′-конце. Поверни модель, чтобы рассмотреть, куда входит одноцепочечная РНК.', pdb, ratPaper);
    buttons([['Как связывается 5′-конец', showFormula]]);
  }

  function showFormula() {
    chemistry ??= buildFormula();
    structure.visible = anatomy.visible = false;
    chemistry.group.visible = true;
    chemistry.draw(0, 0);
    pickable = new Map([[chemistry.firstPhosphate, bind], [chemistry.firstBase, explainBase]]);
    fitBox(new THREE.Box3(V(-4, -1.7, -0.92), V(3.36, 2.02, 0.58)), false);
    caption('Найди 5′-фосфат РНК',
      'Учебная формула. Пятиугольники — рибоза, фуксия — основания, золотой P с красными O — фосфат. После разреза первый нуклеотид короткой РНК несёт один концевой фосфат. Что войдёт в карман фермента?', null, ratPaper);
    buttons([['5′-фосфат', bind], ['Основание', explainBase], ['Структура Rat1', showRat1]]);
  }

  function explainBase() {
    caption('Основание остаётся частью нуклеотида',
      'Фуксиевая метка обозначает основание. Начало для XRN2 задаёт фосфат на конце сахарофосфатной цепи. Найди золотой атом фосфора у 5′.', null, ratPaper);
  }

  async function bind() {
    pickable = new Map();
    caption('Фосфат входит в карман',
      'Расположение заряженных участков белка помогает удержать отрицательно заряженный монофосфат у входа. Первое звено оказывается у активного центра. Движение между положениями показано схематически.', null, ratPaper);
    await motion(1.45, k => chemistry.draw(k, 0));
    pickable = new Map([[chemistry.cut, hydrolyze]]);
    buttons([['Разобрать одно звено', hydrolyze], ['Повторить связывание', showFormula], ['Структура Rat1', showRat1]]);
  }

  async function hydrolyze() {
    pickable = new Map();
    caption('Фермент разрывает связь с помощью воды',
      'XRN2 расщепляет связь в остове между первым и вторым звеньями. Это гидролиз: вода участвует в реакции. Проследи, как первое звено отделяется целиком.', null, ratPaper);
    await motion(2.3, k => chemistry.draw(1, k));
    caption('Первое звено вышло, следующее стало крайним',
      'Отделившееся звено — свободный нуклеотид с одним фосфатом (НМФ). На цепи открылся следующий 5′-фосфат. Фермент смещается к нему и повторяет тот же шаг вдоль РНК.', null, ratPaper);
    buttons([['Повторить разбор', showFormula], ['Структура Rat1', showRat1]]);
  }

  function buildFormula() {
    const formula = new THREE.Group();
    group.add(formula);
    const p = use(neon(0xffb953, {body: 0.82, glow: 1.40}));
    const o = use(neon(0xff7d83, {body: 0.82, glow: 1.16}));
    const c = use(neon(0x70d6f4, {body: 0.74, glow: 1.12}));
    const base = use(neon(0xf660c2, {body: 0.75, glow: 1.42}));
    const bondPaint = use(new THREE.MeshBasicMaterial({color: 0x7899ab}));
    const cutPaint = use(new THREE.MeshBasicMaterial({color: 0xffcb85}));
    const link = use(new THREE.CylinderGeometry(0.032, 0.032, 1, 9));
    const up = V(0, 1, 0);
    function cylinder(owner, from, to, material = bondPaint) {
      const rod = new THREE.Mesh(link, material);
      rod.position.copy(from).lerp(to, 0.5);
      rod.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
      rod.scale.y = from.distanceTo(to);
      owner.add(rod);
      return rod;
    }
    const rna = new THREE.Group();
    formula.add(rna);
    const coords = {
      P: V(-0.94, 0, 0), OP1: V(-1.01, 0.23, 0.13), OP2: V(-1.01, -0.20, 0.15),
      OP3: V(-1.14, -0.03, -0.12), O5: V(-0.73, 0.08, 0), C5: V(-0.51, 0.28, 0),
      C4: V(-0.27, 0.24, 0), O4: V(-0.06, 0.46, 0), C1: V(0.23, 0.30, 0),
      C2: V(0.15, -0.01, 0), C3: V(-0.16, -0.07, 0), O2: V(0.25, -0.24, 0.15),
      O3: V(0.14, -0.45, -0.10), base: V(0.57, 0.51, 0.06),
    };
    const sites = [-1.25, 0.74, 2.73].map((x, index) => {
      const unit = new THREE.Group();
      unit.position.x = x;
      rna.add(unit);
      const atoms = {};
      for (const [key, point] of Object.entries(coords)) {
        if (key === 'OP3') continue;
        const paint = key === 'P' ? p : key[0] === 'O' ? o : key === 'base' ? base : c;
        atoms[key] = bead(unit, paint, point, key === 'base' ? 0.17 : key === 'P' ? 0.125 : 0.084);
      }
      for (const [a, b] of [['P','OP1'],['P','OP2'],['P','O5'],['O5','C5'],['C5','C4'],['C4','O4'],['O4','C1'],
        ['C1','C2'],['C2','C3'],['C3','C4'],['C2','O2'],['C3','O3'],['C1','base']]) cylinder(unit, coords[a], coords[b]);
      const terminalOxygen = new THREE.Group();
      unit.add(terminalOxygen);
      bead(terminalOxygen, o, coords.OP3, 0.084);
      cylinder(terminalOxygen, coords.P, coords.OP3);
      terminalOxygen.visible = index === 0;
      return {unit, x, terminalOxygen, atoms};
    });
    const point = (index, key) => coords[key].clone().add(V(sites[index].x, 0, 0));
    const cut = cylinder(rna, point(0, 'O3'), point(1, 'P'), cutPaint);
    cylinder(rna, point(1, 'O3'), point(2, 'P'));
    const phosphate = tag('5′-фосфат', '#ffdda1', point(0, 'P').add(V(-0.10, 0.62, 0.25)), rna, 0.35);
    const released = tag('Свободный НМФ', '#ffb9e7', V(-0.09, -0.82, 0.24), sites[0].unit, 0.34);
    const next = tag('Новый 5′-фосфат', '#ffd591', point(1, 'P').add(V(0.30, 0.86, 0.29)), rna, 0.33);
    const water = tag('H₂O', '#a9eeff', V(0, 0, 0.2), rna, 0.30);
    const cutCenter = point(0,'O3').lerp(point(1,'P'), 0.5);
    const section = tag('Разрываемая связь', '#ffdfa6', cutCenter.clone().add(V(0.14, -0.55, 0.28)), rna, 0.28);
    const pocket = new THREE.Group();
    const shell = selected.get('term_rat1').clone();
    selected.get('term_rat1').matrixWorld.decompose(shell.position, shell.quaternion, shell.scale);
    shell.material = use(new THREE.MeshBasicMaterial({color: 0x64b995, transparent: true, opacity: 0.42, depthWrite: false}));
    pocket.add(shell);
    formula.add(pocket);
    const target = point(0, 'P').sub(landmark(0));
    const bindingSpot = tag('Карман фермента', '#b2f4ca', landmark(0).add(V(-0.05, 1.20, 0.43)), pocket, 0.33);
    return { group: formula, firstPhosphate: sites[0].atoms.P, firstBase: sites[0].atoms.base, cut, draw(dock, reaction) {
      pocket.position.copy(target).add(V(-0.91 * (1 - dock), 0.72 * (1 - dock), -0.17 + 0.12 * dock));
      bindingSpot.visible = dock > 0.2;
      phosphate.visible = reaction < 0.45;
      const cutAt = 0.47;
      const leave = THREE.MathUtils.smoothstep(reaction, cutAt, 1);
      sites[0].unit.position.set(sites[0].x - 0.59 * leave, -1.18 * leave, 0.20 * leave);
      sites[0].unit.rotation.z = -0.40 * leave;
      cut.visible = reaction < cutAt;
      section.visible = dock >= 1 && reaction < cutAt;
      water.visible = reaction > 0.02 && reaction < cutAt;
      water.position.copy(cutCenter).add(V(0, 1.3 * (1 - reaction / cutAt), 0.32));
      sites[1].terminalOxygen.visible = reaction >= cutAt;
      released.visible = leave > 0.60;
      next.visible = leave > 0.60;
    } };
  }

  function callout(label, color, from, to) {
    const line = new THREE.Line(use(new THREE.BufferGeometry().setFromPoints([from, to])),
      use(new THREE.LineBasicMaterial({color, depthTest: false, depthWrite: false})));
    line.renderOrder = 8;
    anatomy.add(line);
    tag(label, color, to, anatomy, 0.18);
  }

  let endPhosphate;
  if (cpsf) {
    const center = landmark(0).lerp(landmark(5), 0.55);
    const markerPaint = use(neon(0xffce88, {body: 0.80, glow: 1.10}));
    for (let i = 0; i < 6; i++) bead(anatomy, markerPaint, landmark(i), 0.058);
    callout('РНК · ААУААА', '#ff96d6', center, center.clone().add(V(0, 0.59, 0.33)));
    const components = [['term_wdr33', 'WDR33', '#ffd28b', V(0.43, 0.00, 0.34)],
      ['term_cpsf30', 'CPSF30', '#e5beff', V(-0.29, -0.38, 0.30)]];
    for (const [name, label, color, offset] of components) {
      const at = new THREE.Box3().setFromObject(selected.get(name)).getCenter(new THREE.Vector3());
      at.lerp(center, 0.55).add(offset);
      callout(label, color, at.clone().sub(offset), at);
    }
    focusCPSF(id === 'term-signal');
  } else {
    const at = landmark(0);
    endPhosphate = bead(anatomy, use(neon(0xffc06a, {body: 0.84, glow: 1.32})), at, 0.095);
    callout('5′-фосфат', '#ffdb9f', at, at.clone().add(V(0.18, 0.48, 0.28)));
    tag('Rat1', '#b6f4cc', anatomyCenter.clone().add(V(-0.29, -0.52, 0.94)), anatomy, 0.28);
    if (id === 'term-tail-end') showFormula();
    else showRat1();
  }
  scene.add(group);
  return {
    pick(ray) {
      if (busy) return;
      const hit = ray.intersectObjects([...pickable.keys()], false)[0];
      if (hit) pickable.get(hit.object)();
    },
    dispose() { group.removeFromParent(); for (const resource of resources) resource.dispose(); },
  };
}
