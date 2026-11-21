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
const {isVisible,INFO}=await import('../app/mitoinfo.js');

const {createTelophase}=await import('../app/mitotelophase.js');
for(const olymp of [false,true]) {
 globalThis.Level={isOlymp:()=>olymp};globalThis.window={Level};
 const world=createWorld();world.pose('telophase');
 const controls={enabled:true,target:new THREE.Vector3(),minDistance:.8,maxDistance:20};
 const camera=new THREE.PerspectiveCamera(),scene=new THREE.Scene();
 camera.position.set(2,3,9);scene.add(world.group);
 const state={buttons:[],hud:'',label:''};let next=0;
 const ui={buttons:b=>state.buttons=b,hud:s=>state.hud=s,label:s=>state.label=s,hold:on=>state.canHold=on};
 const stage=createTelophase({world,ui,controls,camera,scene,fit:r=>r*3,fly(){},fade:fn=>fn(),next:()=>next++});stage.intro();
 const click=text=>{const b=state.buttons.find(b=>b.text===text);assert(b,text);return b.onClick();};
 let time=0;
 const tick=s=>{for(let i=0;i<s*30;i++){time+=1/30;world.update(1/30,time);stage.update(1/30);}};
 const spanY=mesh=>{
   const positions=mesh.geometry.getAttribute('position');
   let near=Infinity,far=0;
   for(let i=0;i<positions.count;i++){
     const y=Math.abs(positions.getY(i));
     near=Math.min(near,y);far=Math.max(far,y);
   }
   return {near,far};
 };
 tick(.1);
 const spindle=world.spindle;
 const centralFibers=spindle.group.children.filter(o=>{
   if(!o.isMesh||!o.visible)return false;
   const {near,far}=spanY(o);
   return near<.5&&far>4;
 });
 assert(centralFibers.length>0,'До сборки оболочек видны нити веретена от полюсов');
 assert.deepEqual(stage.evidence.perNucleus,[8,8]);
 click('Вокруг каждой хромосомы отдельно');assert.equal(stage.state,'choose');
 click('Вокруг каждого из двух наборов');tick(.3);
 const visibleLabels=()=>stage.labels.filter(item=>item.ready()).map(item=>item.text);
 assert.deepEqual(visibleLabels(),['Мембраны ЭПС'],'В начале подписаны только подошедшие мембраны ЭПС');
 const poreLayers=world.group.children.filter(o=>o.isGroup&&o!==world.nucleus)
   .map(o=>o.children.find(part=>part.isInstancedMesh&&part.count===84)).filter(Boolean);
 assert.equal(poreLayers.length,2,'У каждой новой оболочки свой слой пор');
 const poreMatrix=new THREE.Matrix4(),poreScale=new THREE.Vector3();
 const visiblePores=()=>poreLayers.map(layer=>{
   if(!layer.visible||!layer.parent.visible)return 0;
   let visible=0;
   for(let i=0;i<layer.count;i++){
     layer.getMatrixAt(i,poreMatrix);
     if(poreScale.setFromMatrixScale(poreMatrix).x>.01)visible++;
   }
   return visible;
 });
 assert.deepEqual(visiblePores(),[0,0],'Свободные поры не появляются до подхода мембран');
 tick(2);
 assert.deepEqual(visibleLabels(),['Мембраны ЭПС','Двойная мембрана','Ядерная пора']);
 assert(visiblePores().every(n=>n>0&&n<84),'Поры начинают появляться на участках оболочки по мере её роста');
 assert(spindle.group.visible&&centralFibers.every(o=>o.visible&&o.parent===spindle.group),
   'Во время сборки оболочек исходные нити продолжают отрисовываться');
 assert(centralFibers.some(o=>spanY(o).far>1.5&&spanY(o).far<4),
   'В середине анимации нити укоротились, но ещё не собрались в компактный пучок');
 tick(2.9);assert.equal(stage.state,'packed');
 assert(centralFibers.every(o=>o.visible&&o.parent===spindle.group&&spanY(o).far<1.5),
   'К концу анимации те же нити занимают область между ядрами');
 assert.deepEqual(stage.evidence.envelopes,[1,1]);
 assert.deepEqual(visiblePores(),[84,84],'Готовые оболочки несут полный набор пор в модели');
 if(olymp){
   const overview=camera.position.clone();
   await click('Как закрывается разрыв?');
   assert(!world.group.visible,'В крупном плане виден только участок оболочки');
   const detail=scene.children.find(o=>o!==world.group);
   const chromatin=detail.getObjectByProperty('name','Хроматин у ядерной оболочки');
   assert(chromatin,'Участки ДНК с BAF показаны в составе хроматина');
   const strands=chromatin.children.filter(o=>o.userData.info==='telophaseDna');
   const histones=chromatin.children.filter(o=>o.userData.info==='histones');
   assert.equal(histones.length,2,'Видны две нуклеосомы, связанные с участками ДНК');
   assert.equal(strands.length,4,'У каждого участка хроматина две непрерывные цепи ДНК');
   detail.updateMatrixWorld(true);
   for(const strand of strands){
     const path=strand.geometry.parameters.path;
     assert(path.getLength()>25,'В сцене виден контекст за пределами участка контакта');
     for(const point of path.getSpacedPoints(120)){
       const p=detail.worldToLocal(strand.localToWorld(point));
       assert(p.y < -2.1,'Хроматин остаётся с ядерной стороны мембраны');
       assert(Math.hypot(p.x,p.z)>13,'Спираль ДНК проходит снаружи микротрубочки');
     }
   }
   assert.deepEqual(visibleLabels(),['Временный разрыв','Микротрубочка','Хроматин']);
   click('Собрать белки у разрыва');tick(2.6);
   click('Подвести спастин');tick(3.5);
   assert(visibleLabels().includes('Спастин'));
   click('Замкнуть мембраны');tick(2.8);
   assert.deepEqual(visibleLabels(),[],'Метки исчезают, когда разрыв закрыт и микротрубочка убрана');
   click('Вернуться к ядрам');
   assert(world.group.visible&&camera.position.equals(overview),'Возврат восстанавливает общий вид');
   assert.deepEqual(scene.children,[world.group],'Крупный план освобождает сцену после выхода');
 }else assert(!state.buttons.some(b=>b.text==='Как закрывается разрыв?'));
 click('Распаковать хроматин');tick(6.2);assert.equal(stage.state,'quiz');
 for(const ch of world.chromosomes)for(const d of ch.chromatids){assert.equal(d.material.uniforms.uCond.value,0);assert(d.material.uniforms.uHome.value.toArray().every(Number.isFinite));}
 click('Хромосомы исчезли при распаковке');assert.equal(stage.state,'quiz');
 click('Образовались два ядра; цитоплазму ещё нужно разделить');
 click('Разрыв постепенно превращается в ядерную пору');assert.equal(next,0);
 assert(!state.buttons.some(b=>b.text==='К цитокинезу'));
 click('Разрыв закрывается, а поры обеспечивают обмен между ядром и цитоплазмой');
 click('К цитокинезу');assert.equal(next,1);
 assert.equal(typeof SCENES.cytokinesis,'function','Кнопка ведёт к интерактивному цитокинезу');
 const handoff=stage.leave({carryTelophase:true});
 assert(handoff&&handoff.cells.every(cell=>cell.nucleus.parent===cell.group),'Два ядра передаются в следующую сцену');
 const membraneSource=world.membrane.geometry.getAttribute('position');
 const cutRow=Array.from({length:membraneSource.count},(_,i)=>i).filter(i=>{
   const y=membraneSource.getY(i);
   return Math.abs(y/Math.hypot(membraneSource.getX(i),y,membraneSource.getZ(i))+.065)<.003;
 });
 const membraneAtCut=()=>{
   const shape=world.membrane.geometry.getAttribute('position');
   return Math.max(...cutRow.map(i=>Math.hypot(shape.getX(i),shape.getZ(i))));
 };
 const division=SCENES.cytokinesis({world,ui,controls,camera,scene,handoff,fit:r=>r*3,fly(){},next:()=>next++});
 division.intro();
 const tickDivision=s=>{for(let i=0;i<s*30;i++){time+=1/30;if(world.group.visible)world.update(1/30,time);division.update(1/30);}};
 const inspectVisible=id=>{
   let result;
   scene.traverse(object=>{if(object.userData.info===id&&isVisible(object))result=object;});
   return result;
 };
 const ringDetailButton='Как клетка выбирает место деления?';
 assert.equal(state.buttons.some(b=>b.text===ringDetailButton),olymp,'Углубление открывается на олимпиадном уровне');
 if(olymp){
   click(ringDetailButton);tickDivision(2.4);
   assert.equal(world.group.visible,false);
   assert(inspectVisible('centralspindlin'));
   assert(division.labels.every(label=>INFO[label.object.userData.info]));
   click('Привлечь ECT2');tickDivision(2.4);
   assert(inspectVisible('cytoPhosphate'));
   click('Запустить обмен GDP на GTP');
   assert(inspectVisible('cytoGdp'));
   tickDivision(2.4);assert(inspectVisible('cytoGtp'));assert(!inspectVisible('cytoGdp'));
   click('Собрать актомиозиновый пояс');tickDivision(2.4);
   assert(inspectVisible('cytoActin')&&inspectVisible('cytoMyosin'));
   click('Проверить прогноз');
   click('RhoA включится раньше и кольцо стянется быстрее');
   assert.match(state.label,/ослабнет/);
   click('Активного RhoA будет мало, борозда не начнётся');tickDivision(2.4);
   assert(inspectVisible('cytoGdp'));assert(!inspectVisible('cytoActin'));
   click('Показать норму');tickDivision(2.0);
   assert(inspectVisible('cytoGtp')&&!inspectVisible('cytoActin'),'В норме RhoA активируется до сборки пояса');
   tickDivision(2.8);
   assert(inspectVisible('cytoGtp')&&inspectVisible('cytoActin'));
   click('Собрать кольцо в клетке');
   assert.equal(world.group.visible,true);
   assert.equal(state.label,null,'Ответ из крупного плана убран при возврате к клетке');
   assert(!inspectVisible('cytoRho'));
 }else click('Собрать кольцо');
 assert.equal(division.evidence.cellCount,1);
 tickDivision(1.6);
 assert.equal(state.canHold,true,'Плашку со сборкой можно удерживать');
 assert(division.evidence.ring>0&&division.evidence.ring<1,'Видна промежуточная сборка отдельных нитей');
 assert(!state.buttons.some(b=>b.text==='Стянуть кольцо'));
 tickDivision(3);assert.equal(division.evidence.ring,1);
 assert.equal(state.canHold,false);
 click('Стянуть кольцо');tickDivision(4);
 assert.equal(division.evidence.cellCount,1,'При наличии мостика клетка ещё одна');
 assert(division.evidence.waist<1);
 const bridgeTubes=spindle.group.children.filter(o=>o.isMesh&&o.visible&&
   o.geometry.getAttribute('normal')?.usage===THREE.DynamicDrawUsage);
 const tubesAtCut=()=>bridgeTubes.some(tube=>{
   const position=tube.geometry.getAttribute('position');
   return Array.from({length:position.count},(_,i)=>position.getY(i)).some(y=>y>-.72&&y<-.51);
 });
 assert(tubesAtCut(),'Пучок проходит через будущее место разрыва');
 const initialCutRadius=membraneAtCut();
 const bridgeDetailButton='Как разделяется мостик?';
 assert.equal(state.buttons.some(b=>b.text===bridgeDetailButton),olymp);
 if(olymp){
   click(bridgeDetailButton);tickDivision(2.4);
   assert(inspectVisible('cytoCep55'));
   click('Привлечь адаптеры');tickDivision(2.4);
   assert(inspectVisible('cytoAlix')&&inspectVisible('cytoTsg'));
   click('Собрать нити ESCRT-III');tickDivision(2.4);
   assert(inspectVisible('cytoEscrt'));
   const connected=()=>inspectVisible('cytoBridgeMembrane').children[0].visible;
   assert(connected());
   click('Дать спастину разобрать пучок');tickDivision(2.4);
   assert(inspectVisible('cytoSpastin'));assert(connected());
   click('Разделить мембрану');tickDivision(2.4);
   assert(!connected());
   click('Проверить прогноз');
   click('Пучок сохранится, а разделение мостика задержится');tickDivision(2.4);
   assert(connected());assert(inspectVisible('cytoEscrt'));assert(!inspectVisible('cytoSpastin'));
   click('Показать норму');tickDivision(2.0);
   assert(connected(),'В норме сначала расчищается пучок, мембрана ещё цела');
   tickDivision(2.8);
   assert(!connected());
 }
 click('Разделить клетки');tickDivision(1.2);
 assert(division.evidence.ringRemaining>0&&division.evidence.ringRemaining<1);
 assert.equal(division.evidence.bridgeClearance,0,'Сначала разбирается кольцо');
 tickDivision(3.6);
 assert.equal(division.evidence.ringRemaining,0);
 assert.equal(division.evidence.bridgeClearance,1,'Микротрубочки убраны в месте будущего разрыва мембраны');
 assert.equal(division.evidence.cellCount,1);
 assert(!tubesAtCut(),'В геометрии пучка виден просвет');
 tickDivision(.55);
 assert(membraneAtCut()<initialCutRadius*.75,'После расчистки пучка мембрана сужается в месте разрыва');
 assert.equal(division.evidence.cellCount,1);
 tickDivision(6);
 assert.equal(division.evidence.cellCount,2);assert.deepEqual(division.evidence.chromosomes,[8,8]);
 assert.equal(division.evidence.remnantSide,1,'Остаток мостика сохраняется у одной дочерней клетки');
 assert(handoff.cells.every(cell=>cell.nucleus.parent===cell.group),'Дочерние клетки сохраняют исходные ядра');
 assert(world.spindle.centrosomes.every(center=>handoff.cells.find(cell=>cell.side===center.sign).group===center.group.parent),'Центросомы сохраняются в соответствующих клетках');
 click('Как делится растительная клетка?');tickDivision(1);
 assert.equal(division.evidence.plate,0,'Сначала видны подходящие пузырьки');
 let phragmoplast;
 scene.traverse(object=>{if(object.userData.info==='phragmoplast')phragmoplast=object;});
 assert(phragmoplast?.visible);
 const guidePositions=()=>{
   const geometry=phragmoplast.geometry, coordinates=geometry.getAttribute('position');
   const vertices=new Set(geometry.index.array.subarray(0,geometry.drawRange.count));
   return [...vertices].map(i=>[coordinates.getX(i),coordinates.getY(i),coordinates.getZ(i)]);
 };
 const initialGuides=guidePositions();
 assert(initialGuides.some(([,y])=>y>.2)&&initialGuides.some(([,y])=>y<-.2),'Микротрубочки видны по обе стороны пластинки');
 click('Пауза');tickDivision(3);
 assert.equal(division.evidence.plate,0,'Пауза позволяет дочитать объяснение или осмотреть модель');
 click('Продолжить');
 tickDivision(3.5);
 assert(division.evidence.plate>0&&division.evidence.plate<1,'Пластинка проходит через стадию роста');
 assert.match(state.hud,/сеть|соединяются/i);
 tickDivision(4.4);
 const outerGuides=guidePositions();
 assert(outerGuides.some(([x])=>Math.abs(x)>3),'Новые пучки собрались ближе к краю');
 assert(!outerGuides.some(([x,,z])=>Math.hypot(x,z)<.62),'После роста в центре микротрубочки разобрались');
 tickDivision(5);
 assert.equal(division.evidence.plate,1,'Клеточная пластинка дорастает до стенок');
 assert.equal(phragmoplast.visible,false,'В конце фрагмопласт разобран');
 click('Повторить рост пластинки');assert.equal(division.evidence.plate,0);
 tickDivision(14);assert.equal(division.evidence.plate,1);
 click('К дочерним клеткам');click('К итогу');assert.equal(next,2);
 division.leave();world.pose('interphase');for(const ch of world.chromosomes)for(const d of ch.chromatids)assert.equal(d.object.parent,ch.group);
 assert.equal(typeof SCENES.summary,'function','Итог доступен после цитокинеза');
 console.log(JSON.stringify({olymp,telophase:'PASS',nuclei:[8,8],decondensation:'PASS',reset:'PASS'}));
}
