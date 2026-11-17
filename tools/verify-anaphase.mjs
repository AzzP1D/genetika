// Проверки причинной последовательности и реальной геометрии без браузера/GPU.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.ProgressEvent=class {constructor(type,v){Object.assign(this,{type},v);}};
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>({
  measureText:s=>({width:s.length*14}),fillRect(){},clearRect(){},fillText(){},strokeRect(){},
  beginPath(){},moveTo(){},lineTo(){},stroke(){},roundRect(){},fill(){},arc(){},setLineDash(){},
  createRadialGradient:()=>({addColorStop(){}}),
})})};
globalThis.innerWidth=1104;globalThis.innerHeight=1243;
const nativeFetch=globalThis.fetch;
THREE.DefaultLoadingManager.setURLModifier(s=>s.startsWith('models/')?pathToFileURL(path.join(root,'app',s.split('?')[0])).href:s);
globalThis.fetch=async input=>{const url=typeof input==='string'?input:input.url??input.href;if(url.startsWith('file:'))return new Response(await fs.readFile(fileURLToPath(url)));return nativeFetch(input);};
const {createWorld}=await import('../app/mitocell.js');
const {createAnaphase}=await import('../app/mitoanaphase.js');
const {createCohesion}=await import('../app/mitocohesin.js');
const {SCENES}=await import('../app/mitosis-stages.js');
const {BEND}=await import('../app/mitochrom.js');

// Сначала самостоятельная молекулярная модель: фермент не режет до активации;
// при расщеплении не теряются вершины, основания и нити ни одной молекулы ДНК.
const molecular=await createCohesion();
const dnaSignature=()=>molecular.evidence.dnaGroups.map(g=>g.children.map(o=>o.geometry.attributes.position.count));
const before=dnaSignature();
assert.equal(molecular.cut(),false);molecular.tug();molecular.update(1);assert.equal(molecular.state,'held');
molecular.activate();molecular.update(2.3);assert(molecular.ready);assert(molecular.cut());
for(let i=0;i<210;i++)molecular.update(1/30);
assert(molecular.cutDone);assert.deepEqual(dnaSignature(),before);
assert(molecular.evidence.dnaGroups[0].position.x<-12&&molecular.evidence.dnaGroups[1].position.x>12);
molecular.dispose();

for(const olymp of [false,true]) {
  globalThis.Level={isOlymp:()=>olymp};globalThis.window={Level};
  const world=createWorld();world.pose('anaphase');
  const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,60);
  const controls={target:new THREE.Vector3(),enabled:true};
  const scene=new THREE.Scene();scene.add(world.group);
  const uiState={hud:'',label:'',buttons:[]};
  const ui={hud:s=>uiState.hud=s,label:s=>uiState.label=s,buttons:b=>uiState.buttons=b};
  let next=0,time=0;
  const fit=r=>r*1.1/(Math.tan(Math.PI/9)*Math.min(1,camera.aspect));
  const ctx={ui,world,camera,controls,scene,fit,next:()=>next++,lock(){},fade:fn=>fn(),fly(p,target){camera.position.copy(p);controls.target.copy(target);camera.lookAt(target);camera.updateMatrixWorld();}};
  const stage=createAnaphase(ctx);stage.intro();
  const tick=seconds=>{for(let i=0;i<Math.ceil(seconds*30);i++){time+=1/30;world.group.updateMatrixWorld(true);if(world.group.visible)world.update(1/30,time);stage.update(1/30,time);}};
  const click=text=>{const b=uiState.buttons.find(b=>b.text===text);assert(b,'Missing button: '+text+'; state '+stage.state);b.onClick();};
  // Потеря одной настоящей нити блокирует старт и не меняет счёт.
  world.spindle.detach('ana:0:0');click('Начать анафазу');assert.equal(stage.state,'ready');assert.equal(stage.evidence.chromosomes,8);
  world.spindle.attach('ana:0:0',0,out=>world.kinetochore(world.chromosomes[0],0,out),1);
  click('Начать анафазу');tick(3);
  for(let i=0;i<80&&stage.state==='loading';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(stage.state,'held');click('Попробовать развести сестёр');tick(2);assert.equal(stage.evidence.released,false);
  click('Активировать сепаразу');tick(2.5);assert.equal(stage.state,'target');
  click('ДНК в центромере');assert.equal(stage.state,'target');assert.equal(stage.evidence.chromosomes,8);
  click('Белок когезина (RAD21)');tick(6.8);assert.equal(stage.state,'cause');assert.equal(stage.evidence.released,false);
  click('Сепараза разрезала ДНК в центромере');assert.equal(stage.state,'cause');
  click('Сепараза расщепила белок когезина и сняла удерживающую связь');click('Далее');
  click('Посмотреть расхождение в клетке');assert.equal(stage.state,'travel');tick(13);
  assert.equal(stage.state,'finished');assert.equal(stage.evidence.chromosomes,16);
  let upper=0,lower=0;
  world.group.updateMatrixWorld(true);
  for(const ch of world.chromosomes)for(const sister of ch.chromatids){
    const p=sister.kinetochore.getWorldPosition(new THREE.Vector3());
    assert(p.toArray().every(Number.isFinite));if(p.y>0)upper++;else lower++;
    assert.equal(sister.material.uniforms.uBend.value,BEND.ana);
  }
  assert.equal(upper,8);assert.equal(lower,8);assert(world.elongation>.99);
  click('Повторить расхождение');tick(13);assert.equal(stage.state,'finished');
  click('Проверить понимание');
  click('Как самостоятельную дочернюю хромосому');click('Далее');
  click('16 во всей клетке; по 8 у каждого полюса');click('Далее');
  click('Нет. Количество ДНК осталось прежним — разделились уже имеющиеся копии');click('Далее');
  if(olymp){click('Во всей клетке 4n4c; у одного полюса 2n2c');click('Далее');}
  click('К телофазе');assert.equal(next,1);stage.leave();
  world.pose('metaphase');
  for(const ch of world.chromosomes)for(const s of ch.chromatids){assert(Math.abs(s.object.position.x)<1e-12);assert.equal(s.material.uniforms.uBend.value,BEND.meta);}
  // Обычный переход из готовой метафазы сохраняет позы, а не пересоздаёт ядро.
  const metaphase=SCENES.metaphase(ctx);metaphase.intro();
  const metaTick=s=>{for(let i=0;i<s*30;i++){world.update(1/30,time);metaphase.update(1/30,time);time+=1/30;}};
  metaTick(13);click('Выстроить за меня');metaTick(9);assert(world.metaphaseReady);
  const poses=world.chromosomes.map(ch=>ch.group.position.clone());metaphase.leave();
  const follow=createAnaphase(ctx);
  world.chromosomes.forEach((ch,i)=>assert(ch.group.position.distanceTo(poses[i])<1e-9));
  assert(follow.evidence.checkpoint);follow.leave();
  console.log(JSON.stringify({olymp,checkpoint:'PASS',cause:'PASS',dna:'intact',daughters:[upper,lower],replay:'PASS',quiz:'PASS',reset:'PASS',metaphaseTransition:'PASS'}));
}
