import { bindInfoSurface, infoTag, infoWorldPoint } from './mitoinfo.js';
import * as THREE from 'three';
import { loadModel } from './organelles.js';
import { neon, textSprite } from './style.js';
import { ease } from './motion.js';

// Экспериментальные домены из Blender; длинные плечи, середина RAD21 и расположение
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
    mesh.name=name;parts.add(mesh);if(name.startsWith('SMC1'))infoTag(mesh,'smc1');if(name.startsWith('SMC3'))infoTag(mesh,'smc3');return mesh;
  }
  const left = new THREE.Group(), right = new THREE.Group();parts.add(left,right);infoTag(left,'cohesin');infoTag(right,'cohesin');
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
  const hinge=new THREE.Group();
  hinge.name='Шарнир SMC1–SMC3 · 6WG3';
  hinge.position.y=23;
  parts.add(hinge);
  hinge.add(new THREE.Mesh(geo.coh_hinge1,material(colors.smc1)),
            new THREE.Mesh(geo.coh_hinge2,material(colors.smc3)));
  const hingeTips=meta.hingeTips.map(([x,y,z])=>[x,y+23,z]);
  coiledArm([[-5,-18,0],[-14,-6,0],[-12,11,0],[-4,20,0],hingeTips[0]],colors.smc1,left,'SMC1 · спиральное плечо (реконструкция)');
  coiledArm([[5,-18,0],[14,-6,0],[12,11,0],[4,20,0],hingeTips[1]],colors.smc3,right,'SMC3 · спиральное плечо (реконструкция)');
  const head1=new THREE.Mesh(geo.coh_smc1,material(colors.smc1));head1.position.set(-5,-18,0);left.add(head1);
  const head2=new THREE.Mesh(geo.coh_smc3,material(colors.smc3));head2.position.set(5,-18,0);right.add(head2);
  const stag=new THREE.Mesh(geo.coh_stag1,material(0xd5a3ff));
  stag.name='STAG1 (6WG3; положение реконструировано)';stag.position.set(9,-19,1.5);right.add(stag);
  // Концы RAD21 наследуют положение относительно головок из 6WG3.
  const rad21Ends=[geo.coh_rad21c,geo.coh_rad21n].map((geometry,i)=>{
    const mesh=new THREE.Mesh(geometry,material(colors.rad21));
    mesh.position.copy(i===0?head1.position:head2.position);
    (i===0?left:right).add(mesh);
    return infoTag(mesh,'rad21');
  });
  const rad21Tips=meta.rad21Tips.map((p,i)=>new THREE.Vector3(...p).add(rad21Ends[i].position).toArray());
  // Гибкая середина соединяет измеренные участки и расходится в условной точке расщепления.
  const gateL=tube([rad21Tips[0],[-6,-23,.7],[-3,-25,-.5],[0,-25,0]],.42,colors.rad21,'RAD21 · гибкая часть (реконструкция)',36);
  const gateR=tube([[0,-25,0],[3,-25,.5],[6,-23,-.6],rad21Tips[1]],.42,colors.rad21,'RAD21 · гибкая часть (реконструкция)',36);
  left.add(gateL);right.add(gateR);
  // Оба плеча раскрываются вокруг общего шарнира, не распадаясь на фрагменты.
  for(const half of [left,right]) {
    half.position.y=23;
    for(const child of half.children)child.position.y-=23;
  }
  const armPivots=meta.hingeTips.map(p=>new THREE.Vector3(...p));
  const rotatedPivot=new THREE.Vector3();
  infoTag(head1,'smc1');infoTag(head2,'smc3');infoTag(hinge,'hinge');infoTag(stag,'stag');infoTag(gateL,'rad21');infoTag(gateR,'rad21');
  const cutSite=new THREE.Vector3(0,-25,0);
  const marker=new THREE.Mesh(new THREE.TorusGeometry(1.65,.13,6,32),material(colors.rad21));
  marker.position.copy(cutSite);parts.add(marker);

  const enzyme=new THREE.Group();parts.add(enzyme);
  const sep=new THREE.Mesh(geo.coh_separase,material(colors.separase));
  const sec=new THREE.Mesh(geo.coh_securin,material(colors.securin));
  enzyme.add(sep,sec);infoTag(sep,'separase');infoTag(sec,'securin');
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
    const dna=new THREE.Group();dna.name='Фрагмент хроматина сестры '+(side<0?1:2);parts.add(dna);infoTag(dna,'chromatin');
    const centers=[new THREE.Vector3(-2,side*2,-22),new THREE.Vector3(2,-side*2,22)];
    for(const c of centers) {
      const core=new THREE.Mesh(geo.coh_histones,histMat);core.position.copy(c);core.name='Гистоны нуклеосомы · 1KX5';dna.add(core);infoTag(core,'histones');
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
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,1000,.2,5,false),dnaMat);mesh.name='Непрерывная цепь ДНК '+strand;dna.add(mesh);infoTag(mesh,'dna');
    }
    dna.position.x=side*6;dnaGroups.push(dna);
  }

  const labels=new THREE.Group();parts.add(labels);
  const trackedLabels = [];
  function attachSurface(object, mesh, localHint) {
    bindInfoSurface(object, mesh, parts.localToWorld(new THREE.Vector3(...localHint)));
  }
  function label(id,text,color,position,mesh,hint) {
    const sprite=textSprite(text,color,2.2);sprite.position.set(...position);labels.add(sprite);
    infoTag(sprite,id);
    attachSurface(sprite,mesh,hint);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([sprite.position,sprite.position]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.55}));
    labels.add(line);
    line.frustumCulled=false;
    trackedLabels.push({sprite,line});
    return sprite;
  }
  const rightArm=right.children.find(child=>child.userData.info==='smc3');
  const leftArm=left.children.find(child=>child.userData.info==='smc1');
  const frontChromatin=dnaGroups[1];
  const frontHistones=frontChromatin.children[1];
  attachSurface(left,leftArm,[-10,13,0]);
  attachSurface(right,rightArm,[10,13,0]);
  for(const fragment of dnaGroups) {
    const histones=fragment.children[1];
    const hint=parts.worldToLocal(histones.getWorldPosition(new THREE.Vector3()));
    attachSurface(fragment,histones,hint.toArray());
    for(const strand of fragment.children.filter(child=>child.userData.info==='dna')) {
      attachSurface(strand,strand,[fragment.position.x,0,10]);
    }
  }
  label('cohesin','Когезин · удерживает сестёр','#9facff',[20,23,5],rightArm,[10,15,1]);
  label('rad21','RAD21 · замыкает комплекс','#ff8094',[20,-26,5],gateR,[3,-25,0]);
  label('separase','Сепараза · фермент','#64ffcf',[-32,8,8],sep,[-30,-5,6]);
  label('chromatin','Хроматин · ДНК и гистоны','#60eaff',[24,6,19],frontHistones,[10,-1,24]);
  label('hinge','Шарнир','#9facff',[-15,29,0],hinge.children[0],[0,23,2]);
  const secLabel=label('securin','Секурин · блокирует сепаразу','#f4dd4c',[-29,-20,9],sec,[-30,-13,6]);
  let mode='held',time=0,age=0,tugAge=99, disposed=false;
  const labelPoint=new THREE.Vector3();
  function draw() {
    const opening=mode==='cutting'?ease(THREE.MathUtils.smoothstep(age,2.6,5.8)):mode==='cut'?1:0;
    const approach=mode==='cutting'?ease(Math.min(1,age/2.6)):mode==='cut'?1:0;
    enzyme.position.lerpVectors(from,at,approach);
    const unblock=mode==='unblocking'?ease(Math.min(1,age/2.2)):mode==='held'?0:1;
    sec.visible=unblock<.99;
    sec.scale.setScalar(Math.max(.001,1-unblock));
    sec.position.set(-unblock*4,unblock*5,unblock*2);
    secLabel.visible=mode==='held'||mode==='unblocking';
    for(const [index,half] of [left,right].entries()) {
      half.rotation.z=(index===0?-1:1)*opening*.21;
      const pivot=armPivots[index];
      rotatedPivot.copy(pivot).applyQuaternion(half.quaternion);
      half.position.copy(hinge.position).add(pivot).sub(rotatedPivot);
    }

    marker.visible=mode==='cutting'&&opening<.1;
    marker.scale.setScalar(1+.09*Math.sin(time*4));
    const tug=tugAge<1.5?Math.sin(Math.PI*tugAge/1.5)**2*.45:0;
    dnaGroups.forEach((dna,i)=>dna.position.x=(i===0?-1:1)*(6+opening*7+tug));
    for (const {sprite,line} of trackedLabels) {
      line.visible=sprite.visible;
      if (!line.visible) continue;
      const point=labels.worldToLocal(infoWorldPoint(sprite,labelPoint));
      const positions=line.geometry.getAttribute('position');
      positions.setXYZ(1,point.x,point.y,point.z);
      positions.needsUpdate=true;
    }
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
