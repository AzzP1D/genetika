import * as THREE from 'three';
import { createTelophase } from './mitotelophase.js';
import { createPlantDivision } from './mitoplantdivision.js';
import { createCytoDetail } from './mitocyto-olymp.js';
import { infoTag } from './mitoinfo.js';
import { neon } from './style.js';
import { ease } from './motion.js';

const { lerp, clamp, smoothstep } = THREE.MathUtils;
const TAU = Math.PI * 2;
const LOBE_HEIGHT = 4.95;
const LOBE_RADIUS = 4.9;
const BRIDGE = .936;
const CUT_LATITUDE = -.065;
const HOLD_HINT = '<span class="hint hold-hint hold-idle">Удерживайте текст, чтобы поставить на паузу</span><span class="hint hold-hint hold-active">Пауза · отпустите, чтобы продолжить</span>';
const PLANT_DURATION = 13;
const PLANT_STEPS = [
  [0, 'Собирается фрагмопласт', 'Между дочерними ядрами растут два встречных массива микротрубочек. Их концы обращены к плоскости будущей перегородки.'],
  [.135, 'Пузырьки идут к центру', 'Аппарат Гольджи поставляет мембранные пузырьки. Они движутся вдоль микротрубочек к плоскости деления.'],
  [.30, 'Пузырьки соединяются в сеть', 'В середине клетки мембраны пузырьков сливаются. Получается сеть трубочек, которая постепенно уплотняется.'],
  [.54, 'Пластинка растёт от центра', 'В центре микротрубочки разбираются, а по краю растут новые. Пузырьки перемещаются к растущему краю пластинки.'],
  [1, 'Новая граница между клетками', 'Золотой слой показывает будущую клеточную стенку. Бирюзовые слои соединяются с мембраной материнской клетки и становятся мембранами дочерних клеток.'],
];

function disposeShapes(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  root.removeFromParent();
}

function createRing(radius) {
  const group = infoTag(new THREE.Group(), 'contractileRing', new THREE.Vector3(radius, 0, 0));
  const actin = neon(0xff2b4a, { glow: 1.7, body: .75 });
  const fibers = [];
  const segments = 14, sides = 5;
  function draw(mesh,length){
    const first=Math.floor((segments-length)/2);
    mesh.geometry.setDrawRange(first*sides*6,length*sides*6);
  }
  for (let strand = 0; strand < 4; strand++) {
    for (let sector = 0; sector < 8; sector++) {
      const points = Array.from({length: 11}, (_, i) => {
        const a = TAU * (sector + strand * .28 + i / 10 * 1.023) / 8;
        const r = radius - .18 + .075 * Math.cos(a * 9 + strand);
        const y = .116 * (strand - 1.5) + .077 * Math.sin(a * 7 + strand);
        return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
      });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points), segments, .043, sides, false,
      ), actin);
      group.add(mesh);
      const offset = (sector % 2 === 0 ? -1 : 1) * (.36 + .21 * ((sector + strand) % 4));
      fibers.push({mesh, offset, rotation: .13 * Math.sin(sector * 8 + strand), delay: (sector * 3 + strand) % 7 * .055});
    }
  }
  const myosin = neon(0xff9974, { glow: 1.05, body: .9 });
  const link = new THREE.CapsuleGeometry(.055,.30,3,6);
  const up = new THREE.Vector3(0,1,0);
  const motors = [];
  for (let i = 0; i < 18; i++) {
    const a = TAU * i / 18;
    const part = new THREE.Mesh(link,myosin);
    const y = .045 * Math.sin(i * 3);
    part.position.set((radius - .18) * Math.cos(a), y, (radius - .18) * Math.sin(a));
    part.quaternion.setFromUnitVectors(up,new THREE.Vector3(-Math.sin(a),.37,Math.cos(a)).normalize());
    group.add(part);
    motors.push({mesh: part, y, offset: .46 * Math.cos(i * 2.9), delay: .24 + i % 5 * .066});
  }
  return {
    group,
    set(k){
      for(const {mesh,offset,rotation,delay} of fibers){
        const growth=smoothstep(k,delay,.97);
        draw(mesh,Math.round(lerp(1+Math.round(delay*4),segments,growth)));
        mesh.position.y=offset*(1-growth);
        mesh.rotation.y=rotation*(1-growth);
      }
      for(const {mesh,y,offset,delay} of motors){
        const joining=smoothstep(k,delay,.95);
        mesh.visible=joining>0;
        mesh.position.y=lerp(y+offset,y,joining);
        mesh.scale.setScalar(lerp(.35,1,joining));
      }
    },
    disassemble(k){
      for(const {mesh,delay} of fibers){
        const left=1-smoothstep(k,delay*.9,.63+delay*.9);
        draw(mesh,Math.round(segments*left));
        mesh.visible=left>0;
      }
      for(const {mesh,delay} of motors){
        const left=1-smoothstep(k,delay-.24,delay+.13);
        mesh.visible=left>.025;
        mesh.scale.setScalar(left);
      }
    },
  };
}

function createMidbody(){
  const group=infoTag(new THREE.Group(),'midbody');
  const core=infoTag(new THREE.Mesh(new THREE.SphereGeometry(1,16,12),
    neon(0xcee681,{body:.82,glow:.74,strength:.83})),'midbody');
  core.scale.set(.158,.098,.158);
  group.add(core);
  const cap=new THREE.Mesh(new THREE.CapsuleGeometry(.151,.36,5,14),
    neon(0x48edeb,{glass:true,body:.34,glow:.73,strength:.67}));
  cap.position.y=-.15;
  cap.visible=false;group.add(cap);
  group.visible=false;
  return {group,cap};
}

export function createCytokinesis(ctx) {
  const {world,ui,camera,controls,scene,fit,fly,next}=ctx;
  const olymp=!!globalThis.Level?.isOlymp();
  const handoff = ctx.handoff ?? createTelophase(ctx).prepareDivision();
  const {cells}=handoff;
  const {membrane,spindle}=world;
  const source=membrane.geometry, original=source.getAttribute('position');
  const shape=source.clone(), positions=shape.getAttribute('position');
  const scale=world.group.scale.x;
  const radius=world.radius.cell/scale;
  const assembly=createRing(radius), ring=assembly.group;
  assembly.set(0);world.group.add(ring);
  const {group:midbody,cap}=createMidbody();
  world.group.add(midbody);
  membrane.geometry=shape;
  const daughterGeometry=new THREE.SphereGeometry(1,48,32);
  const shells=cells.map(cell=>{
    const shell=infoTag(new THREE.Mesh(daughterGeometry,membrane.material),'membrane');
    shell.scale.set(LOBE_RADIUS,LOBE_HEIGHT,LOBE_RADIUS);shell.visible=false;cell.group.add(shell);
    return shell;
  });
  const startY=cells.map(cell=>cell.group.position.y);
  let mode='ring-ready', age=0, progress=0, target=0, waist=radius, cellCount=1, ringProgress=0;
  let ringRemaining=1, bridgeClearance=0, neck=0, remnantSide=0;
  let plate=0, plant=null, plantPhase=-1, plantPaused=false, plantView=null;
  let plantSeen=false;
  let detail=null, viewBeforeDetail=null;
  let grab=null;
  const p=new THREE.Vector3(), screenPoint=new THREE.Vector3(), projected=new THREE.Vector2();
  const initialLength=1+.18*world.elongation;
  const ringLabels=[{text:'Сократимое кольцо',object:ring,anchor:new THREE.Vector3(-radius,0,0),ready:()=>ring.visible}];
  const bridgeLabels=[{text:'Срединное тельце',object:midbody,anchor:new THREE.Vector3(.14,0,0),ready:()=>midbody.visible}];

  function setShape(k,cut=0) {
    if(k===progress&&cut===neck)return;
    progress=k;neck=cut;
    waist=radius*(1-k);
    const throat=smoothstep(k,.71,BRIDGE), throatLength=.094*throat;
    for(let i=0;i<original.count;i++){
      p.fromBufferAttribute(original,i);
      const rad=Math.hypot(p.x,p.z), u=p.y/p.length();
      const lobeU=Math.max(0,(Math.abs(u)-throatLength)/(1-throatLength));
      const lobe=LOBE_RADIUS*Math.sqrt(Math.max(0,1-(2*lobeU-1)**2));
      const atCut=1-smoothstep(Math.abs(u-CUT_LATITUDE),.008,.062);
      const contraction=rad>1e-6 ? lerp(rad,lobe,k)*(1-.94*cut*atCut)/rad : 1;
      positions.setXYZ(i,p.x*contraction,lerp(p.y,2*LOBE_HEIGHT*u/initialLength,k),p.z*contraction);
    }
    positions.needsUpdate=true;shape.computeVertexNormals();
    shape.boundingSphere=shape.boundingBox=null;
    ring.scale.set(Math.max(.02,1-k),.7+.3*(1-k),Math.max(.02,1-k));
    cells.forEach((cell,i)=>{cell.group.position.y=lerp(startY[i],cell.side*LOBE_HEIGHT,k);});
    const coreGrowth=smoothstep(k,.77,BRIDGE);
    midbody.visible=coreGrowth>0;
    midbody.scale.setScalar(lerp(.35,1,coreGrowth));
  }
  const cameraDirection=new THREE.Vector3(.26,.19,1).normalize();
  function frame(radius,seconds){fly(cameraDirection.clone().multiplyScalar(fit(radius)),new THREE.Vector3(),seconds);}
  function holdText(title,text){ui.hud(`<b>${title}</b><span>${text}</span>${HOLD_HINT}`);}
  function ringReady(){
    mode='ring-ready';
    ui.hud('<b>Как собирается сократимое кольцо</b><span>Подготовка к разделению цитоплазмы начинается в конце анафазы. Рассмотрим, как под мембраной животной клетки собирается кольцо из актина и миозина.</span>');
    ui.buttons([
      ...(olymp?[{text:'Как клетка выбирает место деления?',primary:true,onClick:()=>openDetail('ring')}]:[]),
      {text:'Собрать кольцо',primary:!olymp,onClick:assemble},
    ]);
  }
  function assemble(){
    mode='ring-assembly';age=0;
    ui.hold(true);
    holdText('Актин собирается в пояс','Сигналы от веретена задают место деления. Короткие нити актина удлиняются в поясе под мембраной.');
    ui.buttons([]);
  }
  function pinch(){
    mode='pinch';
    ui.hold(false);
    ui.hud('<b>Кольцо замкнулось</b><span>Потяните алое кольцо к середине. Оно стянет мембрану, и появится борозда деления.</span>');
    ui.buttons([{text:'Стянуть кольцо',primary:true,onClick:()=>{target=BRIDGE;}}]);
  }
  function bridge(){
    mode='bridge';age=0;
    const target=new THREE.Vector3(0,-.25*scale,0);
    const direction=new THREE.Vector3(.19,.09,1).normalize();
    fly(direction.multiplyScalar(fit(world.radius.cell*.26)).add(target),target,1.1);
    bridgeReady();
  }
  function bridgeReady(){
    mode='bridge';
    ui.hud('<b>Крупный план · межклеточный мостик</b><span>Цитоплазма ещё соединена. Зелёные микротрубочки проходят через мостик и сходятся у срединного тельца.</span>');
    ui.buttons([
      ...(olymp?[{text:'Как разделяется мостик?',primary:true,onClick:()=>openDetail('bridge')}]:[]),
      {text:'Разделить клетки',primary:!olymp,onClick:startSeparation},
    ]);
  }
  function startSeparation(){
    mode='ring-disassembly';age=0;ui.buttons([]);ui.hold(true);
    holdText('Сократимое кольцо разбирается','Борозда уже стянулась. Алые нити актина укорачиваются, и миозин отсоединяется. Зелёный пучок пока остаётся в мостике.');
  }
  function openDetail(kind){
    if(detail)return;
    mode='cyto-detail';
    ui.buttons([]);ui.hold(false);ui.label(null);
    viewBeforeDetail={position:camera.position.clone(),target:controls.target.clone(),
      min:controls.minDistance,max:controls.maxDistance};
    const ringDetail=kind==='ring';
    const panel=createCytoDetail(kind,ctx,{
      exit:()=>closeDetail(ringDetail?ringReady:bridgeReady),
      proceed:()=>closeDetail(ringDetail?assemble:startSeparation),
    });
    detail=panel;
    world.group.visible=false;
    scene.add(panel.group);
    panel.intro();
  }
  function clearDetail(){
    if(!detail)return;
    disposeShapes(detail.group);detail=null;
    const saved=viewBeforeDetail;
    viewBeforeDetail=null;
    controls.minDistance=saved.min;controls.maxDistance=saved.max;
    world.group.visible=true;
  }
  function closeDetail(resume){
    if(!detail)return;
    const saved=viewBeforeDetail;
    clearDetail();
    ui.label(null);
    fly(saved.position,saved.target,.65);
    resume();
  }
  function split(showRemnant=false){
    setShape(1,1);mode='drift';age=0;cellCount=2;
    ui.hold?.(false);
    if(showRemnant){
      const daughter=cells.find(cell=>cell.side===1);
      daughter.group.attach(midbody);cap.visible=true;remnantSide=daughter.side;
    }
    midbody.visible=showRemnant;
    for(const center of spindle.centrosomes)cells.find(cell=>cell.side===center.sign).group.attach(center.group);
    membrane.visible=false;ring.visible=false;spindle.group.visible=false;
    shells.forEach(shell=>{shell.visible=true;});
    ui.hud('<b>Две дочерние клетки</b><span>Цитоплазма разделилась. Небольшой остаток мостика остался у верхней клетки. В каждом ядре по 8 хромосом, 2n2c.</span>');
  }
  function daughters(){
    mode='daughters';ui.label(null);
    ui.hud('<b>Две дочерние клетки · 2n2c в каждой</b><span>Обе клетки получили полный набор из восьми хромосом. Сравним два способа разделения цитоплазмы.</span>');
    ui.buttons([
      {text:'Как делится растительная клетка?',onClick:compare,primary:!plantSeen},
      ...(plantSeen?[{text:'К итогу',primary:true,onClick:next}]:[]),
    ]);
  }
  function compare(){
    plant=createPlantDivision(scale);scene.add(plant.group);world.group.visible=false;
    startPlant();
  }
  function plantFrame(size,seconds){
    const target=new THREE.Vector3();
    const position=new THREE.Vector3(.27,.37,1).normalize().multiplyScalar(fit(world.radius.cell*size));
    fly(position,target,seconds);
    return position;
  }
  function startPlant(){
    mode='plant';age=0;plate=0;plantPhase=-1;plantPaused=false;
    plant.set(0);
    plantView=plantFrame(.64,.95);
    tellPlant(0);
    plantControls();
  }
  function plantControls(){
    ui.buttons([{text:plantPaused?'Продолжить':'Пауза',onClick:()=>{
      plantPaused=!plantPaused;plantControls();
    }}]);
  }
  function tellPlant(k){
    const step=PLANT_STEPS.findLastIndex(([start])=>k>=start);
    if(step===plantPhase)return;
    plantPhase=step;
    if(step===3&&camera.position.distanceTo(plantView)<.10&&controls.target.lengthSq()<.01)plantFrame(1.16,1.65);
    const [,heading,description]=PLANT_STEPS[step];
    ui.hud(`<b>${heading}</b><span>${description}</span>`);
  }
  function onScreen(x,y){
    ring.localToWorld(screenPoint.set(x,0,y)).project(camera);
    return projected.set((screenPoint.x+1)*innerWidth/2,(1-screenPoint.y)*innerHeight/2);
  }
  return {
    get state(){return mode;},
    get labels(){return detail?.labels ?? plant?.labels ?? (mode==='pinch'?ringLabels:bridgeLabels);},
    get evidence(){return {cellCount,waist,plate,ring:ringProgress,ringRemaining,bridgeClearance,remnantSide,chromosomes:cells.map(c=>c.chromosomes.length)};},
    intro(){
      frame(world.radius.cell*1.52,1.4);
      ringReady();
    },
    drag(phase,x,y){
      if(phase==='cancel'){if(grab&&mode==='pinch')target=grab.at;grab=null;return;}
      if(phase==='up'){grab=null;return;}
      if(mode!=='pinch')return false;
      if(phase==='down'){
        let distance=Infinity;
        for(let i=0;i<40;i++){
          const a=TAU*i/40,sample=onScreen(radius*Math.cos(a),radius*Math.sin(a));
          distance=Math.min(distance,Math.hypot(sample.x-x,sample.y-y));
        }
        if(distance>25)return false;
        const center=onScreen(0,0).clone();
        grab={center,dist:Math.max(26,center.distanceTo(projected.set(x,y))),at:target};
        return true;
      }
      if(grab){
        const inward=(1-Math.hypot(x-grab.center.x,y-grab.center.y)/grab.dist)*1.24;
        target=clamp(grab.at+inward,0,BRIDGE);
      }
    },
    update(dt){
      if(detail){detail.update(dt);return;}
      if(mode==='plant'&&plantPaused)return;
      const previousAge=age;
      age+=dt;
      if(mode==='ring-assembly'){
        const previous=ringProgress;
        ringProgress=clamp(age/4.2,0,1);
        assembly.set(ringProgress);
        if(previous<.47&&ringProgress>=.47){
          holdText('Миозин соединяет нити','Миозин связывает нити актина и помогает им скользить друг относительно друга. Пояс становится сократимым кольцом.');
        }
        if(ringProgress===1)pinch();
      }else if(mode==='pinch'){
        const k=progress+(target-progress)*(1-Math.exp(-dt*2.6));
        if(target<BRIDGE||BRIDGE-k>.002){if(Math.abs(k-progress)>.00002)setShape(k);}
        else{setShape(BRIDGE);bridge();}
        spindle.constrictBridge(smoothstep(progress,.71,BRIDGE));
      }else if(mode==='ring-disassembly'){
        const k=clamp(age/2.4,0,1);
        ringRemaining=1-k;assembly.disassemble(k);
        if(k===1){
          ring.visible=false;mode='cut-microtubules';age=0;
          holdText('В пучке появляется разрыв','Часть микротрубочек перерезается сбоку от срединного тельца. Их концы укорачиваются, освобождая место для разрыва мембраны.');
        }
      }else if(mode==='cut-microtubules'){
        bridgeClearance=smoothstep(age,.22,1.9);
        spindle.constrictBridge(1,bridgeClearance);
        if(age>=2.26){
          mode='abscission';age=0;
          holdText('Мостик разделяется','В освобождённом месте мембрана сужается и разделяется. Теперь у каждой дочерней клетки будет замкнутая мембрана.');
        }
      }else if(mode==='abscission'){
        const k=clamp(age/1.65,0,1);
        spindle.constrictBridge(1,bridgeClearance,smoothstep(k,.22,.93));
        setShape(lerp(BRIDGE,1,smoothstep(k,.47,1)),ease(k));
        if(k===1)split(true);
      }else if(mode==='drift'){
        if(remnantSide&&previousAge<1.3&&age>=1.3)frame(world.radius.cell*1.52,1.45);
        const k=clamp(age/3.7,0,1), travel=ease(k), sway=Math.sin(age*4.4)*.08*(1-k)*Math.min(1,age*3);
        cells.forEach(({group,side})=>{
          group.position.set(side*.46*travel,side*(LOBE_HEIGHT+.72*travel),side*.22*travel);
          group.rotation.set(sway*side,0,side*(travel*.024+sway));
        });
        if(k===1)daughters();
      }else if(mode==='plant'){
        const k=clamp(age/PLANT_DURATION,0,1);plant.set(k);plate=plant.growth;tellPlant(k);
        if(k===1){
          mode='plant-complete';plantSeen=true;
          ui.buttons([
            {text:'Повторить рост пластинки',onClick:startPlant},
            {text:'К дочерним клеткам',primary:true,onClick:()=>{
              disposeShapes(plant.group);plant=null;world.group.visible=true;frame(world.radius.cell*1.52,.8);daughters();
            }},
          ]);
        }
      }
    },
    // Тот же финальный кадр для сравнения в таблице, даже если ученик вошёл в итог напрямую.
    prepareFrame(){split();for(const {group,side} of cells)group.position.set(side*.42,side*(LOBE_HEIGHT+.72),side*.22);},
    leave(){
      ui.hold?.(false);
      clearDetail();
      if(plant)disposeShapes(plant.group);
      for(const center of spindle.centrosomes)spindle.group.add(center.group);
      world.group.visible=true;spindle.group.visible=true;
      spindle.constrictBridge(0);
      membrane.geometry=source;membrane.visible=true;
      shells.forEach(shell=>shell.removeFromParent());daughterGeometry.dispose();shape.dispose();
      disposeShapes(ring);disposeShapes(midbody);handoff.dispose();
    },
  };
}
