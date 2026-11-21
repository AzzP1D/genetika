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
  const vertex = new THREE.Vector3();
  return meshes.some(mesh => {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      mesh.localToWorld(vertex.fromBufferAttribute(positions, i));
      if (anchor.distanceToSquared(vertex) < 1e-12) return true;
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
const kt=await createKinetochore();kt.finish();infoScene.add(kt.group);
const ids=new Set(infoObjects(infoScene).map(o=>o.userData.info));for(const id of ['ndc80','mis12','ccan','cenpa','microtubule'])assert(ids.has(id),id);
for(const data of Object.values(INFO))assert.equal(data.length,3);
molecular.dispose();kt.dispose();console.log('PASS: molecular tags, clickable labels, hidden objects, surface anchors, answer rotation');
