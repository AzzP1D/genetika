import * as THREE from 'three';
import { bio, PALETTE, textSprite } from './style.js';

// Финал урока: две новые молекулы ДНК спирализуются в хромосому
// из двух сестринских хроматид, затем вопрос «Зачем клетке удваивать ДНК?».

const SEGS = 700;
const ease = x => x * x * (3 - 2 * x);

const QUESTION = {
  text: 'Зачем клетке удваивать ДНК?',
  options: [
    ['protein', 'Чтобы синтезировать белок'],
    ['division', 'Перед делением — чтобы каждая дочерняя клетка получила полный набор ДНК'],
    ['repair', 'Чтобы заменить повреждённую ДНК'],
    ['growth', 'Чтобы клетка выросла'],
  ],
  answer: 'division',
  hints: {
    protein: 'Это частая путаница. Для синтеза белка ДНК не удваивается: с гена снимается копия — иРНК (транскрипция). Белки клетка синтезирует постоянно, даже если не делится.',
    repair: 'Повреждения исправляют ферменты репарации — они заменяют небольшой участок, а не копируют всю ДНК.',
    growth: 'Клетка растёт за счёт синтеза веществ. Удвоение ДНК само по себе клетку не увеличивает.',
  },
};

// Ось хроматиды: в начале — длинная вытянутая молекула, в конце — плечо буквы «X».
function axes(k) {
  const sx = k ? 1 : -1;
  const loose = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx * 0.55, 3.6, 0), new THREE.Vector3(sx * 0.7, 1.8, 0.2),
    new THREE.Vector3(sx * 0.5, 0, -0.1), new THREE.Vector3(sx * 0.68, -1.8, 0.15), new THREE.Vector3(sx * 0.52, -3.6, 0),
  ]);
  const tight = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx * 0.95, 2.45, 0), new THREE.Vector3(sx * 0.32, 1.0, 0),
    new THREE.Vector3(sx * 0.13, 0, 0), new THREE.Vector3(sx * 0.3, -0.95, 0), new THREE.Vector3(sx * 0.8, -2.25, 0),
  ]);
  return [loose, tight];
}

export function createChromosome(ui, { onNext }) {
  const group = new THREE.Group();

  const mats = [bio(PALETTE.dna), bio(PALETTE.newDna)];
  const chromatids = [0, 1].map(k => {
    const [loose, tight] = axes(k);
    // Две цепи каждой молекулы: материнская и новая.
    const strands = [0, 1].map(s => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mats[s]);
      group.add(m);
      return m;
    });
    return { k, loose, tight, strands };
  });

  const Z = new THREE.Vector3(0, 0, 1), P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();

  // Строит форму при степени упаковки c (0 — молекула ДНК, 1 — хроматида).
  function build(c) {
    const coilR = 0.27 * c, turns = 34, tube = 0.018 + 0.05 * c;
    for (const ch of chromatids) {
      const pts = [[], []];
      for (let j = 0; j <= SEGS; j++) {
        const u = j / SEGS;
        A.copy(ch.loose.getPointAt(u)); B.copy(ch.tight.getPointAt(u));
        P.copy(A).lerp(B, c);
        const T = ch.loose.getTangentAt(u).lerp(ch.tight.getTangentAt(u), c).normalize();
        N.crossVectors(T, Z).normalize();
        const th = u * turns * Math.PI * 2;
        P.addScaledVector(N, coilR * Math.cos(th)).addScaledVector(Z, coilR * Math.sin(th));
        // Две цепи двойной спирали вокруг общей линии.
        const tw = u * (70 - 40 * c) * Math.PI * 2, r = 0.05 + 0.02 * c;
        for (let s = 0; s < 2; s++) {
          const a = tw + s * Math.PI;
          pts[s].push(P.clone().addScaledVector(N, r * Math.cos(a)).addScaledVector(Z, r * Math.sin(a)));
        }
      }
      ch.strands.forEach((m, s) => {
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts[s]), SEGS * 2, tube, 6, false);
        m.geometry.dispose();
        m.geometry = geo;
      });
    }
  }
  build(0);

  const labels = [
    [textSprite('Сестринская хроматида', '#8eeef4', 0.3), new THREE.Vector3(-1.55, 1.9, 0.5)],
    [textSprite('Сестринская хроматида', '#8eeef4', 0.3), new THREE.Vector3(1.55, -1.75, 0.5)],
    [textSprite('Центромера', '#ffd23f', 0.3), new THREE.Vector3(1.25, 0.1, 0.4)],
  ];
  for (const [sp, pos] of labels) { sp.position.copy(pos); sp.visible = false; group.add(sp); }

  let morph = null;   // { t, seconds, done }

  function intro() {
    ui.hud('<b>Упаковка ДНК</b><span>Перед вами две новые молекулы ДНК. В каждой одна цепь материнская (бирюзовая), другая — новая (оранжевая).</span>');
    ui.label('Перед делением клетки ДНК вместе с белками сильно спирализуется — укорачивается и утолщается.');
    ui.buttons([{ text: 'Упаковать', primary: true, onClick: () => { ui.buttons([]); ui.label(null); morph = { t: 0, seconds: 4, done: afterPack }; } }]);
  }

  function afterPack() {
    labels.forEach(([sp]) => { sp.visible = true; });
    ui.hud('<b>Хромосома</b><span>Получилась хромосома из двух сестринских хроматид, соединённых в области центромеры.</span>');
    ui.label('Каждая хроматида — одна молекула ДНК, построенная полуконсервативно. Хроматиды одинаковы, потому что новые цепи достраивались по принципу комплементарности.');
    ui.buttons([{ text: 'Далее', primary: true, onClick: ask }]);
  }

  function ask() {
    ui.hud('<b>Вопрос</b><span>' + QUESTION.text + '</span>');
    ui.label(null);
    ui.buttons(QUESTION.options.map(([id, text]) => ({ text, onClick: () => answer(id, text) })), 'column');
  }

  function answer(id, text) {
    if (id !== QUESTION.answer) return ui.label('<b class="err">«' + text + '» — нет.</b><br>' + QUESTION.hints[id]);
    ui.label('<b class="ok">Верно!</b><br>ДНК удваивается в интерфазе (S-период), до деления. Во время митоза сестринские хроматиды разойдутся, и каждая дочерняя клетка получит точную копию наследственной информации.');
    ui.hud('<b>Урок пройден!</b><span>Репликация ДНК: от клетки до хромосомы.</span>');
    onNext();
  }

  function update(dt, t) {
    if (morph) {
      morph.t = Math.min(1, morph.t + dt / morph.seconds);
      build(ease(morph.t));
      if (morph.t === 1) { const d = morph.done; morph = null; d(); }
    }
    group.rotation.y = 0.18 * Math.sin(t * 0.4);
  }

  return { group, update, intro, focus: new THREE.Vector3(0, 0, 0) };
}
