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
  // Две переплетённые альфа-спирали в каждом плече; общий путь реконструирован.
  function coiledArm(points,color,parent,name) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const frames=curve.computeFrenetFrames(220,false);
    for(let strand=0;strand<2;strand++) {
      const pts=[];
      for(let i=0;i<=220;i++) {
        const u=i/220,a=u*Math.PI*22+strand*Math.PI;
        const r=.48*Math.sin(Math.PI*u);
        pts.push(curve.getPointAt(u).addScaledVector(frames.normals[i],r*Math.cos(a)).addScaledVector(frames.binormals[i],r*Math.sin(a)).toArray());
      }
      parent.add(tube(pts,.32,color,name,300));
    }
  }
  coiledArm([[-5,-18,0],[-14,-6,0],[-12,11,0],[-3,21,0],[0,23,0]],colors.smc1,left,'SMC1 · спиральное плечо (реконструкция)');
  coiledArm([[5,-18,0],[14,-6,0],[12,11,0],[3,21,0],[0,23,0]],colors.smc3,right,'SMC3 · спиральное плечо (реконструкция)');
  const hinge=new THREE.Group();hinge.name='Шарнир SMC1–SMC3 (реконструкция)';parts.add(hinge);
  for(const side of [-1,1]) {
    const lobe=new THREE.Mesh(new THREE.SphereGeometry(1.65,16,12),material(side<0?colors.smc1:colors.smc3));
    lobe.position.set(side*.9,23,0);lobe.scale.set(1,1.2,.8);hinge.add(lobe);
  }
  const head1=new THREE.Mesh(geo.coh_smc1,material(colors.smc1));head1.position.set(-5,-18,0);left.add(head1);
  const head2=new THREE.Mesh(geo.coh_smc3,material(colors.smc3));head2.position.set(5,-18,0);right.add(head2);
  const stag=new THREE.Mesh(geo.coh_stag1,material(0xd5a3ff));
  stag.name='STAG1 (6WG3; положение реконструировано)';stag.position.set(9,-19,1.5);right.add(stag);
  // Отдельные половины белковой цепи; в нерасщеплённом состоянии встречаются без щели.
  const gateL=tube([[-5,-19,0],[-6,-23,0],[-3,-25,0],[0,-25,0]],.65,colors.rad21,'RAD21 — левая часть',36);
  const gateR=tube([[0,-25,0],[3,-25,0],[6,-23,0],[5,-19,0]],.65,colors.rad21,'RAD21 — правая часть',36);
  left.add(gateL);right.add(gateR);
  // Оба плеча раскрываются вокруг общего шарнира, не распадаясь на фрагменты.
  for(const half of [left,right]) {
    half.position.y=23;
    for(const child of half.children)child.position.y-=23;
  }
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

  // Два фрагмента хроматина. Нуклеосомы — 1KX5, соединительные участки — реконструкция.
  // Каждая сестра содержит одну НЕПРЕРЫВНУЮ двойную спираль; ни ДНК, ни гистоны не режутся.
  const dnaGroups=[],dnaMat=material(colors.dna),histMat=material(0xbd88ed);
  const template=meta.nucleosomeStrands.map(points=>points.map(p=>new THREE.Vector3(...p)));
  // Полярности цепей противоположны: для построения поверхности идём вдоль обеих в одну сторону.
  if(template[0][0].distanceTo(template[1].at(-1))<template[0][0].distanceTo(template[1][0]))template[1].reverse();
  for(const side of [-1,1]) {
    const dna=new THREE.Group();dna.name='Фрагмент хроматина сестры '+(side<0?1:2);parts.add(dna);
    const centers=[new THREE.Vector3(-2,side*2,-22),new THREE.Vector3(2,-side*2,22)];
    for(const c of centers) {
      const core=new THREE.Mesh(geo.coh_histones,histMat);core.position.copy(c);core.name='Гистоны нуклеосомы · 1KX5';dna.add(core);
    }
    const paths=[];
    for(let strand=0;strand<2;strand++) {
      const first=template[strand].map(p=>p.clone().add(centers[0]));
      const last=template[strand].map(p=>p.clone().add(centers[1]));
      const end=first.at(-1),begin=last[0];
      const bridge=new THREE.CatmullRomCurve3([end,end.clone().add(new THREE.Vector3(0,0,3)),new THREE.Vector3(2,1,-9),new THREE.Vector3(-1,1,0),new THREE.Vector3(0,-1,9),begin.clone().add(new THREE.Vector3(0,0,-3)),begin]);
      const frames=bridge.computeFrenetFrames(180,false),link=[];
      for(let i=1;i<180;i++) {
        const u=i/180,a=u*bridge.getLength()*2*Math.PI/3.4+strand*Math.PI;
        const r=THREE.MathUtils.smoothstep(u,0,.15)*(1-THREE.MathUtils.smoothstep(u,.85,1));
        link.push(bridge.getPointAt(u).addScaledVector(frames.normals[i],r*Math.cos(a)).addScaledVector(frames.binormals[i],r*Math.sin(a)));
      }
      const curve=new THREE.CatmullRomCurve3([...first,...link,...last]);paths.push(curve);
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,1000,.2,5,false),dnaMat);mesh.name='Непрерывная цепь ДНК '+strand;dna.add(mesh);
    }
    dna.position.x=side*6;dnaGroups.push(dna);
  }

  const labels=new THREE.Group();parts.add(labels);
  function label(text,color,position,target) {
    const sprite=textSprite(text,color,2.2);sprite.position.set(...position);labels.add(sprite);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([sprite.position,new THREE.Vector3(...target)]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.55}));labels.add(line);
    return line;
  }
  label('Когезин · удерживает сестёр','#9facff',[20,23,5],[10,17,0]);
  label('RAD21 · замыкает комплекс','#ff8094',[20,-26,5],[0,-25,0]);
  const enzymeLine=label('Сепараза · фермент','#64ffcf',[-32,8,8],[-30,-5,6]);
  label('Хроматин · ДНК и гистоны','#60eaff',[24,6,19],[6,0,22]);
  label('Шарнир','#9facff',[-15,29,0],[0,23,0]);
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

    marker.visible=mode==='cutting'&&opening<.1;
    marker.scale.setScalar(1+.09*Math.sin(time*4));
    const tug=tugAge<1.5?Math.sin(Math.PI*tugAge/1.5)**2*.45:0;
    dnaGroups.forEach((dna,i)=>dna.position.x=(i===0?-1:1)*(6+opening*7+tug));
  }
  draw();
  return {
    group,view:{center:new THREE.Vector3(-.25,-.1,0),radius:4.8},
    get state(){return mode;}, get ready(){return mode==='free';}, get cutDone(){return mode==='cut';},
    evidence:{source:meta,dnaGroups,gateL,gateR},
    tug(){if(mode!=='held'&&mode!=='free')return false;tugAge=0;return true;},
    activate(){if(mode!=='held')return false;mode='unblocking';age=0;return true;},
    cut(){if(mode!=='free')return false;mode='cutting';age=0;return true;},
    update(dt){time+=dt;age+=dt;tugAge+=dt;if(mode==='unblocking'&&age>=2.2){mode='free';age=0;}if(mode==='cutting'&&age>=6.3){mode='cut';age=0;}draw();},
    dispose(){if(disposed)return;disposed=true;const geos=new Set(),mats=new Set();group.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});for(const g of geos)g.dispose();for(const m of mats){m.map?.dispose();m.dispose();}},
  };
}
