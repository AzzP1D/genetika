import * as THREE from 'three';
import { loadModel } from './organelles.js';
import { neon, textSprite } from './style.js';
import { ease } from './motion.js';

// Реальные глобулярные домены из Blender; длинные плечи, RAD21 и расположение
// двух ДНК — учебная реконструкция. ДНК не изменяет топологию при расщеплении белка.
export async function createCohesion() {
  const [model, meta] = await Promise.all([
    loadModel('cohesion_pdb'),
    fetch(new URL('./models/cohesion_pdb.json', import.meta.url)).then(r => {
      if (!r.ok) throw new Error('Не загрузились данные сепаразы');
      return r.json();
    }),
  ]);
  const group = new THREE.Group();
  group.name = 'Когезия сестринских хроматид';
  group.scale.setScalar(.08); // нм → сцена
  model.updateMatrixWorld(true);
  const geo = {};
  model.traverse(o => {
    if (!o.isMesh) return;
    const a = o.geometry.attributes.position, p = new Float32Array(a.count * 3);
    for (let i=0;i<a.count;i++) p.set([a.getX(i),a.getY(i),a.getZ(i)],i*3);
    const g = new THREE.BufferGeometry();g.setIndex(o.geometry.index);
    g.setAttribute('position',new THREE.BufferAttribute(p,3));g.applyMatrix4(o.matrixWorld);g.computeVertexNormals();
    geo[o.material.name]=g;
  });
  const colors = {smc1:0x6e8cff,smc3:0x927aff,rad21:0xff5e7a,separase:0x32ffc0,securin:0xf4dd4c,dna:0x00e5ff};
  const material = color => neon(color,{glow:1.1,power:2.4,body:.5});
  const parts = new THREE.Group();group.add(parts);
  function tube(points, radius, color, name, segments=80) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,8,false),material(color));
    mesh.name=name;parts.add(mesh);return mesh;
  }
  const left = new THREE.Group(), right = new THREE.Group();parts.add(left,right);
  const armL=tube([[-5,-18,0],[-17,-8,0],[-18,9,0],[-9,20,0],[0,23,0]],.8,colors.smc1,'SMC1 (плечо реконструировано)');
  const armR=tube([[5,-18,0],[17,-8,0],[18,9,0],[9,20,0],[0,23,0]],.8,colors.smc3,'SMC3 (плечо реконструировано)');
  left.add(armL);right.add(armR);
  const head1=new THREE.Mesh(geo.coh_smc1,material(colors.smc1));head1.position.set(-5,-18,0);left.add(head1);
  const head2=new THREE.Mesh(geo.coh_smc3,material(colors.smc3));head2.position.set(5,-18,0);right.add(head2);
  // Отдельные половины белковой цепи; в нерасщеплённом состоянии встречаются без щели.
  const gateL=tube([[-5,-19,0],[-6,-23,0],[-3,-25,0],[0,-25,0]],.65,colors.rad21,'RAD21 — левая часть',36);
  const gateR=tube([[0,-25,0],[3,-25,0],[6,-23,0],[5,-19,0]],.65,colors.rad21,'RAD21 — правая часть',36);
  left.add(gateL);right.add(gateR);
  const cutSite=new THREE.Vector3(0,-25,0);
  const marker=new THREE.Mesh(new THREE.TorusGeometry(1.65,.13,6,32),material(colors.rad21));
  marker.position.copy(cutSite);parts.add(marker);

  const enzyme=new THREE.Group();parts.add(enzyme);
  const sep=new THREE.Mesh(geo.coh_separase,material(colors.separase));
  const sec=new THREE.Mesh(geo.coh_securin,material(colors.securin));
  enzyme.add(sep,sec);
  const from=new THREE.Vector3(-30,-7,6);
  enzyme.position.copy(from);
  // Совмещаем каталитический участок с условным местом расщепления; не моделируем химию реакции.
  const at=cutSite.clone().sub(new THREE.Vector3(...meta.activeSite));

  // Две целые двойные спирали, проходящие сквозь удерживающую связь.
  const dnaGroups=[];
  const dnaMat=material(colors.dna);
  for (const side of [-1,1]) {
    const dna=new THREE.Group();dna.name='Целая ДНК сестры '+(side<0?1:2);parts.add(dna);
    for (let strand=0;strand<2;strand++) {
      const pts=[];
      for(let i=0;i<=220;i++) {
        const z=-32+64*i/220,a=z*2*Math.PI/3.4+strand*Math.PI;
        pts.push(new THREE.Vector3(Math.cos(a),Math.sin(a),z));
      }
      dna.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),440,.18,5,false),dnaMat));
    }
    const rungs=new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,.12,2,5),dnaMat,180);
    const m=new THREE.Matrix4(),q=new THREE.Quaternion();
    for(let i=0;i<180;i++) {
      const z=-30.4+i*.34,a=z*2*Math.PI/3.4;
      m.compose(new THREE.Vector3(0,0,z),q.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(a),Math.sin(a),0)),new THREE.Vector3(1,1,1));
      rungs.setMatrixAt(i,m);
    }
    dna.add(rungs);dna.position.x=side*6;dnaGroups.push(dna);
  }

  const labels=new THREE.Group();parts.add(labels);
  function label(text,color,position,target) {
    const sprite=textSprite(text,color,2.2);sprite.position.set(...position);labels.add(sprite);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([sprite.position,new THREE.Vector3(...target)]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.55}));labels.add(line);
    return line;
  }
  label('Когезин · удерживает сестёр','#9facff',[20,23,5],[10,17,0]);
  label('RAD21 · белковая мишень','#ff8094',[20,-26,5],[0,-25,0]);
  const enzymeLine=label('Сепараза · фермент','#64ffcf',[-32,8,8],[-30,-5,6]);
  label('Две молекулы ДНК','#60eaff',[21,5,17],[6,0,12]);
  const secLabel=textSprite('Секурин · блокирует сепаразу','#f4dd4c',1.8);secLabel.position.set(-29,-20,9);labels.add(secLabel);
  let mode='held',time=0,age=0,tugAge=99, disposed=false;
  function draw() {
    const opening=mode==='cutting'?ease(THREE.MathUtils.smoothstep(age,2.6,5.8)):mode==='cut'?1:0;
    const approach=mode==='cutting'?ease(Math.min(1,age/2.6)):mode==='cut'?1:0;
    enzyme.position.lerpVectors(from,at,approach);
    enzymeLine.geometry.attributes.position.setXYZ(1,enzyme.position.x,enzyme.position.y+1,enzyme.position.z);
    enzymeLine.geometry.attributes.position.needsUpdate=true;
    const unblock=mode==='unblocking'?ease(Math.min(1,age/2.2)):mode==='held'?0:1;
    sec.visible=unblock<.99;
    sec.scale.setScalar(Math.max(.001,1-unblock));
    sec.position.set(-unblock*4,unblock*5,unblock*2);
    secLabel.visible=mode==='held'||mode==='unblocking';
    left.rotation.z=-opening*.21;right.rotation.z=opening*.21;
    left.position.x=-opening*3;right.position.x=opening*3;
    marker.visible=opening<.1;
    marker.scale.setScalar(1+.09*Math.sin(time*4));
    const tug=tugAge<1.5?Math.sin(Math.PI*tugAge/1.5)**2*.45:0;
    dnaGroups.forEach((dna,i)=>dna.position.x=(i===0?-1:1)*(6+opening*7+tug));
  }
  draw();
  return {
    group,view:{center:new THREE.Vector3(-.25,-.1,0),radius:4.2},
    get state(){return mode;}, get ready(){return mode==='free';}, get cutDone(){return mode==='cut';},
    evidence:{source:meta,dnaGroups,gateL,gateR},
    tug(){if(mode!=='held'&&mode!=='free')return false;tugAge=0;return true;},
    activate(){if(mode!=='held')return false;mode='unblocking';age=0;return true;},
    cut(){if(mode!=='free')return false;mode='cutting';age=0;return true;},
    update(dt){time+=dt;age+=dt;tugAge+=dt;if(mode==='unblocking'&&age>=2.2){mode='free';age=0;}if(mode==='cutting'&&age>=6.3){mode='cut';age=0;}draw();},
    dispose(){if(disposed)return;disposed=true;const geos=new Set(),mats=new Set();group.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});for(const g of geos)g.dispose();for(const m of mats){m.map?.dispose();m.dispose();}},
  };
}
