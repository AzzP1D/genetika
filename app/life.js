import * as THREE from 'three';
import { neon, PALETTE } from './style.js';

// «Жизнь клетки» в обзоре атласа: процессы, которые связывают органоиды. Играет один,
// выбранный в панели:
//   «Путь белка» — иРНК выходит из ядра через пору → на рибосомах шероховатой ЭПС синтезируется
//   белок → транспортный пузырёк везёт его к аппарату Гольджи → секреторный пузырёк едет по
//   микротрубочке к мембране → экзоцитоз;
//   «Пиноцитоз» — мембрана впячивается и захватывает каплю жидкости → пиноцитозный пузырёк
//   уходит вглубь клетки → сливается с лизосомой → ферменты расщепляют вещества до мономеров;
//   «Рельсы» — кинезины везут пузырьки к краю клетки, динеины — к центру, едет митохондрия;
//   «Энергия» — митохондрии синтезируют АТФ, он расходится по клетке, тратится и возвращается АДФ;
//   «Всё» — все четыре процесса одновременно, каждый в своём ритме (так клетка и живёт).
// Строка-репортаж (status) называет этап и объясняет, что происходит.

const PROTEIN = [
  { t: 3.5, head: 'ТРАНСКРИПЦИЯ · в ядре синтезируется иРНК',
    detail: 'По гену в ДНК собирается копия — молекула иРНК (розовая).' },
  { t: 7, head: 'ЭКСПОРТ · иРНК выходит через ядерную пору',
    detail: 'Сам ген остаётся в ядре, наружу уходит только его копия.' },
  { t: 11.5, head: 'ТРАНСЛЯЦИЯ · рибосомы шероховатой ЭПС собирают белок',
    detail: 'Белок «на экспорт» сразу попадает в полость ЭПС (зелёный).' },
  { t: 16, head: 'ТРАНСПОРТ · пузырёк несёт белок к аппарату Гольджи',
    detail: 'Пузырёк отпочковывается от ЭПС и сливается с цис-стороной Гольджи.' },
  { t: 20, head: 'ДОЗРЕВАНИЕ · аппарат Гольджи достраивает и сортирует белок',
    detail: 'С транс-стороны отпочковывается секреторный пузырёк.' },
  { t: 26, head: 'ПО «РЕЛЬСАМ» · пузырёк едет по микротрубочке к мембране',
    detail: 'Его везёт белок-мотор кинезин — к плюс-концу, к краю клетки.' },
  { t: 30, head: 'ЭКЗОЦИТОЗ · пузырёк сливается с мембраной',
    detail: 'Белок выходит из клетки — так выделяются гормоны, ферменты, антитела.' },
];
const PINO = [
  { t: 5, head: 'ПИНОЦИТОЗ · мембрана впячивается',
    detail: 'Клетка «пьёт»: участок мембраны прогибается внутрь и захватывает каплю жидкости с растворёнными веществами.' },
  { t: 8.5, head: 'ПУЗЫРЁК · края впячивания смыкаются',
    detail: 'Образуется пиноцитозный пузырёк — капля, окружённая мембраной.' },
  { t: 14, head: 'ВНУТРЬ КЛЕТКИ · пузырёк идёт к лизосоме',
    detail: 'Пузырёк отрывается от мембраны и уходит вглубь цитоплазмы.' },
  { t: 18, head: 'СЛИЯНИЕ · пузырёк сливается с лизосомой',
    detail: 'Получается вторичная лизосома: ферменты встречаются с захваченными веществами.' },
  { t: 24, head: 'ПЕРЕВАРИВАНИЕ · ферменты расщепляют вещества',
    detail: 'Белки — до аминокислот, полисахариды — до моносахаридов; мономеры выходят в цитоплазму.' },
];
const RAILS = [
  { t: 8, head: 'К КРАЮ · кинезины везут грузы к плюс-концам',
    detail: 'Плюс-концы микротрубочек — у мембраны. Кинезин шагает к ним и везёт пузырьки (розовые) к краю клетки.' },
  { t: 16, head: 'К ЦЕНТРУ · динеины везут грузы к минус-концам',
    detail: 'Минус-концы собраны в клеточном центре. Динеин везёт пузырьки (голубые) внутрь клетки.' },
  { t: 24, head: 'МИТОХОНДРИИ В ПУТИ · их тоже перевозят моторы',
    detail: 'Каждая митохондрия едет по своей микротрубочке к краю клетки и обратно.' },
];
const ENERGY = [
  { t: 6, head: 'В ПУТЬ · митохондрии едут по микротрубочкам',
    detail: 'Моторы везут их туда, где клетке нужно больше энергии, — ближе к краю клетки.' },
  { t: 10, head: 'КЛЕТОЧНОЕ ДЫХАНИЕ · в митохондриях синтезируется АТФ',
    detail: 'Органические вещества окисляются кислородом, а энергия запасается в АТФ — кристы «вспыхивают».' },
  { t: 15, head: 'ДОСТАВКА · АТФ разносится по клетке',
    detail: 'Жёлтые искры — сами молекулы АТФ. Через мембрану митохондрии их выпускает белок-транслоказа, а по цитоплазме они расходятся сами, диффузией.' },
  { t: 19, head: 'РАБОТА · АТФ → АДФ + фосфат',
    detail: 'АТФ отдаёт концевой фосфат (белая точка) и становится АДФ (голубая). Энергия этой связи идёт на синтез белка, насосы мембраны, шаги моторов.' },
  { t: 26, head: 'ДОМОЙ · АДФ и фосфат возвращаются в митохондрии',
    detail: 'Это та же молекула — в митохондрии она снова соединяется с фосфатом: АДФ + Ф → АТФ. Молекула «перезаряжается», как аккумулятор.' },
];
const PROCESSES = {
  protein: { name: 'Путь белка', stages: PROTEIN, cycle: 32 },
  pino: { name: 'Пиноцитоз', stages: PINO, cycle: 26 },
  rails: { name: 'Рельсы', stages: RAILS, cycle: 25 },
  energy: { name: 'Энергия', stages: ENERGY, cycle: 27 },
};

export function createLife(cell) {
  const group = new THREE.Group();
  group.visible = false;
  const nuc = cell.parts.nucleus.objects[0];
  const C = nuc.userData.base.clone(), R = nuc.scale.x;              // центр и радиус ядра
  const G = cell.parts.golgi.objects[0].userData.base.clone();       // аппарат Гольджи
  const toG = G.clone().sub(C).normalize();

  // Ядерная пора, обращённая к аппарату Гольджи: вершина части nuc_pore, ближайшая к нему.
  nuc.updateMatrixWorld(true);
  let pore = null, best = Infinity;
  const v = new THREE.Vector3();
  nuc.traverse(o => {
    if (!o.isMesh || o.userData.part !== 'nuc_pore') return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 7) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const d = v.distanceTo(G);
      if (d < best) { best = d; pore = v.clone(); }
    }
  });
  pore ||= C.clone().addScaledVector(toG, R);
  const inside = C.clone().addScaledVector(pore.clone().sub(C).normalize(), R * 0.45);   // место «гена» в ядре
  const out = C.clone().addScaledVector(pore.clone().sub(C).normalize(), R * 1.12);       // сразу за порой
  const er = C.clone().addScaledVector(toG, R * 1.35);                                      // поверхность шероховатой ЭПС
  const erOut = C.clone().addScaledVector(toG, R * 1.8);                                    // край ЭПС
  const cis = G.clone().addScaledVector(toG, -0.55);                                       // цис-сторона — к ядру
  const trans = G.clone().addScaledVector(toG, 0.55);                                      // транс-сторона

  // Микротрубочка, которая ведёт от Гольджи к мембране: её конец ближе всего по направлению «от ядра через Гольджи».
  const curves = cell.parts.cytoskeleton.objects[0].userData.mt || [];
  let track = null, score = -Infinity;
  for (const c of curves) {
    const end = c.getPoint(1), s = end.clone().sub(G).normalize().dot(toG) - end.distanceTo(G) * 0.05;
    if (s > score) { score = s; track = c; }
  }
  // Ближайшая к транс-стороне точка выбранной микротрубочки — там пузырёк «садится на рельсы».
  let u0 = 0;
  if (track) { let d0 = Infinity; for (let u = 0; u <= 1; u += 0.02) { const d = track.getPoint(u).distanceTo(trans); if (d < d0) { d0 = d; u0 = u; } } }
  const exitPoint = track ? track.getPoint(1) : trans.clone().addScaledVector(toG, 1.5);

  // Участники: иРНК, белок, пузырьки, выброшенный наружу белок и кольцо-маркер «смотри сюда».
  const ball = (r, color, opts) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), neon(color, opts)); group.add(m); return m; };
  const mrna = ball(0.06, PALETTE.primer, { glow: 2.4, body: 1.0 });
  const protein = ball(0.05, 0x7dff5a, { glow: 2.4, body: 1.0 });
  const vesER = ball(0.15, 0x2f6bff, { glass: true, glow: 2.0, power: 2.5, body: 0, strength: 0.9 });
  const vesG = ball(0.17, 0xff5ab4, { glass: true, glow: 2.0, power: 2.5, body: 0, strength: 0.9 });
  const spill = [...Array(7)].map(() => ball(0.035, 0x7dff5a, { glow: 2.4, body: 1.0 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.27, 40), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  ring.renderOrder = 10;
  group.add(ring);
  const proteinParts = [mrna, protein, vesER, vesG, ...spill];
  const spillDir = spill.map((_, i) => new THREE.Vector3(Math.sin(i * 2.4), Math.cos(i * 1.7), Math.sin(i * 3.1)).normalize());
  const outward = exitPoint.clone().normalize();

  const lerp = (a, b, f) => a.clone().lerp(b, Math.min(1, Math.max(0, f)));
  const ease = f => { f = Math.min(1, Math.max(0, f)); return f * f * (3 - 2 * f); };
  let local = 0, current = 'protein';
  const clocks = { protein: 0, pino: 7, rails: 3, energy: 11 };   // «Всё»: у каждого процесса свои часы, вразнобой
  const focusPos = new THREE.Vector3();   // где сейчас главный участник — за ним может следить камера

  function updateProtein(c) {
    let focus = null;
    if (c < 3.5) {                         // транскрипция: иРНК «вырастает» у гена
      mrna.visible = true; mrna.position.copy(inside); mrna.scale.setScalar(0.3 + 0.7 * ease(c / 3)); focus = mrna;
    } else if (c < 7) {                    // к поре и наружу
      const f = ease((c - 3.5) / 3.5);
      mrna.visible = true; mrna.scale.setScalar(1);
      mrna.position.copy(f < 0.7 ? lerp(inside, pore, f / 0.7) : lerp(pore, out, (f - 0.7) / 0.3)); focus = mrna;
    } else if (c < 11.5) {                 // к ЭПС; там рибосомы синтезируют белок
      const f = (c - 7) / 4.5;
      mrna.visible = true; mrna.position.copy(lerp(out, er, ease(f / 0.4)));
      protein.visible = f > 0.4; protein.position.copy(er).addScaledVector(toG, 0.08); protein.scale.setScalar(ease((f - 0.4) / 0.6));
      focus = mrna;
    } else if (c < 16) {                   // транспортный пузырёк: от ЭПС к цис-стороне Гольджи
      const f = ease((c - 11.5) / 4.5);
      vesER.visible = protein.visible = true;
      vesER.position.copy(f < 0.25 ? lerp(er, erOut, f / 0.25) : lerp(erOut, cis, (f - 0.25) / 0.75));
      vesER.scale.setScalar(f < 0.1 ? f / 0.1 : 1);
      protein.position.copy(vesER.position); protein.scale.setScalar(1); focus = vesER;
    } else if (c < 20) {                   // в Гольджи: сливается, потом от транс-стороны отпочковывается новый
      const f = (c - 16) / 4;
      if (f < 0.4) {
        vesER.visible = protein.visible = true;
        vesER.position.copy(lerp(cis, G, f / 0.4)); vesER.scale.setScalar(1 - f / 0.4 * 0.8);
        protein.position.copy(vesER.position);
      } else {
        vesG.visible = protein.visible = true;
        vesG.position.copy(lerp(G, trans, (f - 0.4) / 0.6)); vesG.scale.setScalar(ease((f - 0.4) / 0.6));
        protein.position.copy(vesG.position);
      }
      focus = f < 0.4 ? vesER : vesG;
    } else if (c < 26) {                   // по микротрубочке к мембране
      const f = ease((c - 20) / 6);
      vesG.visible = protein.visible = true; vesG.scale.setScalar(1);
      vesG.position.copy(track ? (f < 0.15 ? lerp(trans, track.getPoint(u0), f / 0.15) : track.getPoint(u0 + (1 - u0) * (f - 0.15) / 0.85)) : lerp(trans, exitPoint, f));
      protein.position.copy(vesG.position); focus = vesG;
    } else if (c < 30) {                   // экзоцитоз: пузырёк сплющивается в мембрану, белок выходит наружу
      const f = (c - 26) / 4;
      vesG.visible = f < 0.5; vesG.position.copy(exitPoint); vesG.scale.set(1 + f, Math.max(0.05, 1 - f * 2), 1 + f);
      vesG.lookAt(exitPoint.clone().add(outward));
      spill.forEach((s, i) => {
        s.visible = f > 0.3;
        s.position.copy(exitPoint).addScaledVector(outward, ease((f - 0.3) / 0.7) * 0.8).addScaledVector(spillDir[i], ease((f - 0.3) / 0.7) * 0.35);
        s.material.uniforms.strength.value = 1 - Math.max(0, (f - 0.6) / 0.4);
      });
      focus = vesG.visible ? vesG : spill[0];
    }
    return focus;
  }

  // ---------- пиноцитоз ----------
  // Место на мембране — на луче от центра клетки через ближайшую к зрителю лизосому.
  const lysos = cell.parts.lysosomes.objects.map(o => o.userData.base.clone());
  const lyso = lysos.reduce((a, b) => (b.z > a.z ? b : a));
  const axes = cell.size;
  const dirM = lyso.clone().normalize();
  const tM = 1 / Math.sqrt((dirM.x / axes.x) ** 2 + (dirM.y / axes.y) ** 2 + (dirM.z / axes.z) ** 2);
  const mem = dirM.clone().multiplyScalar(tM * 0.95);                    // точка на внутренней стороне мембраны
  const normal = mem.clone().divide(axes).divide(axes).normalize();      // наружная нормаль эллипсоида
  const CUP_R = 0.32;
  // «Чашка» впячивания: шаровой сегмент, открытый наружу; чем глубже — тем ближе к целому шару.
  const cups = [...Array(16)].map((_, i) => {
    const th = 0.5 + (Math.PI - 0.5) * i / 15;
    return new THREE.SphereGeometry(CUP_R, 28, 14, 0, Math.PI * 2, Math.PI - th, th);
  });
  const cup = new THREE.Mesh(cups[0], neon(0x00e5ff, { glass: true, glow: 1.8, power: 2.5, body: 0, strength: 0.9 }));
  cup.material.side = THREE.DoubleSide;
  cup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);   // отверстие — наружу
  group.add(cup);
  const drops = [...Array(6)].map((_, i) => ball(0.045, 0x8fd3ff, { glow: 2.2, body: 0.9 }));
  const dropOff = drops.map((_, i) => new THREE.Vector3(Math.sin(i * 2.1), Math.cos(i * 1.3), Math.sin(i * 0.7 + 1)).multiplyScalar(0.13));
  const mono = [...Array(8)].map(() => ball(0.025, 0x7dff5a, { glow: 2.4, body: 1.0 }));
  const monoDir = mono.map((_, i) => new THREE.Vector3(Math.sin(i * 2.7 + 1), Math.cos(i * 1.9), Math.sin(i * 1.3)).normalize());
  // Вспышка вокруг лизосомы, пока она «работает» (материалы лизосом общие — их не трогаем).
  const flash = ball(0.36, 0xff2bd6, { glass: true, glow: 2.0, power: 2.0, body: 0, strength: 0.8 });
  const pinoParts = [cup, ...drops, ...mono, flash];
  const outside = mem.clone().addScaledVector(normal, 0.9);
  const deep = mem.clone().addScaledVector(normal, -CUP_R);               // центр замкнувшегося пузырька

  function updatePino(c) {
    let focus = cup;
    const place = (center, k) => drops.forEach((d, i) => { d.visible = true; d.position.copy(center).addScaledVector(dropOff[i], k); });
    if (c < 5) {                          // впячивание: капли подплывают снаружи, «чашка» углубляется
      const f = c / 5;
      cup.visible = true; cup.geometry = cups[Math.round(ease(f) * 9)];
      cup.position.copy(mem).addScaledVector(normal, -CUP_R * ease(f) * 0.6);
      place(lerp(outside, cup.position, ease(f)), 1);
    } else if (c < 8.5) {                 // края смыкаются: сегмент становится целым шаром
      const f = (c - 5) / 3.5;
      cup.visible = true; cup.geometry = cups[9 + Math.round(ease(f) * 6)];
      cup.position.copy(lerp(mem.clone().addScaledVector(normal, -CUP_R * 0.6), deep, ease(f)));
      place(cup.position, 1);
    } else if (c < 14) {                  // пузырёк идёт к лизосоме
      const f = ease((c - 8.5) / 5.5);
      cup.visible = true; cup.geometry = cups[15];
      cup.position.copy(lerp(deep, lyso, f * 0.85));
      place(cup.position, 1);
    } else if (c < 18) {                  // слияние: пузырёк «втекает» в лизосому
      const f = (c - 14) / 4;
      cup.visible = f < 0.7; cup.position.copy(lerp(lerp(deep, lyso, 0.85), lyso, f / 0.7)); cup.scale.setScalar(1 - 0.6 * ease(f / 0.7));
      place(lerp(cup.position, lyso, f), 1 - 0.5 * f);
      focus = f < 0.7 ? cup : drops[0];
    } else if (c < 24) {                  // переваривание: капли тают, мономеры выходят в цитоплазму
      const f = (c - 18) / 6;
      drops.forEach((d, i) => { d.visible = f < 0.6; d.position.copy(lyso).addScaledVector(dropOff[i], 0.5); d.scale.setScalar(1 - ease(f / 0.6)); });
      mono.forEach((m, i) => {
        m.visible = f > 0.35;
        m.position.copy(lyso).addScaledVector(monoDir[i], 0.2 + ease((f - 0.35) / 0.65) * 0.7);
        m.material.uniforms.strength.value = 1 - Math.max(0, (f - 0.8) / 0.2);
      });
      focus = mono[0].visible ? mono[0] : drops[0];
    } else return null;
    if (c >= 14) {                        // лизосома «работает» — вокруг неё мягкая вспышка
      const k = Math.sin(Math.min(1, (c - 14) / 10) * Math.PI);
      flash.visible = true; flash.position.copy(lyso);
      flash.material.uniforms.strength.value = 0.8 * k * (0.8 + 0.2 * Math.sin(c * 6));
    }
    if (c < 14) cup.scale.setScalar(1);
    return focus;
  }

  // ---------- «рельсы» ----------
  // Пузырьки едут по настоящим микротрубочкам сети: кинезины — от центра к краю (по кривой
  // вперёд), динеины — от края к центру (по кривой назад). Митохондрии — настоящие: каждая сидит
// на своей микротрубочке и ездит по ней от своего места (A) к краю клетки (B) и обратно.
  const centro = cell.parts.centrioles.objects[0].userData.base.clone();
  const picks = curves.filter((_, i) => i % Math.max(1, Math.floor(curves.length / 6)) === 0).slice(0, 6);
  const outV = picks.slice(0, 3).map(() => ball(0.13, 0xff5ab4, { glass: true, glow: 2.0, power: 2.5, body: 0, strength: 0.9 }));
  const inV = picks.slice(3, 6).map(() => ball(0.13, 0x7df9ff, { glass: true, glow: 2.0, power: 2.5, body: 0, strength: 0.9 }));
  const mitoObjs = cell.parts.mito.objects;
  const homes = mitoObjs.map(o => o.userData.base.clone());
  const tracks = (cell.parts.cytoskeleton.objects[0].userData.mtAnchored || []).map(t => ({ ...t, uB: Math.min(0.93, t.u + 0.32) }));
  // f = 0 — митохондрии на своих местах, f = 1 — в конце пути (у края клетки).
  // Двигаем «основу» органоида: покачивание клетки строится от неё и не мешает езде.
  function placeMitos(f) {
    mitoObjs.forEach((o, i) => {
      const t = tracks[i];
      // сдвиг вдоль нити от исходной точки: при f = 0 митохондрия ровно на своём месте
      const p = t ? homes[i].clone().add(t.curve.getPoint(t.u + (t.uB - t.u) * f)).sub(t.curve.getPoint(t.u)) : homes[i];
      o.userData.base.copy(p);
      o.position.x = p.x; o.position.z = p.z;
    });
  }
  const front = mitoObjs.reduce((b, o) => (o.userData.base.z > b.userData.base.z ? o : b), mitoObjs[0]);   // ближайшая к зрителю
  const railParts = [...outV, ...inV];
  function updateRails(c) {
    let focus = null;
    const ride = (m, curve, f, back) => {
      m.visible = true;
      const u = back ? 1 - f : f;
      m.position.copy(curve.getPoint(Math.min(1, Math.max(0, u))));
      const s = Math.min(1, f * 8, (1 - f) * 8);
      m.scale.setScalar(Math.max(0.01, s));
    };
    if (c < 8) { outV.forEach((v, i) => ride(v, picks[i], ease((c - i * 0.6) / 6.5), false)); focus = outV[0]; }
    else if (c < 16) { inV.forEach((v, i) => picks[3 + i] && ride(v, picks[3 + i], ease((c - 8 - i * 0.6) / 6.5), true)); focus = inV[0]; }
    else {                                // митохондрии съездили к краю и вернулись
      const f = (c - 16) / 8;
      placeMitos(ease(f < 0.45 ? f / 0.45 : f < 0.55 ? 1 : 1 - (f - 0.55) / 0.45));
      focus = front;
    }
    return focus;
  }

  // ---------- «энергия» ----------
  // Митохондрии едут по своим микротрубочкам к краю клетки, «дышат» и рассылают жёлтые искры АТФ
  // соседям; у «потребителей» искры гаснут (АТФ → АДФ), голубые искры АДФ летят назад, и
  // митохондрии возвращаются на свои места — по кругу.
  const mitos = mitoObjs.map(o => o.userData.base);   // живые позиции — искры летят от того места, где митохондрия сейчас
  const consumers = [er, G, exitPoint, mem, C.clone().addScaledVector(toG, R * 1.6)];
  const sparks = [], phosphates = [];
  mitos.forEach((m, i) => {
    for (let j = 0; j < 4; j++) {
      const s = ball(0.04, 0xf4ff3a, { glow: 2.6, body: 1.0 });
      s.userData = { from: m, to: consumers[(i + j) % consumers.length].clone().add(new THREE.Vector3(Math.sin(i * 5 + j), Math.cos(i * 3 + j), Math.sin(j * 7)).multiplyScalar(0.25)), delay: (i * 4 + j) % 7 * 0.25 };
      sparks.push(s);
      // Фосфат, который АТФ отдаёт у «потребителя»: обратно он летит отдельно от АДФ.
      const ph = ball(0.022, 0xffffff, { glow: 2.2, body: 1.0 });
      ph.userData.side = new THREE.Vector3(Math.cos(i * 2 + j * 3), Math.sin(j * 5 + i), Math.cos(j * 2.3)).normalize().multiplyScalar(0.12);
      s.userData.ph = ph;
      phosphates.push(ph);
    }
  });
  const atpColor = new THREE.Color(0xf4ff3a), adpColor = new THREE.Color(0x7df9ff);
  let mitoGlow = 1;
  function updateEnergy(c) {
    // 0–6 едут к краю, 6–10 «дышат», 10–15 АТФ к соседям, 15–19 работа, 19–26 АДФ и митохондрии — домой.
    placeMitos(c < 6 ? ease(c / 6) : c < 19 ? 1 : 1 - ease((c - 19) / 6));
    mitoGlow = c >= 6 && c < 10 ? 1 + 0.7 * Math.sin((c - 6) * 3) ** 2 : c >= 10 && c < 15 ? 1.2 : 1;
    sparks.forEach(s => {
      const { from, to, delay } = s.userData;
      s.visible = c > 10 && c < 25;
      if (!s.visible) return;
      if (c < 15) {                         // АТФ летит к потребителю
        s.position.copy(lerp(from, to, ease((c - 10 - delay) / 3.6)));
        s.material.uniforms.uColor.value.copy(atpColor);
        s.material.uniforms.strength.value = 1;
      } else if (c < 19) {                  // работа: вспышка, от АТФ отделяется фосфат — остаётся АДФ
        const f = (c - 15) / 4;
        s.position.copy(to);
        s.material.uniforms.uColor.value.copy(f < 0.45 ? atpColor : adpColor);
        s.material.uniforms.strength.value = 1 + Math.sin(f * Math.PI) * 1.5;
        const ph = s.userData.ph;
        ph.visible = f > 0.45;
        ph.position.copy(to).addScaledVector(ph.userData.side, ease((f - 0.45) / 0.55));
      } else {                              // АДФ и фосфат возвращаются — каждый своим путём
        const f = ease((c - 19 - delay) / 4.5);
        s.position.copy(lerp(to, from, f));
        s.material.uniforms.uColor.value.copy(adpColor);
        s.material.uniforms.strength.value = 0.95;
        const ph = s.userData.ph;
        ph.visible = f < 0.98;
        ph.position.copy(lerp(to.clone().add(ph.userData.side), from, ease((c - 19.4 - delay) / 4.5)))
          .addScaledVector(ph.userData.side, Math.sin(f * Math.PI) * 0.6);
      }
    });
    return null;
  }
  const mitoFocus = front;

  function update(dt, camera) {
    if (!group.visible) return;
    if (!focusPos.lengthSq()) focusPos.copy(current === 'protein' || current === 'all' ? inside : current === 'pino' ? mem : current === 'rails' ? centro : mitoFocus.position);
    for (const o of [...proteinParts, ...pinoParts, ...railParts, ...sparks, ...phosphates]) o.visible = false;
    mitoGlow = 1;
    if (current !== 'energy' && current !== 'all') placeMitos(0);   // в других процессах митохондрии на местах
    let focus;
    if (current === 'all') {
      for (const id in clocks) clocks[id] = (clocks[id] + dt) % PROCESSES[id].cycle;
      local += dt;
      updatePino(clocks.pino); updateRails(clocks.rails); updateEnergy(clocks.energy);
      focus = updateProtein(clocks.protein);   // камера в «Следить» идёт за белком
    } else {
      local = (local + dt) % PROCESSES[current].cycle;
      focus = current === 'protein' ? updateProtein(local) : current === 'pino' ? updatePino(local)
        : current === 'rails' ? updateRails(local) : (updateEnergy(local), mitoFocus);
    }
    // Кольцо-маркер: обводит главного участника и всегда смотрит на зрителя (в «Всё» — нет: участников много).
    ring.visible = !!focus && current !== 'all';
    if (focus) focusPos.copy(focus.position);
    if (focus) {
      ring.position.copy(focus.position);
      ring.quaternion.copy(camera.quaternion);
      ring.scale.setScalar(1 + 0.15 * Math.sin(local * 5));
    }
  }

  function status() {
    if (current === 'all') return { head: 'ВСЁ СРАЗУ · так клетка и живёт',
      detail: 'Розовая иРНК и зелёный белок — путь белка; голубые капли — пиноцитоз; пузырьки на зелёных нитях — транспорт; жёлтые искры — АТФ.' };
    const stages = PROCESSES[current].stages;
    const found = stages.findIndex(s => local < s.t);
    const i = found < 0 ? stages.length - 1 : found;   // пауза в конце цикла — ещё последний этап
    const from = i > 0 ? stages[i - 1].t : 0;
    return { ...stages[i], step: i, total: stages.length, frac: Math.min(1, (local - from) / (stages[i].t - from)) };
  }
  return {
    group, update, status, focus: () => focusPos,
    // Во «Энергии» митохондрии «дышат» — атлас умножает на это их свечение.
    glow: id => (group.visible && (current === 'energy' || current === 'all') && id === 'mito' ? mitoGlow : 1),
    processes: [...Object.entries(PROCESSES).map(([id, p]) => ({ id, name: p.name })), { id: 'all', name: '∞ Всё', small: true }],
    setProcess(id) { current = id; local = 0; focusPos.set(0, 0, 0); Object.assign(clocks, { protein: 0, pino: 7, rails: 3, energy: 11 }); }, getProcess: () => current,
    setOn(on) { group.visible = on; local = 0; if (!on) placeMitos(0); }, isOn: () => group.visible,
  };
}
