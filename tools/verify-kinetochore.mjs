// Headless geometry checks; no browser or GPU. Canvas only measures labels in this check.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.ProgressEvent = class { constructor(type, values) { Object.assign(this, {type}, values); } };
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ({
  measureText: text => ({ width: text.length * 14 }), fillRect() {}, clearRect() {}, fillText() {},
  strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, roundRect() {}, fill() {},
}) }) };
const nativeFetch = globalThis.fetch;
THREE.DefaultLoadingManager.setURLModifier(url => url.startsWith('models/') ? pathToFileURL(path.join(root,'app',url.split('?')[0])).href : url);
globalThis.fetch = async input => {
  const url = typeof input === 'string' ? input : input.url ?? input.href;
  if (url.startsWith('models/')) return new Response(await fs.readFile(path.join(root,'app',url.split('?')[0])));
  if (url.startsWith('file:')) return new Response(await fs.readFile(fileURLToPath(url)));
  return nativeFetch(input);
};
const { createKinetochore } = await import('../app/mitokinet.js');
for (const olymp of [false, true]) {
  const kt = await createKinetochore({olymp});
  kt.play();
  let animationBad=0;
  for (let i=0;i<=280;i++) {
    kt.update(1/30);
    if(i%30===0) kt.group.traverse(o=>{if(o.isInstancedMesh)for(const v of o.instanceMatrix.array)if(!Number.isFinite(v))animationBad++;});
  }
  if(animationBad)throw new Error('Non-finite animation transform');
  if (!kt.done) throw new Error('Attachment animation did not finish');
  kt.group.updateMatrixWorld(true);
  let triangles=0, bad=0;
  kt.group.traverse(o=>{
    if (o.geometry) {
      const a=o.geometry.attributes.position;
      for(let i=0;i<a.count;i++) if(!Number.isFinite(a.getX(i)+a.getY(i)+a.getZ(i))) bad++;
      if(o.isInstancedMesh) for (const v of o.instanceMatrix.array) if(!Number.isFinite(v)) bad++;
      triangles+=(o.geometry.index?.count??a.count)/3*(o.isInstancedMesh?o.count:1);
    }
  });
  if(bad) throw new Error(`${bad} non-finite coordinates`);
  if(kt.evidence.junction.source!=='8PPR') throw new Error('Missing experimental junction');
  if(kt.evidence.junction.mis12RmsdNm>.4) throw new Error('Poor MIS12 structural alignment');
  const chrom=kt.group.getObjectByName('Двухроматидная хромосома');
  const camera=new THREE.PerspectiveCamera();
  camera.position.set(0,0,8);camera.updateMatrixWorld();chrom.update(camera);
  if(!chrom.levels[0].object.visible||chrom.levels[1].object.visible)throw new Error('Close-up LOD failed');
  let closeTriangles=0;
  kt.group.traverseVisible(o=>{if(o.geometry){const a=o.geometry.attributes.position;closeTriangles+=(o.geometry.index?.count??a.count)/3*(o.isInstancedMesh?o.count:1);}});
  camera.position.z=80;camera.updateMatrixWorld();chrom.update(camera);
  if(chrom.levels[0].object.visible||!chrom.levels[1].object.visible)throw new Error('Overview LOD failed');
  // Эти три инстанса должны быть перенесены одной матрицей без раздвигания цепей 8PPR.
  const parts=[];kt.group.traverse(o=>{if(o.isInstancedMesh&&o.count===10)parts.push(o);});
  const foot=parts[1],mis=parts[2],knl=parts[3];
  if(!foot||!mis||!knl)throw new Error('Missing junction parts');
  for(let i=0;i<foot.instanceMatrix.array.length;i++)if(foot.instanceMatrix.array[i]!==mis.instanceMatrix.array[i]||foot.instanceMatrix.array[i]!==knl.instanceMatrix.array[i])throw new Error('Experimental junction transforms diverged');
  console.log(JSON.stringify({olymp,closeTriangles:Math.round(closeTriangles),links:kt.evidence.links.length,rmsd:kt.evidence.junction.mis12RmsdNm,animation:'PASS',junction:'PASS',lod:'PASS'}));
  kt.dispose();
}
