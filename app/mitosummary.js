import * as THREE from 'three';
import { attachAnaphaseFibers } from './mitoanaphase.js';
import { BEND } from './mitochrom.js';
import { createCytokinesis } from './mitocytokinesis.js';
import { createTelophase } from './mitotelophase.js';

const phases = {
  prophase: { name: 'Профаза', clue: 'Хромосомы уплотняются внутри ещё видимого ядра.', mark: [52, 42] },
  metaphase: { name: 'Метафаза', clue: 'Хромосомы выстроились по экватору клетки.', mark: [50, 50] },
  anaphase: { name: 'Анафаза', clue: 'Дочерние хромосомы расходятся к противоположным полюсам.', mark: [51, 35] },
  telophase: { name: 'Телофаза', clue: 'Два ядра уже есть, и их окружает одна общая клеточная мембрана.', mark: [50, 39] },
  cytokinesis: { name: 'Цитокинез завершён', clue: 'У каждой дочерней клетки своё ядро и своя мембрана.', mark: [50, 48] },
};
const order = ['prophase', 'metaphase', 'anaphase', 'telophase'];
const shuffled = ['anaphase', 'telophase', 'prophase', 'metaphase'];

// Кадры снимаются с той же 3D-модели урока; каждый показывает признак своей фазы.
export function captureSchoolFrames(world, capture) {
  const frames = {};
  const dummy = { world, ui: { hud(){}, buttons(){}, label(){} }, controls: {} };
  function take(id, radius) {
    world.update(0, 3.5);
    world.group.updateMatrixWorld(true);
    frames[id] = capture(radius);
  }
  function spindlePose(separation) {
    world.pose('metaphase');world.envelope(1);world.cond(1);
    world.elongation=separation ? .9 : 0;
    world.spindle.elongate(world.elongation);
    world.chromosomes.forEach((ch,i)=>{
      const a=i*Math.PI/4-Math.PI/2, r=separation ? .57 : 1;
      const axis=new THREE.Vector3(0,1,0), arms=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
      ch.group.position.set(2.75*r*Math.cos(a),0,2.35*r*Math.sin(a));
      ch.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis,arms,new THREE.Vector3().crossVectors(axis,arms)));
      ch.goal.p.copy(ch.group.position);ch.goal.q.copy(ch.group.quaternion);
      ch.apart(separation);ch.bend(separation ? BEND.ana : BEND.meta);
    });
    attachAnaphaseFibers(world);
  }
  world.pose('prophase');world.cond(.91);
  world.spindle.spread(.64,.64);
  take('prophase', 4.58);
  spindlePose(0);take('metaphase', 4.58);
  spindlePose(2.12);take('anaphase', 4.95);
  world.pose('telophase');
  const handoff=createTelophase(dummy).prepareDivision();
  take('telophase',4.95);
  const division=createCytokinesis({...dummy,handoff});
  try { division.prepareFrame();take('cytokinesis',6.9); }
  finally { division.leave();world.pose('interphase'); }
  return frames;
}

export function createSummary({world,ui,next,capture}) {
  const board=document.getElementById('mito-summary');
  const cards=board.querySelector('.summary-cards'),prompt=board.querySelector('.summary-prompt');
  const feedback=board.querySelector('.summary-feedback');
  const map=new Map();
  let frames,step=0;

  function draw(ids){
    cards.replaceChildren();map.clear();
    for(const [i,id] of ids.entries()){
      const data=phases[id],button=document.createElement('button'),label=document.createElement('span');
      button.type='button';button.className='summary-card';
      const image=document.createElement('img');image.alt=data.clue;image.src=frames[id];
      const hint=document.createElement('i');hint.className='summary-mark';hint.setAttribute('aria-hidden','true');
      hint.style.setProperty('--focus-x',data.mark[0]+'%');hint.style.setProperty('--focus-y',data.mark[1]+'%');
      label.textContent='Кадр '+['А','Б','В','Г'][i];
      const visual=document.createElement('span');visual.className='summary-visual';visual.append(image,hint);
      button.append(visual,label);cards.append(button);map.set(id,{button,label});
    }
  }
  function mark(id,accept){
    for(const {button} of map.values())button.classList.remove('try-again');
    const {button,label}=map.get(id);
    button.classList.add(accept?'selected':'try-again');
    if(accept){
      button.disabled=true;label.textContent=(step?step+'. ':'')+phases[id].name;
      if(step>0)cards.insertBefore(button,cards.children[step-1]);
    }
    feedback.textContent=phases[id].clue;
  }
  function compare(){
    step=0;
    prompt.textContent='На каком кадре цитоплазма уже разделилась?';
    feedback.textContent='Посмотри на границы клеток.';
    draw(['telophase','cytokinesis']);
    ui.buttons([]);
    for(const [id,{button}] of map)button.onclick=()=>{
      const accept=id==='cytokinesis';mark(id,accept);
      if(!accept)return;
      const telophase=map.get('telophase');telophase.button.disabled=true;telophase.label.textContent=phases.telophase.name;
      prompt.textContent='Фазы по порядку, а деление завершено';
      feedback.textContent='В каждой дочерней клетке по 8 хромосом, 2n2c.';
      ui.buttons([{text:'Завершить урок',primary:true,onClick:next}]);
    };
  }
  function arrange(){
    board.hidden=false;
    prompt.textContent='Нажми на кадры в порядке фаз митоза';
    feedback.textContent='Выбрано 0 из 4. Начни с профазы.';
    draw(shuffled);
    for(const [id,{button}] of map)button.onclick=()=>{
      const accept=id===order[step];
      if(accept)step++;
      mark(id,accept);
      if(accept)prompt.textContent=step===4?'Четыре фазы расставлены верно':`Кадры по порядку · ${step} из 4`;
      if(step===4)ui.buttons([{text:'Сравнить два кадра',primary:true,onClick:compare}]);
    };
  }
  return {
    intro(){
      frames=capture();world.group.visible=false;
      ui.hud('<b>Итог урока</b><span>Узнай фазы по кадрам и проверь, когда из одной клетки получились две.</span>');
      arrange();
    },
    leave(){board.hidden=true;cards.replaceChildren();map.clear();},
  };
}
