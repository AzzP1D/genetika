import * as THREE from 'three';
import { BEND } from './mitochrom.js';
import { QUESTIONS } from './mitosis-data.js';
import { createCohesion } from './mitocohesin.js';
import { neon } from './style.js';
import { ease } from './motion.js';

// Анафаза: сначала снять когезию, затем показать движение и изменение счёта.
// Молекулярное действие иллюстрирует одновременное снятие множества связей в клетке.
export function createAnaphase(ctx) {
  const {ui,world,camera,controls,scene,fit,next}=ctx;
  const olymp=!!(globalThis.Level && Level.isOlymp());
  const sp=world.spindle, center=new THREE.Vector3();
  let live=true,mode='ready',timer=0,micro=null,cutGranted=false,released=false,question=0;
  let orbit=null,travelPath=null;
  const start=world.chromosomes.map((ch,i)=>{
    if(!world.metaphaseReady) {
      const a=i*Math.PI*2/8-Math.PI/2;
      ch.group.position.set(2.75*Math.cos(a),0,2.35*Math.sin(a));
      const x=new THREE.Vector3(0,1,0),y=new THREE.Vector3(Math.cos(a+Math.PI/2),0,Math.sin(a+Math.PI/2));
      ch.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,new THREE.Vector3().crossVectors(x,y)));
    }
    ch.goal.p.copy(ch.group.position);ch.goal.q.copy(ch.group.quaternion);
    ch.apart(0);ch.bend(BEND.meta);ch.shine(1);ch.pulse(1);
    return {p:ch.group.position.clone(),q:ch.group.quaternion.clone()};
  });
  world.envelope(1);world.cond(1);sp.dup(1);sp.spread(1,1);sp.open(1);sp.elongate(0);
  world.elongation=0;
  sp.clear();
  world.chromosomes.forEach((ch,i)=>{
    for(let sister=0;sister<2;sister++) sp.attach('ana:'+i+':'+sister,sister,out=>world.kinetochore(ch,sister,out),1);
  });
  const heldMat=neon(0xff5e7a,{glow:1.2,body:.5});
  const heldGeo=new THREE.TorusGeometry(.4,.035,6,36);
  const ties=world.chromosomes.map(ch=>{
    const ring=new THREE.Mesh(heldGeo,heldMat);ring.rotation.x=Math.PI/2;ch.group.add(ring);return ring;
  });
  let loading=createCohesion().then(k=>{if(!live)k.dispose();return k;},error=>({error}));
  const checkpoint=()=>world.chromosomes.every((ch,i)=>sp.attached('ana:'+i+':0',0)&&sp.attached('ana:'+i+':1',1));
  const overview=()=>new THREE.Vector3(.35,.25,1).normalize().multiplyScalar(fit(world.radius.cell)*1.2);
  function setCamera(position,target) {camera.position.copy(position);controls.target.copy(target);camera.lookAt(target);}
  function sources() {
    ui.label('<b>О моделях</b><br>Сепараза и секурин: <a href="https://www.rcsb.org/structure/7NJ1" target="_blank" rel="noopener">7NJ1</a>, Yu et al., 2021. Домены SMC1/SMC3: <a href="https://www.rcsb.org/structure/6WG3" target="_blank" rel="noopener">6WG3</a>, Shi et al., 2020. Данные RCSB PDB, CC0.'+
      '<br>Длинные плечи, гибкий RAD21, расположение ДНК и движение при расщеплении — учебная реконструкция. 6WG3 — инженерный комплекс загрузки; здесь не воспроизводится его устойчивость к расщеплению. 7NJ1 показывает ингибированную сепаразу: её действие на мишень реконструировано.');
  }
  function questionUI(q,done) {
    ui.hud('<b>Проверим причину и следствие</b><span>'+q.text+'</span>');
    ui.buttons(q.options.map(([id,text])=>({text,onClick:()=>{
      if(id!==q.answer){ui.label('<b class="err">Нет.</b> '+q.hints[id]);return;}
      ui.label('<b class="ok">Верно!</b> '+q.ok);
      ui.buttons([{text:'Далее',primary:true,onClick:done}]);
    }})),'column');
  }
  function ready() {
    ui.label(null);
    ui.hud('<b>Перед анафазой · 8 хромосом</b><span>Нити веретена уже тянут к разным полюсам. Но сестринские хроматиды удерживает когезин — белковый комплекс. Одного натяжения для разделения недостаточно.</span>'+
      '<br><span class="hint">Красные связи — условное обозначение когезии. ДНК уже удвоена, но сестры ещё соединены: 2n4c.</span>');
    ui.buttons([{text:'Начать анафазу',primary:true,onClick:begin}]);
  }
  function begin() {
    if(mode!=='ready')return;
    if(!checkpoint()) {ui.label('<b class="err">Контрольная точка не пройдена.</b> Каждая сестринская хроматида должна быть прикреплена к своему полюсу. Пока этого нет, сепараза остаётся заблокированной.');return;}
    mode='orbit';timer=0;ui.label(null);ui.buttons([]);controls.enabled=false;
    const r=fit(world.radius.cell)*1.18;
    orbit=new THREE.CatmullRomCurve3([camera.position.clone(),new THREE.Vector3(r*.7,r*.3,r*.7),new THREE.Vector3(r*.85,r*.15,r*.45),new THREE.Vector3(r*.25,r*.18,r*.86)],false,'centripetal');
    ui.hud('<b>Контрольная точка пройдена</b><span>Все 8 хромосом имеют двуполюсное прикрепление. Теперь клетка может снять блокировку сепаразы — фермента, освобождающего хроматиды.</span>'+
      (olymp?'<br><span class="hint">После выключения SAC комплекс APC/C–Cdc20 запускает разрушение секурина и циклина B. Сепараза освобождается от ингибирования.</span>':''));
  }
  async function molecular() {
    mode='loading';
    const k=await loading;if(!live)return;
    if(k.error){mode='ready';ready();ui.label('Не удалось загрузить крупный план. Проверьте соединение и повторите вход в этап.');return;}
    micro=k;
    ctx.fade(()=>{
      if(!live)return;
      world.group.visible=false;scene.add(k.group);mode='held';timer=0;
      controls.minDistance=.4;controls.maxDistance=fit(k.view.radius)*1.6;
      camera.far=100;camera.updateProjectionMatrix();
      setCamera(k.view.center.clone().add(new THREE.Vector3(1,.35,1.1).normalize().multiplyScalar(fit(k.view.radius))),k.view.center);
      controls.enabled=true;
      ui.hud('<b>Когезин держит. Сепараза заблокирована.</b><span>Показан увеличенный участок ДНК двух сестёр. Когезин удерживает их вместе. Секурин — белок-блокатор — пока мешает сепаразе действовать.</span>'+
        '<br><span class="hint">Один комплекс иллюстрирует множество удерживающих связей в центромерной области.</span>');
      ui.buttons([
        {text:'Попробовать развести сестёр',onClick:()=>{if(mode!=='held')return;micro.tug();ui.label('Натяжение есть, но связь когезина ещё цела. Сёстры не освобождаются. Нужно сначала снять удерживающую связь.');}},
        {text:'Активировать сепаразу',primary:true,onClick:()=>{
          if(mode!=='held'||!checkpoint())return;
          micro.activate();mode='unblocking';ui.label(null);ui.buttons([]);
          ui.hud('<b>Снимаем блокировку фермента</b><span>Белок-блокатор разрушается, и сепараза освобождается. Сам когезин пока ещё цел.</span>'+
            (olymp?'<br><span class="hint">Здесь показан уход секурина. В клетке APC/C также запускает разрушение циклина B; это снимает второй путь ингибирования сепаразы.</span>':''));
        }},
        {text:'О моделях',onClick:sources},
      ]);
    });
  }
  function target() {
    mode='target';
    ui.hud('<b>Сепараза активна. Выберите её мишень.</b><span>Что нужно расщепить, чтобы освободить сестринские хроматиды и сохранить наследственную информацию?</span>');
    ui.buttons([
      {text:'ДНК в центромере',onClick:()=>ui.label('<b class="err">ДНК разрезать нельзя.</b> Это повредит наследственную информацию. Сепараза расщепляет белок, а не ДНК.')},
      {text:'Белок когезина (RAD21)',primary:true,onClick:()=>{
        if(mode!=='target')return;
        micro.cut();mode='cutting';ui.label(null);ui.buttons([]);
        ui.hud('<b>Сепараза расщепляет RAD21</b><span>RAD21 — белковая часть когезина. После её расщепления удерживающая связь раскрывается. Обе молекулы ДНК остаются целыми.</span>');
      }},
      {text:'Нить веретена',onClick:()=>ui.label('<b class="err">Нить нужна для движения.</b> Её разрушение убрало бы прикрепление, но не сняло бы когезию сестёр.')},
    ],'column');
  }
  function cause() {
    mode='cause';
    questionUI(QUESTIONS.anaphaseCause,()=>{
      cutGranted=true;
      ui.hud('<b>Связь снята → движение разрешено</b><span>Мы рассмотрели один комплекс. В клетке сепараза расщепляет множество оставшихся комплексов когезина, и сестринские хроматиды освобождаются почти одновременно.</span>');
      ui.label('Теперь каждая разошедшаяся хроматида будет считаться дочерней хромосомой.');
      ui.buttons([{text:'Посмотреть расхождение в клетке',primary:true,onClick:()=>{
        if(mode!=='cause'||!cutGranted||!checkpoint())return;
        mode='returning';ui.buttons([]);
        ctx.fade(()=>{
          if(!live)return;
          scene.remove(micro.group);micro.dispose();micro=null;
          world.group.visible=true;camera.far=60;camera.updateProjectionMatrix();
          controls.minDistance=.8;controls.maxDistance=fit(world.radius.cell)*1.5;
          setCamera(overview(),center);startTravel();
        });
      }}]);
    });
  }
  function startTravel() {
    if(!cutGranted||!checkpoint())return;
    mode='travel';timer=0;released=true;
    controls.enabled=false;ui.label(null);ui.buttons([]);
    world.chromosomes.forEach((ch,i)=>{ch.group.position.copy(start[i].p);ch.goal.p.copy(start[i].p);ch.group.quaternion.copy(start[i].q);ch.apart(0);ch.bend(BEND.meta);});
    world.elongation=0;sp.elongate(0);ties.forEach(t=>t.visible=false);
    const r=fit(world.radius.cell)*1.15;
    travelPath=new THREE.CatmullRomCurve3([overview(),new THREE.Vector3(r*.65,r*.2,r*.67),new THREE.Vector3(r*.5,r*.25,r*.5),new THREE.Vector3(r*.25,r*.48,r*.45),overview()],false,'centripetal');
    ui.hud('<b>Анафаза · 16 дочерних хромосом</b><span>Когезия снята. Кинетохорные микротрубочки укорачиваются и тянут дочерние хромосомы центромерной областью вперёд; плечи отстают.</span>'+
      '<br><span class="hint">К каждому полюсу направляются 8. ДНК не удваивается: количество ДНК во всей клетке остаётся 4c.</span>');
  }
  function finished() {
    mode='finished';controls.enabled=true;
    ui.hud('<b>У каждого полюса — полный набор</b><span>16 дочерних хромосом во всей клетке, по 8 у каждого полюса. Каждая содержит одну молекулу ДНК. Клетка ещё не разделилась.</span>'+
      (olymp?'<br><span class="hint">Анафаза A: укорочение кинетохорных микротрубочек. Анафаза B: раздвижение полюсов. Во всей клетке 4n4c, у одного полюса 2n2c.</span>':''));
    ui.buttons([{text:'Проверить понимание',primary:true,onClick:()=>{question=0;questions();}},{text:'Повторить расхождение',onClick:startTravel},{text:'О моделях',onClick:sources}]);
  }
  const quiz=[QUESTIONS.anaphaseIdentity,QUESTIONS.anaphaseCount,QUESTIONS.anaphaseDNA,...(olymp?[QUESTIONS.anaphaseOlymp]:[])];
  function questions() {
    mode='quiz';
    if(question>=quiz.length){mode='complete';ui.hud('<b>Анафаза завершена</b><span>Сепараза сняла белковую связь. Веретено развело дочерние хромосомы. Каждая будущая клетка получила полный набор без нового удвоения ДНК.</span>');ui.buttons([{text:'К телофазе',primary:true,onClick:next}]);return;}
    questionUI(quiz[question],()=>{question++;questions();});
  }
  return {
    get state(){return mode;},
    get evidence(){return {released,cutGranted,chromosomes:released?16:8,perPole:released?8:null,checkpoint:checkpoint()};},
    intro(){ctx.fly(overview(),center.clone(),1.6);ready();},
    update(dt){
      timer+=dt;
      if(mode==='orbit'){
        controls.enabled=false;setCamera(orbit.getPointAt(ease(Math.min(1,timer/2.8))),center);
        if(timer>=2.8)molecular();
      }
      if(micro){micro.update(dt);if(mode==='unblocking'&&micro.ready)target();if(mode==='cutting'&&micro.cutDone)cause();}
      if(mode==='travel'){
        const u=Math.min(1,timer/12);
        const split=u<.22?.38*ease(u/.22):.38+2.12*ease((u-.22)/.78);
        const extension=ease(THREE.MathUtils.smoothstep(u,.3,1));
        world.elongation=extension;sp.elongate(extension);
        world.chromosomes.forEach((ch,i)=>{
          ch.apart(split+.28*extension);ch.bend(BEND.meta+(BEND.ana-BEND.meta)*ease(Math.min(1,u/.45)));
          ch.goal.p.copy(start[i].p).multiplyScalar(1-.48*ease(u));
        });
        const look=new THREE.Vector3();world.chromosomes[0].chromatids[0].kinetochore.getWorldPosition(look);
        look.multiplyScalar(.45*Math.sin(Math.PI*u));
        controls.enabled=false;setCamera(travelPath.getPointAt(u),look);
        if(u===1)finished();
      }
    },
    leave(){
      live=false;
      if(micro){scene.remove(micro.group);micro.dispose();micro=null;}
      else loading.then(k=>{if(k&&!k.error)k.dispose();});
      world.group.visible=true;controls.enabled=true;camera.far=60;camera.updateProjectionMatrix();
      ties.forEach(t=>t.removeFromParent());heldGeo.dispose();heldMat.dispose();sp.clear();
    },
  };
}
