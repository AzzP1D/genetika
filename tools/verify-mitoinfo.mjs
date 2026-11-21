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

const {INFO,infoObjects,infoWorldPoint,rotateAnswers}=await import('../app/mitoinfo.js');
const {createKinetochore}=await import('../app/mitokinet.js');
const a=[{id:0},{id:1},{id:2}];assert.deepEqual(rotateAnswers(a,1).map(v=>v.id),[1,2,0]);assert.deepEqual(a.map(v=>v.id),[0,1,2]);
const molecular=await createCohesion();const infoScene=new THREE.Scene();infoScene.add(molecular.group);
const entries=infoObjects(infoScene);for(const id of ['smc1','smc3','rad21','separase','securin','stag','hinge','histones','dna'])assert(entries.some(o=>o.userData.info===id),id);
assert(entries.filter(o=>o.isSprite).length>=6);molecular.group.visible=false;assert.equal(infoObjects(infoScene).length,0);molecular.group.visible=true;
// Выноски должны попадать на нужную сетку даже после расхождения структур.
const labels = id => entries.find(o => o.isSprite && o.userData.info === id);
function onSurface(source, meshes) {
  const anchor = infoWorldPoint(source);
  const vertex = new THREE.Vector3(), instance = new THREE.Matrix4();
  return meshes.some(mesh => {
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.getAttribute('position');
    for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
      if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);if(instance.getMaxScaleOnAxis()===0)continue;}
      else instance.identity();
      const matrix=new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld,instance);
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
        if (anchor.distanceToSquared(vertex) < 1e-12) return true;
      }
    }
    return false;
  });
}
function verifyAnchors() {
  assert(onSurface(labels('cohesin'), entries.filter(o => o.name.startsWith('SMC3 · спиральное плечо'))));
  const histones = entries.filter(o => o.userData.info === 'histones');
  assert(onSurface(labels('chromatin'), histones));
  for (const strand of entries.filter(o => o.userData.info === 'dna')) assert(onSurface(strand, [strand]));
}
verifyAnchors();
const before = infoWorldPoint(labels('chromatin'));
molecular.activate();
molecular.update(3);
molecular.cut();
molecular.update(7);
verifyAnchors();
assert(infoWorldPoint(labels('chromatin')).distanceTo(before) > .3);
for(const olymp of [false,true]){
  const kt=await createKinetochore({olymp});infoScene.add(kt.group);
  function verifyKinetochoreLabels(expected){
    const objects=infoObjects(kt.group);
    const sprites=objects.filter(o=>o.isSprite);
    assert.deepEqual(sprites.map(o=>o.userData.info).sort(),[...expected].sort());
    for(const sp of sprites){
      const id=sp.userData.info==='kinetochore'?'ccan':sp.userData.info;
      assert(onSurface(sp,objects.filter(o=>o.isInstancedMesh&&o.userData.info===id)),id+' — точка карточки на молекуле');
      const line=sp.parent.children[sp.parent.children.indexOf(sp)+1];
      const points=line.geometry.getAttribute('position');
      const endpoint=line.localToWorld(new THREE.Vector3().fromBufferAttribute(points,points.count-1));
      assert(infoWorldPoint(sp).distanceTo(endpoint)<1e-6,id+' — линии карточки и подписи имеют одну точку');
    }
  }
  kt.finish();kt.update(0);
  const attached=['microtubule','ndc80','mis12','ccan','cenpa'];
  verifyKinetochoreLabels(attached);
  kt.group.position.set(1.2,-.7,.28);kt.group.rotation.set(.4,-.8,.2);kt.group.scale.multiplyScalar(1.12);
  verifyKinetochoreLabels(attached);
  kt.showOverview(true);
  verifyKinetochoreLabels(['kinetochore']);
  kt.showOverview(false);
  kt.play();kt.update(1.5);verifyKinetochoreLabels(olymp?['mad12','mcc']:[]);
  kt.update(1.9);verifyKinetochoreLabels(olymp?['mad12','mcc']:[]);
  kt.finish();kt.update(0);verifyKinetochoreLabels(attached);
  assert(!infoObjects(kt.group).some(o=>['mad12','mcc'].includes(o.userData.info)));
  kt.group.removeFromParent();kt.dispose();
}
for(const data of Object.values(INFO))assert.equal(data.length,3);
molecular.dispose();console.log('PASS: molecular tags, clickable labels, hidden objects, surface anchors, answer rotation');
