import { createTelophase } from './mitotelophase.js';
import { createCytokinesis } from './mitocytokinesis.js';
import { createSummary } from './mitosummary.js';
import * as THREE from 'three';
import { QUESTIONS, PARTS_INFO } from './mitosis-data.js';
import { ease } from './motion.js';
import { ringSprite } from './mitospindle.js';
import { createKinetochore } from './mitokinet.js';
import { createAnaphase } from './mitoanaphase.js';

// Этапы урока «Митоз». Каждый этап — функция от ctx (см. mitosis.js), которая управляет общей
// клеткой ctx.world и возвращает { intro, update, tap, drag, leave } (нужное — по выбору).

const VIEW = new THREE.Vector3(0.15, 0.22, 1).normalize();   // откуда камера смотрит на клетку
const ORIGIN = new THREE.Vector3();

// Вопрос с вариантами: у каждого неверного ответа — свой разбор ошибки.
function ask(ui, q, done) {
  (ui.question||ui.hud)('<b>Вопрос</b><span>' + q.text + '</span>');
  ui.label(null);
  ui.buttons(q.options.map(([id, text]) => ({ text, onClick: () => {
    if (id !== q.answer) return ui.label('<b class="err">Нет.</b> ' + q.hints[id]);
    ui.label('<b class="ok">Верно!</b> ' + q.ok);
    done();
  } })), 'column');
}

// Нажатие на часть клетки — её название и роль.
function describe({ ui, world }, ray) {
  const info = PARTS_INFO[world.pick(ray)];
  ui.label(info ? '<b>' + info[0] + '</b><br>' + info[1] : null);
}

export const SCENES = {
  cytokinesis: createCytokinesis,
  summary: createSummary,
  telophase: createTelophase,
  anaphase: createAnaphase,
  // 0. Интерфаза: ядро с рыхлым хроматином и ядрышком; центросома удваивается;
  // вопрос о наборе после S-периода.
  interphase(ctx) {
    const { ui, world, next } = ctx;
    const sp = world.spindle;
    let mode = 'look';   // look → centro → dup → after → ask
    let k = 0;           // ход удвоения центросомы

    function showCentrosome() {
      mode = 'centro';
      ui.label(null);
      const p = sp.centrosomes[0].group.getWorldPosition(new THREE.Vector3());
      const from = p.clone().normalize().multiplyScalar(0.6).addScaledVector(VIEW, 0.8).normalize();
      ctx.fly(p.clone().addScaledVector(from, 2.7), p, 1.9);   // с запасом: после удвоения в кадре обе центросомы
      ui.hud('<b>Клеточный центр</b><span>Рядом с ядром — центросома: две центриоли под прямым углом. От неё лучами расходятся микротрубочки. Перед делением центросома удваивается.</span>');
      ui.buttons([{ text: 'Удвоить', primary: true, onClick: () => { mode = 'dup'; ui.buttons([]); } }]);
    }
    function afterDup() {
      mode = 'after';
      ui.hud('<b>Клеточный центр</b><span>Теперь центросом две, в каждой — пара центриолей. В митозе они разойдутся к полюсам клетки и построят веретено деления.</span>');
      ui.buttons([{ text: 'Далее', primary: true, onClick: () => {
        mode = 'ask';
        ctx.fly(VIEW.clone().multiplyScalar(ctx.fit(world.radius.cell) * 1.12), ORIGIN.clone(), 1.6);
        ask(ui, QUESTIONS.interphase, () => ui.buttons([{ text: 'Начать деление', primary: true, onClick: next }]));
      } }]);
    }

    return {
      intro() {
        ctx.fly(VIEW.clone().multiplyScalar(ctx.fit(world.radius.cell) * 1.12), ORIGIN.clone(), 1.2);
        ui.hud('<b>Интерфаза</b><span>Клетка готовится к делению. ДНК уже удвоилась — вы видели это в уроке «Репликация ДНК». Но хромосом пока не видно: в ядре рыхлый хроматин.</span>' +
          '<br><span class="hint">Вращайте клетку, нажимайте на её части.</span>');
        ui.buttons([{ text: 'Далее', primary: true, onClick: showCentrosome }]);
      },
      update(dt) {
        if (mode !== 'dup') return;
        k = Math.min(1, k + dt / 2.8);
        sp.dup(ease(k));
        if (k === 1) afterDup();
      },
      tap(ray) { if (mode !== 'ask') describe(ctx, ray); },
    };
  },

  // 1. Профаза: ученик «скручивает» хроматин в хромосомы (ядрышко исчезает),
  // затем разводит центросомы к полюсам — между ними растут нити веретена.
  prophase(ctx) {
    const { ui, world, camera, next } = ctx;
    const sp = world.spindle;
    const TURNS = 2;                 // сколько кругов пальцем нужно на полную упаковку
    let mode = 'twist';              // twist → settle → packed → pull → placed → ask
    let sum = 0, last = null;        // набранный угол и прошлое направление на палец
    let cond = 0, idle = 0, helper = false;
    let held = -1, pullFrom = 0;     // какую центросому держит палец и откуда её взяли
    const goal = [0, 0], at = [0, 0];   // путь центросом к полюсам: куда тянут и где они сейчас

    // Подсказка жеста: пунктирное кольцо со стрелкой вокруг ядра.
    const hint = document.createElement('div');
    hint.id = 'twist';
    document.body.appendChild(hint);
    const v = new THREE.Vector3();
    function placeHint() {
      const depth = -v.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse).z;
      v.set(0, 0, 0).project(camera);
      const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
      const size = depth > camera.near
        ? 2.5 * world.radius.nucleus / (depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * innerHeight / 2
        : 0;
      hint.hidden = size === 0;
      hint.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px';
      return [x, y, size];
    }

    function packed() {
      mode = 'packed';
      ui.hud('<b>Профаза</b><span>Хромосомы стали видны. Каждая состоит из двух сестринских хроматид, соединённых в области центромеры. Ядрышко исчезло.</span>');
      ui.buttons([{ text: 'Далее', primary: true, onClick: pull }]);
    }

    // Задание: развести центросомы к полюсам.
    function pull() {
      mode = 'pull';
      idle = 0; helper = false;
      ctx.lock(true);
      ctx.fly(new THREE.Vector3(0.15, 0.04, 1).normalize().multiplyScalar(ctx.fit(world.radius.spindle) * 1.3), ORIGIN.clone(), 1.6);   // вид сбоку: видны оба полюса
      sp.markers(true);
      ui.label(null);
      ui.hud('<b>Профаза</b><span>Центросомы расходятся к полюсам клетки, между ними растут нити веретена деления. Перетащите каждую центросому к её метке.</span>');
      ui.buttons([]);
    }
    // Какая центросома под пальцем (или −1).
    function grab(x, y) {
      let best = -1, near = 60;
      sp.centrosomes.forEach((c, i) => {
        c.group.getWorldPosition(v).project(camera);
        const d = Math.hypot((v.x + 1) / 2 * innerWidth - x, (1 - v.y) / 2 * innerHeight - y);
        if (d < near) { near = d; best = i; }
      });
      return best;
    }
    // Какая точка пути центросомы i ближе всего к пальцу на экране (0 — начало, 1 — полюс).
    // Считаем по экрану, а не по шару: часть пути может быть скрыта за ядром.
    function wayUnder(i, x, y) {
      let best = 0, near = Infinity;
      for (let n = 0; n <= 60; n++) {
        world.group.localToWorld(sp.placeOf(i, n / 60, v)).project(camera);
        const d = Math.hypot((v.x + 1) / 2 * innerWidth - x, (1 - v.y) / 2 * innerHeight - y);
        if (d < near) { near = d; best = n / 60; }
      }
      return best;
    }
    function placed() {
      mode = 'placed';
      ctx.lock(false);
      sp.markers(false);
      ui.hud('<b>Профаза</b><span>Центросомы — на полюсах клетки. Между ними выросли микротрубочки — нити будущего веретена деления.</span>');
      ui.buttons([{ text: 'Далее', primary: true, onClick: () => {
        mode = 'ask';
        ask(ui, QUESTIONS.centrosome, () => ui.buttons([{ text: 'Ещё вопрос', primary: true, onClick: () =>
          ask(ui, QUESTIONS.prophase, () => ui.buttons([{ text: 'Далее', primary: true, onClick: next }])) }]));
      } }]);
    }

    return {
      intro() {
        ctx.lock(true);   // пока идёт задание, палец скручивает хроматин, а не вращает клетку
        ctx.fly(VIEW.clone().multiplyScalar(ctx.fit(world.radius.nucleus) * 1.5), ORIGIN.clone(), 1.8);
        ui.hud('<b>Профаза</b><span>Хроматин скручивается в хромосомы. Начните у пунктирного кольца и ведите по кругу вокруг ядра.</span>');
        ui.buttons([]);
      },
      drag(phase, x, y) {
        if (mode === 'twist') {
          if (phase === 'cancel') { last = null; return; }
          const [cx, cy, size] = placeHint();
          const distance = Math.hypot(x - cx, y - cy);
          if (phase === 'down' && (!size || distance < Math.max(24, size * .23) || distance > size * .78)) return false;
          const far = distance > 24;
          const a = Math.atan2(y - cy, x - cx);
          if (phase === 'move' && last !== null && far) {
            const d = a - last;
            sum += Math.atan2(Math.sin(d), Math.cos(d));
            idle = 0;
          }
          last = phase === 'up' || !far ? null : a;
          return true;
        }
        if (mode !== 'pull') return false;
        if (phase === 'down') {
          held = grab(x, y);
          if (held >= 0) pullFrom = goal[held];
          return held >= 0;
        }
        if (held < 0) return false;
        if (phase === 'cancel') { goal[held] = pullFrom; held = -1; return; }
        idle = 0;
        if (phase !== 'up') goal[held] = wayUnder(held, x, y);
        else { if (goal[held] > 0.85) goal[held] = 1; held = -1; }   // рядом с меткой — встаёт на место сама
      },
      tap(ray) { if (mode === 'packed' || mode === 'placed') describe(ctx, ray); },
      update(dt) {
        // Упаковка хроматина.
        const full = mode === 'twist' ? Math.min(1, Math.abs(sum) / (TURNS * Math.PI * 2)) : 1;
        const k = 1 - Math.exp(-dt * 3.5);
        cond += (full - cond) * k;
        world.cond(cond);
        world.chromatin.rotation.z += (-sum * 0.1 - world.chromatin.rotation.z) * k;   // ядро слегка поворачивается за пальцем
        // Центросомы плавно догоняют палец.
        for (let i = 0; i < 2; i++) at[i] += (goal[i] - at[i]) * (1 - Math.exp(-dt * 9));
        sp.spread(at[0], at[1]);

        idle += dt;
        if (mode === 'twist') {
          placeHint();
          hint.classList.toggle('off', full > 0.06);
          if (full === 1) { mode = 'settle'; hint.remove(); ctx.lock(false); ui.buttons([]); }
          else if (idle > 10 && !helper) {
            // Если жест не получается — урок не должен на этом остановиться.
            helper = true;
            ui.buttons([{ text: 'Скрутить за меня', onClick: () => { sum = TURNS * Math.PI * 2; } }]);
          }
        } else if (mode === 'settle' && cond > 0.995) { cond = 1; world.cond(1); packed(); }
        else if (mode === 'pull') {
          if (goal[0] === 1 && goal[1] === 1 && at[0] > 0.995 && at[1] > 0.995) placed();
          else if (idle > 12 && !helper && held < 0) {
            helper = true;
            ui.buttons([{ text: 'Развести за меня', onClick: () => { goal[0] = goal[1] = 1; ui.buttons([]); } }]);
          }
        }
      },
      leave() { hint.remove(); sp.markers(false); ctx.lock(false); },
    };
  },

  // 2. Прометафаза: оболочка ядра распадается на пузырьки; ученик тянет нити веретена от полюсов
  // к трём хромосомам (ловушка — обе хроматиды к одному полюсу); остальные прикрепляются сами.
  prometaphase(ctx) {
    const { ui, world, camera, next } = ctx;
    const sp = world.spindle;
    const olymp = !!(window.Level && window.Level.isOlymp());
    let mode = 'break';              // break → task → pause → closeup → auto → done → ask
    let k = 0, timer = 0;
    let task = [], cur = 0;          // хромосомы, которые прикрепляет ученик, и номер текущей
    let queue = [];                  // хромосомы, которые прикрепятся сами
    let held = -1, idle = 0, helper = false;
    let undo = null;                 // ошибочная нить, которая скоро отсоединится: { key, t }
    const poles = new Map();         // хромосома → [полюс хроматиды 0, полюс хроматиды 1]; −1 — свободна
    const base = new Map();          // хромосома → где она была, пока её не потянули
    const v = new THREE.Vector3(), w = new THREE.Vector3(), ray = new THREE.Raycaster(), plane = new THREE.Plane();
    const aim = ringSprite();        // кольцо вокруг хромосомы, к которой нужно тянуть нить
    aim.visible = false;
    world.group.add(aim);

    // Вид сбоку: в кадре оба полюса и все хромосомы.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const side = () => new THREE.Vector3(0.15, 0.04, 1).normalize().multiplyScalar(
      Math.max(world.radius.spindle * 1.45 / tan, world.radius.nucleus * 1.2 / (tan * camera.aspect)));
    // Расстояние на экране от точки p (в координатах мира) до пальца.
    const away = (p, x, y) => { p.project(camera); return Math.hypot((p.x + 1) / 2 * innerWidth - x, (1 - p.y) / 2 * innerHeight - y); };
    const key = (ch, n) => world.chromosomes.indexOf(ch) + ':' + n;
    const poleAt = pole => sp.centrosomes[pole].group.position;

    function join(ch, n, pole, grown) {
      poles.get(ch)[n] = pole;
      sp.attach(key(ch, n), pole, out => world.kinetochore(ch, n, out), grown);
    }
    // Хромосома разворачивается: кинетохор хроматиды n смотрит на «свой» полюс.
    function orient(ch, n, pole) {
      const x = new THREE.Vector3(0, sp.centrosomes[pole].sign * ch.chromatids[n].side, 0);
      const y = new THREE.Vector3(0, 1, 0).applyQuaternion(ch.group.quaternion);
      y.y = 0;
      if (y.lengthSq() < 0.01) y.set(1, 0, 0);
      y.normalize();
      ch.goal.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
    }

    function focus() {
      const ch = task[cur];
      for (const c of world.chromosomes) { c.shine(c === ch ? 1.2 : 0.4); c.pulse(c === ch ? 1.8 : 1); }
      aim.visible = true;
      ui.hud('<b>Прометафаза</b><span>У центромеры каждой хроматиды есть кинетохор — к нему крепится нить веретена. Протяните нить от полюса к хромосоме в кольце.</span>' +
        '<br><span class="hint">Хромосома ' + (cur + 1) + ' из ' + task.length + '. Сестринские хроматиды — к разным полюсам.</span>');
    }

    function startTask() {
      mode = 'task';
      idle = 0;
      // Три хромосомы, которые ближе всего к камере: до них проще дотянуться.
      const dir = camera.getWorldDirection(new THREE.Vector3());
      task = [...world.chromosomes].sort((a, b) => a.group.getWorldPosition(v).dot(dir) - b.group.getWorldPosition(w).dot(dir)).slice(0, 3);
      for (const ch of world.chromosomes) { poles.set(ch, [-1, -1]); base.set(ch, ch.goal.p.clone()); }
      ctx.lock(true);
      ctx.fly(side(), ORIGIN.clone(), 1.4);
      focus();
    }

    // Ученик дотянул нить от полюса pole до текущей хромосомы.
    function tryAttach(pole) {
      const ch = task[cur], st = poles.get(ch);
      if (st[0] < 0 && st[1] < 0) {
        // Первая нить: к той хроматиде, чей кинетохор ближе к этому полюсу.
        const d = [0, 1].map(n => world.kinetochore(ch, n, v).distanceTo(poleAt(pole)));
        const n = d[0] <= d[1] ? 0 : 1;
        join(ch, n, pole, 0.9);
        orient(ch, n, pole);
        ch.goal.p.copy(base.get(ch)).addScaledVector(v.copy(poleAt(pole)).sub(base.get(ch)).normalize(), 0.5);
        ui.label('<b class="ok">Нить закрепилась на кинетохоре.</b> Хромосому потянуло к этому полюсу. Теперь прикрепите вторую хроматиду.');
        return;
      }
      const n = st[0] < 0 ? 0 : 1;
      if (st[1 - n] === pole) {
        // Ловушка: обе хроматиды к одному полюсу. Нить крепится — и вскоре отсоединяется.
        sp.attach(key(ch, n), pole, out => world.kinetochore(ch, n, out), 0.9);
        undo = { key: key(ch, n), t: 1.4 };
        ui.label('<b class="err">Обе хроматиды — к одному полюсу.</b> Тогда в анафазе обе уйдут в одну клетку, а другая останется без этой хромосомы. Такое крепление не натянуто — нить отсоединяется. Тяните от другого полюса.' +
          (olymp ? ' Это синтелическое прикрепление; ненатянутые нити отцепляет киназа Aurora B.' : ''));
        return;
      }
      join(ch, n, pole, 0.9);
      ch.goal.p.copy(base.get(ch));
      ui.label('<b class="ok">Верно.</b> Сестринские хроматиды прикреплены к разным полюсам — каждая дочерняя клетка получит свою копию хромосомы.');
      cur++;
      idle = 0;
      if (cur < task.length) return focus();
      mode = 'pause';
      timer = 1.8;
      aim.visible = false;
      ui.buttons([]);
      for (const c of world.chromosomes) { c.shine(1); c.pulse(1); }
    }

    // Камера наезжает на кинетохор последней прикреплённой хромосомы — и «проваливается»
    // в молекулярный масштаб: видно, как белки кинетохора держат конец микротрубочки.
    let kinet = null, zoom = 0, told = false, contextTimer = 0, contextWide = false;
    const loading = createKinetochore({ olymp });   // модель грузится заранее, пока ученик занят заданием
    function closeup() {
      mode = 'closeup';
      zoom = 1.9;
      ui.label(null);
      ui.buttons([]);
      const target = task[task.length - 1].chromatids[0].kinetochore.getWorldPosition(new THREE.Vector3());
      ctx.fly(target.clone().addScaledVector(camera.position.clone().sub(target).normalize(), 1.1), target, 2.2);
      ui.hud('<b>Кинетохор</b><span>Приблизимся в тысячу раз: нить веретена — это пучок микротрубочек, а кинетохор — сотни белковых молекул.</span>');
    }
    async function dive() {
      const kt = await loading;
      ctx.fade(() => {
        kinet = kt;
        world.group.visible = false;
        ctx.scene.add(kt.group);
        ctx.lock(false);
        ctx.controls.minDistance = 0.4;
        ctx.controls.maxDistance = ctx.fit(kt.overview.radius)*1.5;
        camera.far = Math.max(300, ctx.controls.maxDistance*2);
        camera.updateProjectionMatrix();
        ctx.controls.target.copy(kt.overview.center);
        camera.position.copy(kt.overview.center).add(new THREE.Vector3(.06,.35,1).normalize().multiplyScalar(ctx.fit(kt.overview.radius)));
        kt.finish();
        kt.showOverview(true);
        contextTimer = 1.5;
        ui.hud('<b>Хромосома → кинетохор</b><span>Кинетохор расположен на наружной стороне центромерной области хроматиды. Приблизимся к белкам, которые связывают хромосому с микротрубочкой.</span>');
      });
    }
    function surface() {
      mode = 'auto';
      timer = 2.4;
      queue = world.chromosomes.filter(ch => !task.includes(ch));
      ui.buttons([]);
      ctx.fade(() => {
        ctx.scene.remove(kinet.group);
        kinet.dispose();
        kinet = null;
        world.group.visible = true;
        ctx.controls.minDistance = 0.8;
        ctx.controls.maxDistance = ctx.fit(world.radius.cell)*1.4;
        camera.far = 60; camera.updateProjectionMatrix();
        ctx.controls.target.set(0, 0, 0);
        camera.position.copy(side());
        ctx.lock(true);
        ui.hud('<b>Прометафаза</b><span>Остальные хромосомы прикрепляются так же: микротрубочки растут от полюсов, пока не встретят кинетохор.</span>');
      });
    }

    function done() {
      mode = 'done';
      ctx.lock(false);
      ui.hud('<b>Прометафаза</b><span>Все хромосомы прикреплены к обоим полюсам: каждая хроматида — к своему.</span>');
      ui.buttons([{ text: 'Далее', primary: true, onClick: () => {
        mode = 'ask';
        ask(ui, QUESTIONS.prometaphase, () => ui.buttons([{ text: 'Далее', primary: true, onClick: next }]));
      } }]);
    }

    return {
      intro() {
        world.bake();
        ctx.fly(side(), ORIGIN.clone(), 1.6);
        ui.hud('<b>Прометафаза</b><span>Оболочка ядра распадается на пузырьки. Теперь микротрубочки веретена могут дотянуться до хромосом.</span>');
        ui.buttons([]);
      },
      drag(phase, x, y) {
        if (mode !== 'task') return false;
        if (phase === 'cancel') { held = -1; sp.probe(0, null); return; }
        // Ошибку ученик может исправить сразу: новый жест снимает «отсыхающую» нить.
        if (undo) { sp.detach(undo.key); undo = null; }
        if (phase === 'down') {
          held = -1;
          sp.centrosomes.forEach((c, i) => { if (away(c.group.getWorldPosition(v), x, y) < 70) held = i; });
          return held >= 0;
        }
        if (held < 0) return false;
        idle = 0;
        const ch = task[cur];
        if (phase !== 'up') {
          // Конец пробной нити — под пальцем, на глубине хромосомы.
          ray.setFromCamera(v.set(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2, 0), camera);
          plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(w), ch.group.getWorldPosition(v));
          if (ray.ray.intersectPlane(plane, w)) sp.probe(held, world.group.worldToLocal(w));
        } else {
          const pole = held;
          held = -1;
          sp.probe(pole, null);
          if (away(ch.group.getWorldPosition(v), x, y) < 85) tryAttach(pole);
        }
      },
      tap(ray) { if (mode === 'break' || mode === 'done') describe(ctx, ray); },
      update(dt, t) {
        idle += dt;
        if (undo && (undo.t -= dt) <= 0) { sp.detach(undo.key); undo = null; }
        if (mode === 'break') {
          k = Math.min(1, k + dt / 4.5);
          world.envelope(ease(k));
          if (k === 1) startTask();
        } else if (mode === 'task') {
          aim.position.copy(world.group.worldToLocal(task[cur].group.getWorldPosition(v)));
          aim.scale.setScalar(2.4 + 0.2 * Math.sin(t * 3));
          if (idle > 14 && !helper && held < 0) {
            // Если жест не получается — урок не должен на этом остановиться.
            helper = true;
            ui.buttons([{ text: 'Присоединить за меня', onClick: () => {
              if (undo) return;
              const st = poles.get(task[cur]);
              if (st[0] < 0 && st[1] < 0) tryAttach(0);
              if (mode === 'task') { const now = poles.get(task[cur]); tryAttach(1 - Math.max(now[0], now[1])); }
            } }]);
          }
        } else if (mode === 'pause') {
          if ((timer -= dt) <= 0) closeup();
        } else if (mode === 'closeup') {
          if (zoom > 0 && (zoom -= dt) <= 0) dive();
          if (kinet) {
            if (contextTimer > 0) {
              contextTimer -= dt;
              if (contextTimer <= 0) {
                contextTimer = 0;
                const target = kinet.view.center.clone();
                ctx.fly(target.clone().add(new THREE.Vector3(.3,.12,1).normalize().multiplyScalar(ctx.fit(kinet.view.radius))),target,3.5);
                kinet.play();
                kinet.showOverview(false);
                ui.hud('<b>Кинетохор</b><span>Комплексы Ndc80 удерживают микротрубочку. Узел Mis12 и гибкие цепи CENP-C связывают их с центромерным хроматином.</span>');
              }
              return;
            }
            kinet.update(dt);
            if (kinet.done && !told) {
              told = true;
              ui.hud('<b>Кинетохор</b><span>Комплексы Ndc80 держат конец микротрубочки — и не отпускают, даже когда она укорачивается. Через комплекс Mis12 и внутренний кинетохор они связаны с ДНК центромеры.' +
                (olymp ? ' Пока кинетохор был свободен, на нём сидели Mad1–Mad2 и собирали комплекс MCC, запрещающий анафазу.' : '') + '</span>' +
                '<br><span class="hint">Можно отдалиться и увидеть место прикрепления на хромосоме.</span>');
              const showContext = () => {
                contextWide = !contextWide;
                kinet.showOverview(contextWide);
                const view = contextWide ? kinet.overview : kinet.view;
                ctx.fly(view.center.clone().add(new THREE.Vector3(.15,.25,1).normalize().multiplyScalar(ctx.fit(view.radius))),view.center.clone(),2.8);
              };
              ui.buttons([{ text: 'Хромосома / кинетохор', onClick: showContext }, { text: 'Далее', primary: true, onClick: surface }]);
            }
          }
        } else if (mode === 'auto' && (timer -= dt) <= 0) {
          const ch = queue.shift();
          if (!ch) return done();
          // Верхний полюс достаётся той хроматиде, чей кинетохор уже смотрит вверх.
          const up = new THREE.Vector3(1, 0, 0).applyQuaternion(ch.group.quaternion).y >= 0 ? 0 : 1;
          join(ch, up, 0, 0);
          join(ch, 1 - up, 1, 0);
          orient(ch, up, 0);
          timer = queue.length ? 0.55 : 2.2;
        }
      },
      leave() {
        // Сбросить всё, что мог включить крупный план: даже если ученик ушёл с этапа
        // на шаге вопроса, когда kinet уже null.
        if (kinet) { ctx.scene.remove(kinet.group); kinet.dispose(); kinet = null; }
        world.group.visible = true;
        ctx.controls.minDistance = 0.8;
        ctx.controls.maxDistance = ctx.fit(world.radius.cell) * 1.4;
        camera.far = 60; camera.updateProjectionMatrix();
        world.group.remove(aim);
        aim.material.dispose();
        sp.probe(0, null);
        ctx.lock(false);
        for (const c of world.chromosomes) { c.shine(1); c.pulse(1); }
      },
    };
  },

  // 3. Метафаза: ученик направляет первые три хромосомы к условной экваториальной плоскости;
  // остальные выстраиваются сами. Сестринские кинетохоры связаны с противоположными полюсами.
  metaphase(ctx) {
    const { ui, world, camera, next } = ctx;
    const sp = world.spindle;
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    const ray = new THREE.Raycaster(), plane = new THREE.Plane();
    const pointer = new THREE.Vector2(), hit = new THREE.Vector3();
    const guide = new THREE.Group();
    const field = new THREE.Mesh(
      new THREE.CircleGeometry(3.15, 64),
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    field.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(3.08, 3.13, 64),
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    rim.rotation.x = Math.PI / 2;
    guide.add(field, rim);
    world.group.add(guide);

    const slots = world.chromosomes.map((_, i) => {
      const a = i * Math.PI * 2 / world.chromosomes.length - Math.PI / 2;
      return new THREE.Vector3(2.75 * Math.cos(a), 0, 2.35 * Math.sin(a));
    });
    const targets = world.chromosomes.slice(0, 3).map((_, i) => {
      const marker = ringSprite();
      marker.position.copy(slots[i]);
      marker.scale.setScalar(0.9);
      marker.visible = false;
      guide.add(marker);
      return marker;
    });
    const task = world.chromosomes.slice(0, 3);
    const placed = new Map();
    const remaining = world.chromosomes.filter(ch => !task.includes(ch));
    let mode = 'manual';       // manual → snap → auto → done → ask
    let cur = 0, held = null, dragFrom = null;
    let idle = 0, helper = false, timer = 0, snapTimer = 0, doneTimer = 0;
    let guideMaterial = field.material;

    // Из одной общей ориентации обе сестринские кинетохоры смотрят к разным полюсам.
    function orientToSlot(ch, i) {
      const a = i * Math.PI * 2 / world.chromosomes.length - Math.PI / 2;
      const longAxis = new THREE.Vector3(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2));
      const kinAxis = new THREE.Vector3(0, 1, 0);
      const depthAxis = new THREE.Vector3().crossVectors(kinAxis, longAxis).normalize();
      ch.goal.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(kinAxis, longAxis, depthAxis));
      placed.set(ch, i);
    }
    function targetPose(ch, i) {
      ch.goal.p.copy(slots[i]);
      orientToSlot(ch, i);
    }
    function connect(ch) {
      const n = world.chromosomes.indexOf(ch);
      const key = 'metaphase:' + n;
      // Нити к сестринским кинетохорам идут от противоположных полюсов.
      sp.attach(key + ':0', 0, out => world.kinetochore(ch, 0, out), 1);
      sp.attach(key + ':1', 1, out => world.kinetochore(ch, 1, out), 1);
    }
    function settled(ch) {
      return ch.group.position.distanceTo(ch.goal.p) < 0.025 &&
        ch.group.quaternion.angleTo(ch.goal.q) < 0.035;
    }
    function distanceOnScreen(p, x, y) {
      const s = p.clone().project(camera);
      return Math.hypot((s.x + 1) * innerWidth / 2 - x, (1 - s.y) * innerHeight / 2 - y);
    }
    function focus() {
      helper = false;
      idle = 0;
      for (const ch of world.chromosomes) { ch.shine(ch === task[cur] ? 1.85 : 0.55); ch.pulse(ch === task[cur] ? 1.45 : 1); }
      targets.forEach((m, i) => { m.visible = i === cur; });
      ui.hud('<b>Метафаза</b><span>Перетащите выделенную хромосому к светящемуся ориентиру на экваторе. Сестринские хроматиды остаются соединёнными.</span>' +
        '<br><span class="hint">Хромосома ' + (cur + 1) + ' из ' + task.length + '.</span>');
      ui.buttons([]);
    }
    function startAuto() {
      mode = 'auto';
      timer = 0.35;
      targets.forEach(m => { m.visible = false; });
      for (const ch of world.chromosomes) { ch.shine(1); ch.pulse(1); }
      ui.label(null);
      ui.hud('<b>Метафаза</b><span>Остальные хромосомы плавно выстраиваются в экваториальной плоскости.</span>');
      ui.buttons([]);
    }
    function finish() {
      mode = 'done';
      world.metaphaseReady = true;
      ctx.lock(false);
      ui.hud('<b>Метафаза</b><span>Все 8 хромосом выстроены у экватора. Сестринские кинетохоры связаны с противоположными полюсами; хроматиды ещё не разделились.</span>');
      ui.buttons([{ text: 'Посчитать и проверить', primary: true, onClick: () => {
        mode = 'ask';
        ask(ui, QUESTIONS.metaphase, () => ui.buttons([{ text: 'Далее', primary: true, onClick: next }]));
      } }]);
    }

    // До задания все хромосомы уже имеют двуполюсное прикрепление, но ещё не выстроены.
    world.envelope(1);
    sp.open(1);
    world.chromosomes.forEach((ch, i) => {
      const a = i * 2.39996;
      const y = (i % 2 ? -1 : 1) * (1.1 + (i % 4) * 0.12);
      const r = 2.2 + (i % 3) * 0.12;
      ch.group.position.set(r * Math.cos(a), y, r * Math.sin(a));
      ch.goal.p.copy(ch.group.position);
      ch.shine(0.55);
      ch.pulse(1);
    });
    // Сначала подбираем три наиболее доступные хромосомы в выбранном ракурсе.
    const viewDir = new THREE.Vector3(0.35, 0.25, 1).normalize();
    task.sort((a, b) => b.group.position.dot(viewDir) - a.group.position.dot(viewDir));
    task.forEach((ch, i) => placed.set(ch, i));
    remaining.forEach((ch, i) => placed.set(ch, i + task.length));
    world.chromosomes.forEach(connect);

    function placeCurrent() {
      const ch = task[cur];
      if (!ch) return;
      targetPose(ch, cur);
      mode = 'snap';
      snapTimer = 0;
      held = null;
      idle = 0;
      targets[cur].visible = false;
      ui.label('<b class="ok">Верно.</b> Хромосома плавно занимает место у экватора.');
      ui.buttons([]);
    }
    function autoPlaceManual() {
      for (let i = cur; i < task.length; i++) targetPose(task[i], i);
      cur = task.length;
      mode = 'manualWait';
      timer = 0;
      targets.forEach(m => { m.visible = false; });
      ui.buttons([]);
    }

    return {
      intro() {
        ctx.lock(true);
        ctx.fly(viewDir.clone().multiplyScalar(ctx.fit(world.radius.cell) * 1.18), new THREE.Vector3(), 1.6);
        ui.hud('<b>Метафаза</b><span>Хромосомы выстраиваются у экватора клетки. Помогите первым трём занять места на условной экваториальной плоскости.</span>' +
          '<br><span class="hint">Полупрозрачная полоса — только ориентир, не отдельная структура клетки.</span>');
        focus();
      },
      drag(phase, x, y) {
        if (mode !== 'manual') return false;
        const ch = task[cur];
        if (phase === 'down') {
          const p = ch.group.getWorldPosition(new THREE.Vector3());
          if (distanceOnScreen(p, x, y) > 120) return false;
          held = ch;
          dragFrom = ch.goal.p.clone();
          plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(w), p);
          idle = 0;
          return true;
        }
        if (!held) return false;
        if (phase === 'move') {
          ray.setFromCamera(pointer.set(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), camera);
          if (ray.ray.intersectPlane(plane, hit)) {
            world.group.updateMatrixWorld();
            held.goal.p.copy(world.group.worldToLocal(hit.clone()));
          }
          idle = 0;
        } else if (phase === 'cancel') {
          held.goal.p.copy(dragFrom);
          held = null;
        } else if (phase === 'up') {
          const marker = targets[cur].getWorldPosition(new THREE.Vector3());
          if (distanceOnScreen(marker, x, y) < 130) placeCurrent();
          else {
            held.goal.p.copy(dragFrom);
            held = null;
            ui.label('Подведите хромосому к светящемуся ориентиру на экваторе и отпустите.');
          }
        }
      },
      update(dt, t) {
        guideMaterial.opacity = 0.1 + 0.02 * Math.sin(t * 1.2);
        if (mode === 'manual') {
          idle += dt;
          if (targets[cur]) {
            targets[cur].scale.setScalar(0.9 + 0.07 * Math.sin(t * 3));
            targets[cur].material.opacity = 0.75 + 0.2 * Math.sin(t * 3);
          }
          if (idle > 12 && !helper && !held) {
            helper = true;
            ui.buttons([{ text: 'Выстроить за меня', onClick: autoPlaceManual }]);
          }
        } else if (mode === 'snap') {
          snapTimer += dt;
          if (settled(task[cur]) || snapTimer > 2.4) {
            if (!settled(task[cur])) {
              task[cur].group.position.copy(task[cur].goal.p);
              task[cur].group.quaternion.copy(task[cur].goal.q);
            }
            cur++;
            if (cur < task.length) { mode = 'manual'; focus(); }
            else startAuto();
          }
        } else if (mode === 'manualWait') {
          timer += dt;
          if (task.every(settled) || timer > 2.6) {
            for (const ch of task) { ch.group.position.copy(ch.goal.p); ch.group.quaternion.copy(ch.goal.q); }
            startAuto();
          }
        } else if (mode === 'auto') {
          timer -= dt;
          if (timer <= 0 && remaining.length) {
            const ch = remaining.shift();
            targetPose(ch, placed.get(ch));
            timer = 0.55;
          } else if (!remaining.length) {
            if (world.chromosomes.every(settled)) {
              doneTimer += dt;
              if (doneTimer > 0.6) finish();
            }
          }
        }
      },
      leave() {
        world.group.remove(guide);
        guide.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) m.dispose();
          }
        });
        sp.clear();
        ctx.lock(false);
        for (const ch of world.chromosomes) { ch.shine(1); ch.pulse(1); }
      },
    };
  },
};
