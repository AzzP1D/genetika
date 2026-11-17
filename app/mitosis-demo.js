import * as THREE from 'three';
import { createChromosome, KARYOTYPE, BEND, triangles } from './mitochrom.js';
import { ease, Spring } from './motion.js';
import { PALETTE } from './style.js';
import { createKinetochore } from './mitokinet.js';

// Образцы объектов урока «Митоз» — для утверждения автором, в урок не входят.
// Открываются по адресу mitosis.html?demo=<имя>. Устроены как сцены этапов (см. mitosis.js).

// Варианты оттенка отцовских хромосом (материнские — циан, как ДНК).
const SHADES = [['сиреневый', PALETTE.chromPat], ['синий', 0x3f7bff], ['льдисто-белый', 0xbcd8ff]];

export const DEMOS = {
  // Крупный план кинетохора: микротрубочка дорастает до него, головки Ndc80 смыкаются на ней.
  // Уровень — тот, что выбран в меню (на олимпиадном видны белки контрольной точки).
  kinetochore({ ui, camera, controls, fit, fly }) {
    const group = new THREE.Group();
    let kt = null, wide = false;
    function showView() {
      if (!kt) return;
      ui.label(null);
      kt.showOverview(wide);
      const view = wide ? kt.overview : kt.view;
      const dir = wide ? new THREE.Vector3(.06,.35,1) : new THREE.Vector3(.3,.12,1);
      const pos = view.center.clone().add(dir.normalize().multiplyScalar(fit(view.radius)));
      controls.maxDistance = fit(kt.overview.radius) * 1.5;
      camera.far = Math.max(300, controls.maxDistance * 2);
      camera.updateProjectionMatrix();
      fly(pos, view.center.clone(), wide ? 2.5 : 3.5);
      ui.hud(wide
        ? '<b>Хромосома → центромера → кинетохор</b><span>Две сестринские хроматиды. Кинетохор расположен на наружной стороне центромерной области. Приблизьте место прикрепления.</span>'
        : '<b>Кинетохор · молекулярный масштаб</b><span>Микротрубочка связана с хроматином через белковые комплексы. Розовые гибкие цепи — CENP-C.</span>');
      buttons();
    }
    function buttons() {
      ui.buttons([
        { text: wide ? 'К кинетохору' : 'Показать хромосому', primary: true, onClick: () => { wide = !wide; showView(); } },
        { text: 'Показать прикрепление', onClick: () => { if (kt) { wide = false; showView(); kt.play(); } } },
        { text: 'О модели', onClick: () => ui.label('<b>Источники и реконструкция</b><br>' +
          'Формы молекул: RCSB PDB, данные CC0. <a href="https://www.rcsb.org/structure/3IZ0" target="_blank" rel="noopener">3IZ0</a> — Alushin et al., 2010; ' +
          '<a href="https://www.rcsb.org/structure/8PPR" target="_blank" rel="noopener">8PPR</a> — Yatskevich et al., 2024; ' +
          '7R5S — Yatskevich et al., 2022; 3AN2 — Tachiwana et al., 2011; 5LSK — Petrovic et al., 2016. ' +
          'Белки контрольной точки: 1GO4 — Sironi et al., 2002; 4AEZ — Chao et al., 2012 (дрожжевой прототип MCC).' +
          '<br>Внутри узла 8PPR сохранены взаимные координаты белков. Гибкие участки CENP-C, длинная спираль Ndc80 и укладка целой хромосомы реконструированы; их точная форма здесь условна.') },
      ]);
    }
    createKinetochore({ olymp: !!(window.Level && window.Level.isOlymp()) }).then(k => {
      kt = k;
      group.add(k.group);
      k.finish();
      controls.target.copy(k.view.center);
      camera.position.copy(k.view.center).add(new THREE.Vector3(0.3, 0.12, 1).normalize().multiplyScalar(fit(k.view.radius)));
      controls.minDistance = 0.4;
      controls.maxDistance = fit(k.overview.radius) * 1.5;
      camera.far = Math.max(300, controls.maxDistance * 2);
      camera.updateProjectionMatrix();
      buttons();
    }).catch(error => {
      console.error(error);
      ui.label('Не удалось загрузить модель. Перезагрузите страницу.');
    });
    return {
      group,
      intro() {
        ui.hud('<b>Кинетохор · молекулярный масштаб</b><span>Микротрубочка связана с хроматином через белковые комплексы. Розовые гибкие цепи — CENP-C.</span>');
        ui.buttons([]);
      },
      update(dt) { if (kt) kt.update(dt); },
    };
  },

  // Все восемь хромосом: верхний ряд — материнские, нижний — отцовские.
  chromosome({ ui, camera, controls }) {
    const group = new THREE.Group();
    const list = [];
    KARYOTYPE.forEach((k, i) => ['mat', 'pat'].forEach((parent, row) => {
      const ch = createChromosome(i, parent);
      ch.group.position.set((i - 1.5) * 1.7, row ? -1.75 : 1.75, 0);
      group.add(ch.group);
      list.push(ch);
    }));

    const d = 1.1 * Math.max(6.8, 6.6 / camera.aspect) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, d);
    controls.minDistance = 1.5;
    controls.maxDistance = d * 1.4;

    let packed = true, from = 1, t = 1;                       // упаковка: куда идём и сколько прошли
    let split = false, shade = 0;
    // «Анафаза»: хромосома ложится поперёк оси веретена (полюса — сверху и снизу), затем
    // хроматиды расходятся, а плечи отстают от центромеры — с лёгким «махом» пружины.
    const turn = new Spring(0, { stiffness: 16, damping: 7 });
    const apart = new Spring(0, { stiffness: 7, damping: 4.4 });
    const bend = new Spring(BEND.meta, { stiffness: 12, damping: 4 });
    let wait = 0;   // пауза между поворотом и расхождением

    function buttons() {
      ui.buttons([
        { text: packed ? 'Раскрутить' : 'Скрутить', primary: true, disabled: split,
          onClick: () => { from = packed ? 1 : 0; packed = !packed; t = 0; buttons(); } },
        { text: split ? 'Соединить' : 'Анафаза', disabled: !packed || t < 1,
          onClick: () => { split = !split; wait = 0.8; buttons(); } },
        { text: 'Оттенок: ' + SHADES[shade][0],
          onClick: () => { shade = (shade + 1) % SHADES.length; list.forEach(ch => { if (ch.parent === 'pat') ch.tint(SHADES[shade][1]); }); buttons(); } },
      ]);
    }

    function intro() {
      const tri = KARYOTYPE.map((k, i) => triangles(i)).reduce((a, b) => a.map((n, j) => n + b[j] * 2), [0, 0, 0]);
      ui.hud('<b>Образец: хромосомы</b><span>2n = 8. Верхний ряд — материнские, нижний — отцовские. Вращайте и приближайте.</span>' +
        '<br><span class="hint">Треугольников на все 8: издали ' + tri[2] + ', вблизи ' + tri[1] + ', крупный план ' + tri[0] + '.</span>');
      buttons();
    }

    function update(dt, time) {
      if (t < 1) { t = Math.min(1, t + dt / 4.5); if (t === 1) buttons(); }
      const c = from + ((packed ? 1 : 0) - from) * ease(t);
      // Туда: поворот → расхождение. Обратно: схождение → поворот.
      wait = Math.max(0, wait - dt);
      if (split) turn.target = Math.PI / 2; else { apart.target = 0; bend.target = BEND.meta; }
      if (wait === 0) { if (split) { apart.target = 1.3; bend.target = BEND.ana; } else turn.target = 0; }
      const angle = turn.step(dt), x = apart.step(dt), phi = bend.step(dt);
      for (const ch of list) {
        ch.cond(c);
        ch.bend(phi);
        ch.tick(time);
        ch.group.rotation.z = angle;
        for (const s of ch.chromatids) s.object.position.x = s.side * x;
      }
    }

    return { group, intro, update };
  },
};
