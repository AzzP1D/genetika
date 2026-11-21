import * as THREE from 'three';
import { createPoreReader } from './mitopore.js';

// Короткие карточки, а не второй учебник поверх сцены.
export const INFO = {
  membrane:['Мембрана клетки','Граница между цитоплазмой и внешней средой.','При цитокинезе перетягивается и разделяет две дочерние клетки.'],
  contractileRing:['Сократимое кольцо','Нити актина и белок миозин образуют пояс под мембраной в месте будущего деления.','Миозин помогает нитям скользить друг относительно друга. Кольцо сужается, втягивая мембрану и углубляя борозду деления.'],
  midbody:['Срединное тельце','Уплотнение из белков в межклеточном мостике, где перекрываются микротрубочки.','Мостик может разделиться сбоку от тельца, и его остаток останется у одной дочерней клетки. В некоторых клетках остаток высвобождается.'],
  cytoOverlap:['Перекрытие микротрубочек','В центральной части веретена концы микротрубочек от двух полюсов перекрываются.','Здесь организуется часть сигнала, который определяет положение будущей борозды на экваторе.'],
  cytoCortex:['Экваториальная кора','Тонкий слой цитоплазмы под плазматической мембраной в середине делящейся клетки.','Здесь активный RhoA направляет сборку актомиозинового пояса. На модели виден фрагмент мембраны над корой.'],
  centralspindlin:['Центральспиндлин','Комплекс из двух белков MKLP1 и двух белков RACGAP1 (CYK-4).','Связывает встречные микротрубочки. После фосфорилирования RACGAP1 этот комплекс может привлекать ECT2.'],
  racgap1:['RACGAP1 (CYK-4)','Регуляторная часть центральспиндлина. На модели отмечена фиолетовым.','Plk1 фосфорилирует RACGAP1. Фосфорилированный участок связывают BRCT-домены ECT2.'],
  cytoPlk1:['Plk1','Протеинкиназа, которая переносит фосфатные группы на определённые участки белков.','В начале цитокинеза помогает привлечь ECT2. Снижение её активности позже позволяет CEP55 накопиться у срединного тельца.'],
  cytoPhosphate:['Фосфат на RACGAP1','Фосфатная группа, добавленная к белку киназой Plk1.','Помогает узнавать место связывания ECT2. Показана отдельным цветом для наглядности.'],
  cytoEct2:['ECT2','Фактор обмена нуклеотидов RhoA, или GEF.','Помогает RhoA отпустить GDP. Когда связывается GTP из цитоплазмы, молекула RhoA становится активной.'],
  cytoRho:['RhoA','Малая GTPаза, которая работает как молекулярный переключатель у мембраны. На модели синий цвет означает RhoA–GDP, розовый — RhoA–GTP.','Активный RhoA регулирует сборку актина и работу миозина, чтобы борозда углублялась в нужном месте.'],
  cytoGdp:['GDP','Гуанозиндифосфат. Короткая цепочка из двух фосфатных групп показана рядом с основанием.','Связан с неактивным RhoA. При обмене GDP выходит из кармана белка.'],
  cytoGtp:['GTP','Гуанозинтрифосфат. У него три фосфатные группы.','Связывание GTP переключает RhoA в активное состояние. Гидролиз GTP возвращает белок к состоянию RhoA–GDP.'],
  cytoFormin:['Формин','Белок, который помогает начать и удлинять неразветвлённую нить актина.','При активации RhoA формины усиливают сборку актина в коре делящейся клетки.'],
  cytoActin:['Нити актина','Полимеры из субъединиц актина, собранные под мембраной.','Образуют основу сети, за которую тянет миозин II.'],
  cytoRock:['ROCK','Киназа, регулируемая активным RhoA.','Способствует фосфорилированию регуляторных лёгких цепей миозина II и усиливает сокращение.'],
  cytoMyosin:['Миозин II','Моторный белок. Биполярные сборки несут головки с двух концов.','Головки взаимодействуют с актином. Энергия гидролиза ATP позволяет сдвигать нити и создавать натяжение.'],
  cytoBridgeMembrane:['Мембрана мостика','Плазматическая мембрана вокруг тонкой перемычки между дочерними клетками.','При абсциссии шейка сужается и разделяется, образуя две замкнутые мембраны.'],
  cytoBridgeTubulin:['Микротрубочки мостика','Часть микротрубочек центрального веретена остаётся в перемычке.','Перед окончательным разделением пучок расчищается в месте, где перестраивается мембрана.'],
  cytoCep55:['CEP55','Белок, который на позднем этапе накапливается у срединного тельца.','Создаёт площадку для привлечения белка ALIX и субъединицы TSG101 комплекса ESCRT-I.'],
  cytoAlix:['ALIX','Адаптер между центральной площадкой мостика и белками ESCRT-III.','Один из путей, по которым комплексы ESCRT-III привлекаются к мосту.'],
  cytoTsg:['TSG101','Субъединица комплекса ESCRT-I.','Связывается с CEP55. Путь через ESCRT-I/II помогает привлечь ESCRT-III параллельно с путём через ALIX.'],
  cytoEscrt:['ESCRT-III','Комплекс белков, образующих нити на цитоплазматической стороне мембраны.','Его перестройка связана с сужением шейки и разделением мембраны. Связанные компоненты также помогают привлечь спастин.'],
  cytoSpastin:['Спастин','АТФаза, которая разрезает микротрубочки. В этой модели условно показана кольцом из шести субъединиц.','В месте будущего разделения помогает убрать пучок, освобождая участок мембраны.'],
  plantWall:['Клеточная стенка','Прочный слой с волокнами целлюлозы снаружи от клеточной мембраны. На модели показан разрез стенки.','У края клетки растущая пластинка соединяется со старой стенкой и достраивает перегородку между дочерними клетками.'],
  plantMembrane:['Клеточная мембрана','Тонкий слой, который отделяет цитоплазму от клеточной стенки.','У края растущей пластинки её мембраны сливаются с мембраной материнской клетки.'],
  cellPlate:['Клеточная пластинка','Будущая перегородка. Начинается как сеть трубочек, которые образуются при слиянии мембранных пузырьков.','Новые пузырьки присоединяются по краям. Из их содержимого формируется новая стенка, а из мембран — границы двух дочерних клеток.'],
  plateMembranes:['Мембраны пластинки','Из мембран слившихся пузырьков образуются две стороны пластинки.','После её слияния с клеточной мембраной каждая сторона становится частью мембраны одной дочерней клетки.'],
  phragmoplast:['Фрагмопласт','Временная структура между дочерними ядрами. Две группы микротрубочек обращены концами к будущей перегородке.','Пузырьки движутся вдоль микротрубочек. Когда центр пластинки сформирован, нити в этой области разбираются, а новые растут по краю.'],
  plateVesicles:['Мембранные пузырьки','Пузырьки доставляют мембрану и вещества для будущей клеточной стенки.','Сначала они сливаются в центре клетки, затем присоединяются к растущему краю пластинки.'],
  nucleus:['Ядерная оболочка','Две мембраны с ядерными порами.','Отделяет содержимое ядра от цитоплазмы. В телофазе восстанавливается вокруг каждого набора хромосом.'],
  pores:['Ядерная пора','Белковый комплекс в ядерной оболочке.','Обеспечивает избирательный обмен молекулами между ядром и цитоплазмой.'],
  nucleolus:['Ядрышко','Участок ядра без собственной мембраны.','Здесь образуется рРНК и собираются субъединицы рибосом. После митоза ядрышки восстанавливаются.'],
  endoplasmicReticulum:['Эндоплазматическая сеть','Сеть мембранных трубок и плоских цистерн.','При делении её мембраны охватывают разошедшиеся хромосомы и образуют две ядерные оболочки.'],
  baf:['BAF','Небольшой белок. Две его копии образуют димер и связывают участки ДНК.','BAF связывается с мембранным белком LEM2. Димер с ДНК показан по структуре 2BZF.'],
  bafDna:['Участки ДНК у BAF','В структуре 2BZF измерены два коротких участка двойной спирали по семь пар оснований.','В клетке эти участки продолжаются в составе хроматина. BAF удерживает их рядом на поверхности хромосом.'],
  telophaseDna:['ДНК в хроматине','Длинная двойная спираль. Часть ДНК обвивает гистоны, а участки между нуклеосомами остаются доступными для белков.','Здесь показаны продолжения двух участков, которые связывает BAF. Нуклеосомы построены по 1KX5; соединения между структурами реконструированы.'],
  lem2:['LEM2','Белок внутренней ядерной мембраны.','Связывается с BAF и привлекает CHMP7 к месту замыкания оболочки. Форма в сцене реконструирована.'],
  escrt:['CHMP7 и ESCRT-III','Белки, которые собираются у края временного отверстия.','Помогают сузить разрыв и замкнуть мембраны. Сборка показана схематично.'],
  spastin:['Спастин','Фермент, который разрезает микротрубочки.','При восстановлении оболочки помогает убрать микротрубочки из временных отверстий. Форма комплекса взята из 6PEN.'],
  envelopeGap:['Временный разрыв','Открытый участок между краями растущей двойной мембраны.','После удаления микротрубочки мембраны смыкаются. Собранные в других участках ядерные поры обеспечивают обмен веществами.'],
  chromosome:['Хромосома','Одна длинная молекула ДНК с белками; после репликации — две сестринские хроматиды.','Хранит наследственную информацию. В анафазе каждая отделившаяся сестра становится дочерней хромосомой.'],
  chromatin:['Хроматин','ДНК вместе с белками, в том числе гистонами.','Позволяет упаковать ДНК. Рыхлый хроматин и плотная хромосома — разные состояния той же упаковки.'],
  dna:['ДНК','Молекула, в последовательности которой записана наследственная информация.','При митозе распределяются уже удвоенные молекулы ДНК. Сепараза ДНК не разрезает.'],
  histones:['Гистоны · нуклеосома','ДНК обвивает комплекс белков-гистонов — получается нуклеосома.','Это один из основных уровней упаковки ДНК в хроматине.'],
  centrosome:['Центросома','Клеточный центр: в нашей животной клетке содержит пару центриолей.','Организует микротрубочки; две центросомы задают полюса веретена. Не путать с центромерой хромосомы.'],
  microtubule:['Микротрубочка','Полая белковая трубка из тубулина.','В веретене одни микротрубочки связаны с кинетохорами, другие перекрываются между полюсами.'],
  kinetochore:['Кинетохор','Белковая структура на центромерной области хромосомы.','Соединяет хромосому с микротрубочками веретена и участвует в контроле прикрепления.'],
  ndc80:['Комплекс Ndc80','Вытянутый белковый комплекс внешнего кинетохора.','Связывается с микротрубочкой и помогает сохранять прикрепление при изменении её длины.'],
  mis12:['Комплекс Mis12','Белковый связующий комплекс кинетохора.','Помогает соединить внутреннюю часть кинетохора с внешними комплексами, включая Ndc80.'],
  knl1:['KNL1','Белковая платформа внешнего кинетохора.','Участвует в сборке кинетохора и передаче сигналов контроля прикрепления к веретену.'],
  ccan:['Внутренний кинетохор · CCAN','Группа белковых комплексов рядом с центромерным хроматином.','Связывает центромерную область с остальной частью кинетохора.'],
  cenpa:['CENP-A','Особый вариант гистона H3 в центромерных нуклеосомах.','Помогает обозначить место сборки кинетохора. Это белок, а не отдельный участок ДНК.'],
  cohesin:['Когезин','Белковый комплекс, участвующий в удержании сестринских хроматид.','Перед анафазой оставшаяся когезия снимается после расщепления RAD21. Раскрытая форма в сцене — учебная реконструкция.'],
  smc1:['SMC1','Один из двух длинных SMC-белков когезина.','Вместе с SMC3 и RAD21 образует удерживающую систему. Спиральное плечо здесь реконструировано.'],
  smc3:['SMC3','Второй длинный SMC-белок когезина.','Соединяется с SMC1 через шарнир и участвует в работе комплекса. Спиральное плечо здесь реконструировано.'],
  hinge:['Шарнир когезина','Область соединения SMC1 и SMC3.','Позволяет комплексу менять форму. Форма двух соединённых доменов взята из 6WG3.'],
  stag:['STAG1','Вспомогательная субъединица когезина.','Участвует во взаимодействии комплекса с ДНК и регуляции его работы. Форма взята из 6WG3, расположение в сцене условное.'],
  rad21:['RAD21','Белковая субъединица, соединяющая головные области SMC-белков.','Сепараза расщепляет RAD21 и снимает удерживающую связь. Концы белка показаны по 6WG3, гибкая середина достроена.'],
  separase:['Сепараза','Фермент, который расщепляет определённые белковые мишени.','В начале анафазы расщепляет RAD21 и позволяет сестринским хроматидам разойтись. Сама к полюсам их не тянет.'],
  securin:['Секурин','Белок — ингибитор сепаразы.','Не даёт сепаразе действовать раньше времени. Его разрушение снимает один из механизмов блокировки фермента.'],
  checkpoint:['Контроль прикрепления','Белки, участвующие в проверке связи кинетохоров с веретеном.','Помогают задержать начало анафазы, пока остаются неприкреплённые кинетохоры.'],
};
export function infoTag(object,id,anchor) {
  object.userData.info=id;
  if(anchor)object.userData.infoAnchor=anchor.toArray();
  return object;
}
// Выноска хранит координату в системе самой детали, чтобы следовать за ней.
const targets = new WeakMap();

export function bindInfoSurface(object, mesh, nearbyWorldPoint) {
  const vertices = mesh.geometry.getAttribute('position');
  const nearby = mesh.worldToLocal(nearbyWorldPoint.clone());
  const vertex = new THREE.Vector3();
  const point = new THREE.Vector3();
  let closest = Infinity;
  for (let i = 0; i < vertices.count; i++) {
    vertex.fromBufferAttribute(vertices, i);
    const distance = vertex.distanceToSquared(nearby);
    if (distance < closest) {
      closest = distance;
      point.copy(vertex);
    }
  }
  targets.set(object, { owner: mesh, point });
}

export function infoWorldPoint(object, out = new THREE.Vector3()) {
  const target = targets.get(object);
  if (target) return target.owner.localToWorld(out.copy(target.point));
  if (object.userData.infoAnchor) return object.localToWorld(out.fromArray(object.userData.infoAnchor));
  const box = new THREE.Box3().setFromObject(object);
  return box.isEmpty() ? object.getWorldPosition(out) : box.getCenter(out);
}
export function isVisible(object) {
  for(let o=object;o;o=o.parent)if(!o.visible)return false;
  return true;
}
export function infoObjects(scene) {
  const result=[];scene.traverse(o=>{if(INFO[o.userData.info]&&isVisible(o))result.push(o);});return result;
}
// Чередуем позиции без перетасовки при неверном ответе.
export function rotateAnswers(list,turn) {
  if(list.length<2)return list;
  const n=(turn%list.length+list.length)%list.length;return [...list.slice(n),...list.slice(0,n)];
}

// Короткие подписи сопровождают показ. Кнопка открывает обычную карточку с той же точки.
export function createLessonLabels(camera, inspector) {
  const overlay = document.getElementById('lesson-labels');
  const hud = document.getElementById('hud'), bottom = document.getElementById('bottom');
  const projected = new THREE.Vector3();
  const slots = Array.from({ length: 3 }, () => {
    const marker = document.createElement('div');
    const dot = document.createElement('i'), line = document.createElement('i');
    const button = document.createElement('button');
    button.type = 'button';
    dot.className = 'label-dot';
    line.className = 'label-line';
    marker.append(dot, line, button);
    overlay.append(marker);
    const slot = { marker, dot, line, button, item: null, width: 0 };
    button.onclick = () => {
      if (!slot.item?.ready()) return;
      const { object, anchor } = slot.item;
      inspector.open(object, { object, point: object.localToWorld(anchor.clone()) });
    };
    return slot;
  });
  let topLimit = 0, bottomLimit = 0;
  function measure() {
    topLimit = hud.getBoundingClientRect().bottom + 53;
    bottomLimit = bottom.getBoundingClientRect().top - 8;
  }
  const observer = new ResizeObserver(measure);
  observer.observe(hud);observer.observe(bottom);
  addEventListener('resize', measure);
  measure();

  return function sync(items) {
    if (inspector.active) return;
    overlay.hidden = !items?.length || bottomLimit - topLimit < 36;
    if (overlay.hidden) return;
    camera.updateMatrixWorld();
    const placed = [], h = 36;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i], item = items[i];
      if (!item?.ready() || !isVisible(item.object)) { slot.marker.hidden = true; continue; }
      item.object.localToWorld(projected.copy(item.anchor)).project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.z) > 1) { slot.marker.hidden = true; continue; }
      const x = (projected.x + 1) * innerWidth / 2;
      const y = (1 - projected.y) * innerHeight / 2;
      if (y < topLimit - 38 || y > bottomLimit) { slot.marker.hidden = true; continue; }
      slot.marker.hidden = false;
      if (slot.item !== item) {
        slot.item = item;
        slot.button.textContent = item.text;
        slot.width = slot.button.offsetWidth;
      }
      const w = slot.width;
      const sides = x < innerWidth / 2 ? [-1, 1] : [1, -1];
      let box;
      for (const side of sides) {
        const left = side < 0 ? x - 15 - w : x + 15;
        if (left < 8 || left + w > innerWidth - 8) continue;
        for (const offset of [0, -h, h, -2 * h, 2 * h]) {
          const top = THREE.MathUtils.clamp(y - h / 2 + offset, topLimit, bottomLimit - h);
          if (placed.some(b => left < b.left + b.w + 4 && left + w + 4 > b.left && top < b.top + h + 4 && top + h + 4 > b.top)) continue;
          box = { left, top, w, end: side < 0 ? left + w : left };
          break;
        }
        if (box) break;
      }
      if (!box) { slot.marker.hidden = true; continue; }
      placed.push(box);
      const dx = box.end - x, dy = box.top + h / 2 - y;
      slot.button.style.transform = `translate(${box.left}px,${box.top}px)`;
      slot.dot.style.transform = `translate(${x - 2.5}px,${y - 2.5}px)`;
      slot.line.style.width = Math.hypot(dx, dy) + 'px';
      slot.line.style.transform = `translate(${x}px,${y}px) rotate(${Math.atan2(dy, dx)}rad)`;
    }
  };
}

export function createInspector({scene,camera,controls,canvas}) {
  const panel=document.getElementById('inspect'),title=panel.querySelector('h2'),what=panel.querySelector('.what'),role=panel.querySelector('.role');
  const closeButton=panel.querySelector('.close'),zoomButton=panel.querySelector('.zoom');
  const actions=panel.querySelector('.inspect-actions'),moreButton=panel.querySelector('.more');
  const poreReader=createPoreReader();
  const listButton=document.getElementById('inspect-list'),choices=panel.querySelector('.choices');
  const svg=document.getElementById('inspect-wire'),path=svg.querySelector('path'),node=svg.querySelector('circle'),rails=svg.querySelector('.rails');
  let selected=null,saved=null,motion=null,previousFocus=null,materialState=[];
  const target=new THREE.Vector3();
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let revealAge=0;
  let panelOnRight=true;

  function placePanel(object) {
    const projected=point(object).project(camera);
    panelOnRight=projected.x<=0;
    const compact=innerWidth<=600;
    panel.style.left=compact||!panelOnRight?'12px':'auto';
    panel.style.right=compact||panelOnRight?'12px':'auto';
    if(compact)return;
    const height=panel.offsetHeight;
    const ceiling=document.getElementById('hud').getBoundingClientRect().bottom+12;
    const y=(1-projected.y)*innerHeight/2;
    panel.style.top=Math.max(ceiling,Math.min(innerHeight-height-20,y-height/2-52))+'px';
  }

  function clearPlacement() {
    panel.classList.remove('callout');
    panel.style.left=panel.style.right=panel.style.top='';
  }
  const projectedPoint = new THREE.Vector3();
  let hitAnchor = null;
  function point(object) {
    if (hitAnchor) return hitAnchor.owner.localToWorld(projectedPoint.copy(hitAnchor.point));
    return infoWorldPoint(object, projectedPoint);
  }
  function restoreMaterials(){for(const [u,value] of materialState)u.value=value;materialState=[];}
  function highlight(object) {
    restoreMaterials();const chosen=new Set();scene.traverse(o=>{if(o.userData.info===object.userData.info)o.traverse(c=>{if(c.material)chosen.add(c.material);});});
    const seen=new Set();scene.traverse(o=>{
      const u=o.material?.uniforms?.strength;if(!u||seen.has(u)||!isVisible(o))return;seen.add(u);
      materialState.push([u,u.value]);u.value*=chosen.has(o.material)?1.45:.35;
    });
  }
  function start() {
    if(saved)return;
    previousFocus=document.activeElement;saved={p:camera.position.clone(),t:controls.target.clone(),enabled:controls.enabled,min:controls.minDistance,max:controls.maxDistance,damping:controls.enableDamping};
    controls.enableDamping=false;
    document.getElementById('bottom').inert=true;document.getElementById('hud').inert=true;
    panel.hidden=false;controls.enabled=true;closeButton.focus();
  }
  function open(object, hit) {
    if (selected === object) return;
    start();selected=object;motion=null;
    controls.enabled=true;
    hitAnchor = hit && !object.isSprite
      ? { owner: hit.object, point: hit.object.worldToLocal(hit.point.clone()) }
      : null;
    const data=INFO[object.userData.info];title.textContent=data[0];what.textContent=data[1];role.textContent=data[2];
    choices.replaceChildren();what.hidden=role.hidden=actions.hidden=false;
    moreButton.hidden=object.userData.info!=='pores';
    clearPlacement();
    // Фиксируем сброс анимации перед раскрытием следующей карточки.
    void panel.offsetWidth;
    // Measure the full panel before clipping its two borders towards the centre.
    panel.classList.add('callout');
    placePanel(object);
    revealAge=reduceMotion.matches ? .5 : 0;
    highlight(object);
    syncOverlay();
    if(reduceMotion.matches)closeButton.focus();
  }
  function close() {
    if(!saved)return;
    poreReader.close();restoreMaterials();camera.position.copy(saved.p);controls.target.copy(saved.t);controls.enabled=saved.enabled;controls.minDistance=saved.min;controls.maxDistance=saved.max;controls.enableDamping=saved.damping;
    saved=null;selected=null;motion=null;clearPlacement();panel.hidden=true;svg.setAttribute('hidden','');
    document.getElementById('bottom').inert=false;document.getElementById('hud').inert=false;previousFocus?.focus();
  }
  listButton.onclick=()=>{
    start();selected=null;motion=null;clearPlacement();controls.enabled=true;restoreMaterials();svg.setAttribute('hidden','');title.textContent='Что на экране';what.hidden=role.hidden=actions.hidden=true;
    const ids=new Set();choices.replaceChildren();
    for(const object of infoObjects(scene)) {
      const id=object.userData.info;if(ids.has(id))continue;ids.add(id);
      const b=document.createElement('button');b.textContent=INFO[id][0];b.onclick=()=>open(object);choices.append(b);
    }
  };
  closeButton.onclick=close;
  moreButton.onclick=()=>poreReader.show(moreButton);
  zoomButton.onclick=()=>{
    if(!selected)return;
    target.copy(point(selected));const focus=targets.get(selected)?.owner ?? (selected.isSprite?(infoObjects(scene).find(o=>!o.isSprite&&o.userData.info===selected.userData.info)||selected):selected);
    const box=new THREE.Box3().setFromObject(focus);
    const radius=box.getSize(new THREE.Vector3()).length()/2;
    const fit=radius*1.5/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(1,camera.aspect));
    const distance=THREE.MathUtils.clamp(fit,.7,saved.p.distanceTo(saved.t)*.9);
    const direction=camera.position.clone().sub(controls.target).normalize();
    motion={p:camera.position.clone(),t:controls.target.clone(),to:target.clone().addScaledVector(direction,distance),at:target.clone(),age:0};
    controls.minDistance=.15;controls.maxDistance=Math.max(saved.max,distance*2);controls.enabled=false;
  };
  document.addEventListener('keydown', e => { if (saved && !poreReader.open && e.key === 'Escape') close(); });
  function pick(ray) {
    const all=infoObjects(scene),hits=[];
    for(const object of all)for(const hit of ray.intersectObject(object,true)) {
      if(!isVisible(hit.object))continue;
      let o=hit.object;while(o&&!o.userData.info)o=o.parent;
      if(o&&INFO[o.userData.info])hits.push({...hit,info:o});
    }
    hits.sort((a,b)=>a.distance-b.distance);
    const hit=hits.find(h=>h.info.isSprite)||hits.find(h=>h.info.userData.info!=='membrane')||hits[0];
    if(hit){open(hit.info,hit);return true;}return false;
  }
  function update(dt) {
    if(!saved||poreReader.open)return;
    if(motion){motion.age+=dt;const u=Math.min(1,motion.age/.8),k=u*u*(3-2*u);camera.position.lerpVectors(motion.p,motion.to,k);controls.target.lerpVectors(motion.t,motion.at,k);if(u===1){motion=null;controls.enabled=true;}}
    if(!selected)return;
    const previousAge=revealAge;
    revealAge+=dt;
    if(previousAge<.49&&revealAge>=.49)closeButton.focus();
  }
  function syncOverlay() {
    if (!selected) return;
    // Проецируем метку с той же матрицей камеры, с которой рисуем молекулу.
    camera.updateMatrixWorld();
    const p=point(selected).project(camera);
    const r=panel.getBoundingClientRect();
    const outside=p.z>1||p.z< -1;
    svg.toggleAttribute('hidden',outside);
    if(outside)return;
    const x=(p.x+1)*innerWidth/2;
    const y=(1-p.y)*innerHeight/2;
    const endX=panelOnRight?r.left:r.right;
    const endY=r.top+r.height/2;
    const direction=panelOnRight?1:-1;
    // One diagonal followed by a horizontal shelf meeting the panel at its centre.
    const shelf=Math.min(42,Math.max(8,direction*(endX-x)*.42));
    svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    path.setAttribute('d',`M ${x} ${y} L ${endX-direction*shelf} ${endY} H ${endX}`);
    const draw=Math.min(1,revealAge/.16);
    path.setAttribute('stroke-dasharray','1 1');
    path.setAttribute('stroke-dashoffset',String(1-draw*draw*(3-2*draw)));
    // The brighter edges travel with the opening panel.
    const expand=Math.min(1,Math.max(0,(revealAge-.216)/.224));
    const halfHeight=7+(r.height/2-7)*expand*expand*(3-2*expand);
    rails.style.display=revealAge>=.18&&revealAge<.44?'':'none';
    rails.setAttribute('d',`M ${r.left} ${endY-halfHeight} H ${r.right} M ${r.left} ${endY+halfHeight} H ${r.right}`);
    node.setAttribute('cx',x);
    node.setAttribute('cy',y);
  }
  return {get active(){return !!saved;},open,close,pick,update,syncOverlay};
}
