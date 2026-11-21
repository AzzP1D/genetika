import * as THREE from 'three';
import { BEND } from './mitochrom.js';
import { attachAnaphaseFibers } from './mitoanaphase.js';
import { createDaughterEnvelope } from './mitoenvelope.js';
import { createEnvelopeDetail } from './mitoenvdetail.js';
import { ease } from './motion.js';

// Восстановление двух ядер в одной клетке. Исходные 16 хромосом сохраняются.
export function createTelophase(ctx) {
  const {world,ui,controls,camera,scene}=ctx,sp=world.spindle;
  const olymp=!!globalThis.Level?.isOlymp();
  let mode='ready',age=0,poresExplained=false,live=true,detail=null,overview=null;
  world.envelope(0);
  const nuclei=[-1,1].map(side=>{
    const envelope=createDaughterEnvelope(world.nucleus,side);
    const nucleolus=world.nucleolus.clone();nucleolus.material=nucleolus.material.clone();
    nucleolus.position.set(.4,side*3.25+.25,.2);nucleolus.scale.setScalar(.001);
    world.group.add(envelope.shell,nucleolus);
    return {envelope,nucleolus,side};
  });
  const overviewLabels=[nuclei[1].envelope.labels.er,nuclei[0].envelope.labels.membrane,nuclei[1].envelope.labels.pore];
  world.envelope(1);world.nucleolus.visible=false;world.elongation=1;
  // Не показываем старые условные пузырьки как отдельное третье ядро.
  world.group.traverse(o=>{if(o.isInstancedMesh&&o.count===44)o.visible=false;});
  sp.dup(1);sp.spread(1,1);sp.open(1);sp.elongate(1);
  if(!world.carryAnaphase) {
    world.chromosomes.forEach((ch,i)=>{
      const a=i*Math.PI/4-Math.PI/2;
      ch.group.position.set(2.75*Math.cos(a)*.52,0,2.35*Math.sin(a)*.52);
      const x=new THREE.Vector3(0,1,0),y=new THREE.Vector3(Math.cos(a+Math.PI/2),0,Math.sin(a+Math.PI/2));
      ch.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,new THREE.Vector3().crossVectors(x,y)));
      ch.goal.p.copy(ch.group.position);ch.goal.q.copy(ch.group.quaternion);ch.apart(2.78);ch.bend(BEND.ana);ch.cond(1);
    });
    attachAnaphaseFibers(world);
  }
  world.group.updateMatrixWorld(true);
  const daughters=[];
  world.chromosomes.forEach((ch,i)=>ch.chromatids.forEach(s=>{
    const original={parent:s.object.parent,p:s.object.position.clone(),q:s.object.quaternion.clone()};
    world.group.attach(s.object);
    const start=s.object.position.clone(),rotation=s.object.quaternion.clone(),side=start.y<0?-1:1;
    const a=i*Math.PI/4;
    daughters.push({s,ch,original,start,rotation,side,goal:new THREE.Vector3(.65*Math.cos(a),side*3.25+.4*Math.sin(a),.65*Math.sin(a))});
  }));
  const settledRotation=new THREE.Quaternion();
  function buildShells(progress,k){
    nuclei.forEach(n=>n.envelope.update(progress));
    daughters.forEach(d=>{
      d.s.object.position.lerpVectors(d.start,d.goal,k);
      d.s.object.quaternion.slerpQuaternions(d.rotation,settledRotation,k);
    });
    sp.compact(k);
  }
  function unpack(k){
    for(const d of daughters){
      d.s.object.updateMatrix();const u=d.s.material.uniforms;
      u.uHome.value.copy(new THREE.Vector3(0,d.side*3.25,0).applyMatrix4(d.s.object.matrix.clone().invert()));
      u.uCage.value=1.7;u.uCond.value=1-k;d.s.kinetochore.visible=k<.2;
    }
    nuclei.forEach(n=>{n.nucleolus.visible=k>.2;n.nucleolus.scale.setScalar(Math.max(.001,.65*k));});
  }
  function cleanup(){
    for(const d of daughters){
      d.original.parent.add(d.s.object);d.s.object.position.copy(d.original.p);d.s.object.quaternion.copy(d.original.q);
      d.ch.cage(new THREE.Vector3(),2.79);
    }
    for(const n of nuclei){n.envelope.dispose();n.nucleolus.removeFromParent();n.nucleolus.material.dispose();}
    sp.clear();sp.compact(0);world.carryAnaphase=false;
  }
  function passDaughters(){
    const cells=nuclei.map(n=>{
      const group=new THREE.Group();
      group.position.y=n.side*3.25;world.group.add(group);
      group.attach(n.envelope.shell);group.attach(n.nucleolus);
      const chromosomes=daughters.filter(d=>d.side===n.side).map(d=>d.s.object);
      chromosomes.forEach(object=>group.attach(object));
      return {group,side:n.side,nucleus:n.envelope.shell,chromosomes};
    });
    return {cells,dispose(){cleanup();cells.forEach(cell=>cell.group.removeFromParent());}};
  }
  function choose() {
    ui.hud('<b>Телофаза</b><span>Хромосомы достигли полюсов. Восстановим два ядра вокруг разошедшихся наборов.</span>');
    mode='choose';
    (ui.question||ui.hud)('<b>Телофаза · восстановим ядра</b><span>У каждого полюса — полный набор из 8 дочерних хромосом. Где должна собраться ядерная оболочка?</span>');
    ui.buttons([
      {text:'Вокруг каждого из двух наборов',onClick:()=>{
        mode='shells';age=0;sp.releaseKinetochores();ui.label(null);ui.buttons([]);
        ui.hud('<b>Откуда берётся оболочка?</b><span>Участки мембраны эндоплазматической сети подходят к хромосомам и начинают охватывать каждый набор.</span>');
      }},
      {text:'Вокруг каждой хромосомы отдельно',onClick:()=>ui.label('Каждое будущее ядро должно получить весь набор из 8 хромосом. Собираем два ядра, а не 16.')},
      {text:'Одна оболочка вокруг обоих наборов',onClick:()=>ui.label('Наборы уже разошлись. Вокруг каждого формируется собственная оболочка.')},
    ],'column');
  }
  function packed() {
    mode='packed';
    ui.hud('<b>Оболочки собраны. Что станет с хромосомами?</b><span>Распакуйте хроматин и наблюдайте: ДНК остаётся внутри ядер, а её плотная укладка ослабевает.</span>');
    ui.buttons([
      {text:'Распаковать хроматин',primary:true,onClick:()=>{
        mode='unpack';age=0;ui.buttons([]);ui.label(null);
        ui.hud('<b>Хроматин становится рыхлее</b><span>Хромосомы сохраняются, но их плотная укладка ослабевает. Восстанавливаются ядрышки.</span>');
      }},
      ...(olymp?[{text:'Как закрывается разрыв?',onClick:openDetail}]:[]),
    ]);
  }
  function closeDetail() {
    mode='returning';ui.buttons([]);ui.label(null);
    ctx.fade(()=>{
      if(!live)return;
      detail.dispose();detail=null;world.group.visible=true;
      camera.position.copy(overview.position);controls.target.copy(overview.target);
      controls.minDistance=overview.min;controls.maxDistance=overview.max;
      camera.lookAt(controls.target);overview=null;packed();
    });
  }
  function detailButtons(step) {
    const item=[
      ['Собрать белки у разрыва','recruit','<b>LEM2 собирает белки у края</b><span>LEM2 связывается с BAF у хроматина. У разрыва LEM2 привлекает CHMP7, который запускает сборку ESCRT-III.</span>'],
      ['Подвести спастин','sever','<b>Спастин разрезает микротрубочку</b><span>Микротрубочка проходит сквозь разрыв и мешает краям сомкнуться. Спастин разрезает её, и фрагменты расходятся.</span>'],
      ['Замкнуть мембраны','seal','<b>Оболочка замыкается</b><span>После удаления микротрубочки ESCRT-III помогает сузить временный разрыв и замкнуть мембраны.</span>'],
    ][step];
    const buttons = item ? [{text:item[0],primary:true,onClick:()=>{
      mode=item[1];age=0;ui.label(null);ui.hud(item[2]);ui.buttons([]);
    }}] : [];
    ui.buttons([...buttons,{text:'Вернуться к ядрам',primary:!item,onClick:closeDetail}]);
  }
  async function openDetail() {
    mode='detail-loading';ui.buttons([]);ui.label(null);
    ui.hud('<b>Крупный план оболочки</b><span>Загружаются структуры для молекулярной сцены.</span>');
    try { detail=await createEnvelopeDetail(); }
    catch(error){
      if(live){packed();ui.label('Крупный план не загрузился. Попробуйте открыть его ещё раз.');}
      return;
    }
    if(!live){detail.dispose();detail=null;return;}
    overview={position:camera.position.clone(),target:controls.target.clone(),min:controls.minDistance,max:controls.maxDistance};
    ctx.fade(()=>{
      if(!live)return;
      world.group.visible=false;scene.add(detail.group);
      const r=ctx.fit(4.05);
      controls.minDistance=1.3;controls.maxDistance=r*1.6;
      controls.target.set(0,0,0);camera.position.set(.44,.65,1).normalize().multiplyScalar(r);
      camera.lookAt(controls.target);mode='detail-ready';
      ui.hud('<b>Крупный план · временный разрыв</b><span>Микротрубочка проходит сквозь разрыв. Со стороны ядра BAF связывает два участка ДНК на поверхности хроматина.</span><br><span class="hint">Структуры из PDB: BAF с ДНК (2BZF), нуклеосома (1KX5), спастин (6PEN), тубулин (3IZ0). Продолжения ДНК, LEM2 и сборка ESCRT реконструированы.</span>');
      detailButtons(0);
    });
  }
  function quiz() {
    mode='quiz';(ui.question||ui.hud)('<b>Два ядра — уже две клетки?</b><span>Что произошло к концу показанной телофазы?</span>');
    ui.buttons([
      {text:'Образовались два ядра; цитоплазму ещё нужно разделить',onClick:()=>{
        ui.label('Верно. В каждом ядре — 8 однохроматидных хромосом (2n2c). ДНК заново не удваивалась.');
        poreQuiz();
      }},
      {text:'Клетка уже разделилась на две',onClick:()=>ui.label('Пока показана одна клетка с двумя ядрами. Разделение цитоплазмы называется цитокинезом.')},
      {text:'Хромосомы исчезли при распаковке',onClick:()=>ui.label('Хромосомы сохранились. Их хроматин стал менее плотным, поэтому отдельные хромосомы различить труднее.')},
    ],'column');
  }
  function poreQuiz(){
    mode='pore-quiz';
    (ui.question||ui.hud)('<b>Почему временный разрыв закрывается, а ядерные поры остаются?</b>');
    ui.buttons([
      {text:'Разрыв постепенно превращается в ядерную пору',onClick:()=>ui.label('Поры собираются из белков в уже сформированной мембране. Края временного разрыва смыкаются.')},
      {text:'Разрыв закрывается, а поры обеспечивают обмен между ядром и цитоплазмой',onClick:()=>{
        mode='complete';ui.label('Верно. Восстановленная оболочка отделяет ядро, а белковые комплексы пор пропускают нужные молекулы.');
        ui.hud('<b>Телофаза завершена</b><span>Ядерные оболочки восстановились, хроматин стал рыхлее, появились ядрышки. Следующий шаг — разделение цитоплазмы.</span>');
        ui.buttons([{text:'К цитокинезу',primary:true,onClick:ctx.next}]);
      }},
      {text:'Поры остаются, чтобы через них выходили микротрубочки',onClick:()=>ui.label('Микротрубочки убираются из временного разрыва. Поры обеспечивают обмен молекулами между ядром и цитоплазмой.')},
    ],'column');
  }
  return {
    get state(){return mode;},
    get labels(){
      if(mode==='shells'||mode==='packed')return overviewLabels;
      if(detail&&mode!=='detail-loading'&&mode!=='returning')return detail.labels;
      return [];
    },
    get evidence(){return {daughters:daughters.length,perNucleus:nuclei.map(n=>daughters.filter(d=>d.side===n.side).length),envelopes:nuclei.map(n=>n.envelope.progress)};},
    // Тот же кадр конца телофазы при входе в цитокинез напрямую.
    prepareDivision(){buildShells(1,1);unpack(1);sp.clear();return passDaughters();},
    intro(){ctx.fly(new THREE.Vector3(.25,.18,1).normalize().multiplyScalar(ctx.fit(world.radius.cell)*1.25),new THREE.Vector3(),1.6);controls.enabled=true;choose();},
    update(dt){
      age+=dt;
      if(mode==='shells') {
        const progress=Math.min(1,age/5),k=ease(progress);
        buildShells(progress,k);
        if(!poresExplained&&progress>.44){
          poresExplained=true;
          ui.hud('<b>В мембране собираются поры</b><span>Временные разрывы между участками мембраны закрываются. Жёлтые поры собираются в уже покрытых местах и будут пропускать вещества между ядром и цитоплазмой.</span>');
        }
        if(k===1)packed();
      }
      if(mode==='recruit'||mode==='sever'||mode==='seal'){
        const step=mode==='recruit'?0:mode==='sever'?1:2;
        const k=ease(Math.min(1,age/[2.4,3.2,2.5][step]));
        detail.set({recruit:step===0?k:1,sever:step===0?0:step===1?k:1,seal:step===2?k:0});
        if(k===1){
          mode='detail-ready';
          if(step===2)ui.label('Временный разрыв исчез. Ядерные поры остаются в других участках оболочки и обеспечивают транспорт.');
          detailButtons(step+1);
        }
      }
      if(mode==='unpack') {
        const k=ease(Math.min(1,age/6));
        unpack(k);
        if(k===1){ui.label(olymp?'В каждом ядре 2n2c. Снижение активности Cdk1 позволяет восстановить ядерную оболочку. Ядрышки формируются у участков синтеза рРНК.':'ДНК обёрнута вокруг гистонов и остаётся хроматином. В ядрышках возобновляется образование компонентов рибосом.');quiz();}
      }
    },
    leave({carryTelophase=false}={}){
      live=false;
      detail?.dispose();detail=null;world.group.visible=true;
      if(overview){controls.minDistance=overview.min;controls.maxDistance=overview.max;}
      if(carryTelophase&&mode==='complete')return passDaughters();
      cleanup();
    },
  };
}
