import * as THREE from 'three';
import { infoTag } from './mitoinfo.js';
import { neon } from './style.js';
import { createPhragmoplast, plateReach } from './mitophragmoplast.js';

const { clamp, smoothstep } = THREE.MathUtils;
const WIDTH = 4.94, DEPTH = 2.66;

function outline(path, x, y, r) {
  path.moveTo(-x+r,-y);path.lineTo(x-r,-y);path.quadraticCurveTo(x,-y,x,-y+r);
  path.lineTo(x,y-r);path.quadraticCurveTo(x,y,x-r,y);
  path.lineTo(-x+r,y);path.quadraticCurveTo(-x,y,-x,y-r);
  path.lineTo(-x,-y+r);path.quadraticCurveTo(-x,-y,-x+r,-y);
  return path;
}

function border(x,y,r,thickness) {
  const shape=outline(new THREE.Shape(),x,y,r);
  shape.holes.push(outline(new THREE.Path(),x-thickness,y-thickness,r-thickness));
  return shape;
}

// Порядок треугольников задаёт рост неровного края и заполнение отверстий позади него.
function plateGeometry() {
  const nx=40,nz=26, vertices=[], faces=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const x=2*i/nx-1,z=2*j/nz-1;
    const jitter=Math.sin(i*13.2+j*17.04)*.021;
    vertices.push((x+jitter*(1-Math.abs(x)))*WIDTH,.026*Math.sin(9*x+7*z),(z-jitter*(1-Math.abs(z)))*DEPTH);
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;
    const x=2*(i+.5)/nx-1,z=2*(j+.5)/nz-1;
    const reach=plateReach(x,z);
    // Просветы закрываются отдельными участками позади растущего края.
    const hole=smoothstep(Math.sin(24*x+11*z)*Math.sin(21*z-9*x),.24,.95);
    const when=clamp(.84*reach+.045+.14*hole,.025,.99);
    faces.push({when,index:[a,c,b,b,c,d]});
  }
  faces.sort((a,b)=>a.when-b.when);
  const shape=new THREE.BufferGeometry();
  shape.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  shape.setIndex(faces.flatMap(f=>f.index));shape.computeVertexNormals();
  return {shape,draw(k){
    const reached=faces.findIndex(f=>f.when>k);
    shape.setDrawRange(0,(reached<0?faces.length:reached)*6);
  }};
}

function addDaughterNuclei(group) {
  const envelope = new THREE.SphereGeometry(1,34,24);
  const surface = envelope.getAttribute('position');
  for (let i=0;i<surface.count;i++) {
    const x=surface.getX(i), y=surface.getY(i), z=surface.getZ(i);
    const r=1+.032*Math.sin(7*x+4*y)*Math.sin(6*y-3*z);
    surface.setXYZ(i,r*x,r*y,r*z);
  }
  envelope.computeVertexNormals();
  const veil=neon(0x945bdf,{glass:true,body:.19,power:2.2,glow:.84,strength:.55});
  const chromatin=neon(0xb184e5,{body:.68,glow:.3,strength:.51});
  const nucleolusMaterial=neon(0xcf60ad,{body:.74,glow:.36,strength:.69});
  const seedGeometry=new THREE.SphereGeometry(1,22,16);
  for (const side of [-1,1]) {
    const nucleus=new THREE.Group();
    nucleus.scale.set(1.22,.94,.8);
    nucleus.position.set(-side*.33,side*2.34,-.29);
    nucleus.rotation.set(side*.12,side*.3,-side*.12);
    group.add(nucleus);
    nucleus.add(new THREE.Mesh(envelope,veil));
    for (let strand=0;strand<6;strand++) {
      const phase=strand*2.4+side*2;
      const points=Array.from({length:24},(_,i)=>{
        const a=i/24*Math.PI*2;
        const r=.53+.20*Math.sin(3*a+phase)+.05*Math.cos(5*a-phase);
        return new THREE.Vector3(r*Math.cos(a+phase),.48*Math.sin(2*a+phase)+.14*Math.cos(3*a),r*Math.sin(a+phase));
      });
      const thread=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),48,.021,5,true),chromatin);
      thread.rotation.set(strand*.88,phase,.19*strand);
      nucleus.add(thread);
    }
    const nucleolus=new THREE.Mesh(seedGeometry,nucleolusMaterial);
    nucleolus.scale.set(.235,.21,.23);
    nucleolus.position.set(.26,.10,.21);
    nucleus.add(nucleolus);
  }
}

// Учебный разрез клетки корешка. Передняя часть открыта, чтобы видеть пластинку.
export function createPlantDivision(scale) {
  const group=new THREE.Group();group.scale.setScalar(scale);
  const wallMaterial=neon(0x439c73,{glass:true,body:.30,glow:.42,strength:.46});
  const cutMaterial=neon(0x82c9a1,{body:.67,glow:.55,strength:.72});
  const membraneMaterial=neon(0x64e6d5,{glass:true,body:.21,glow:.31,strength:.28});
  function extruded(shape, depth, mat) {
    return new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{
      depth,steps:1,curveSegments:10,bevelEnabled:false,
    }),mat);
  }
  const wall=infoTag(extruded(border(5.36,4.46,.78,.39),5.39,wallMaterial),'plantWall');
  wall.position.z=-2.70;group.add(wall);
  const cut=infoTag(new THREE.Mesh(new THREE.ShapeGeometry(border(5.36,4.46,.78,.39),12),cutMaterial),'plantWall');
  cut.position.z=2.696;group.add(cut);
  const lining=infoTag(extruded(border(4.97,4.07,.39,.066),5.36,membraneMaterial),'plantMembrane');
  lining.position.z=-2.68;group.add(lining);
  const backMaterial=neon(0x275f58,{glass:true,body:.35,glow:.32,strength:.55});
  const back=new THREE.Mesh(new THREE.ShapeGeometry(outline(new THREE.Shape(),5.35,4.45,.78),12),backMaterial);
  back.position.z=-2.704;group.add(back);

  // Тонкие волокна в срезе стенки. Направления условны.
  const threads=[];
  for(const side of [-1,1])for(let j=0;j<4;j++)for(let i=0;i<38;i++){
    const x=side*(5.02+j*.072+Math.sin(i*.7+j)*.015), y=-3.57+i*.188;
    threads.push(x,y,2.705,x+side*.018,y+.155,2.706);
  }
  for(const side of [-1,1])for(let j=0;j<3;j++)for(let i=0;i<43;i++){
    const x=-4.58+i*.215,y=side*(4.12+j*.092+.013*Math.sin(i*.6+j));
    threads.push(x,y,2.705,x+.18,y+side*.014,2.706);
  }
  const fibers=new THREE.BufferGeometry();
  fibers.setAttribute('position',new THREE.Float32BufferAttribute(threads,3));
  group.add(new THREE.LineSegments(fibers,new THREE.LineBasicMaterial({color:0xc4f0bf,transparent:true,opacity:.53})));

  addDaughterNuclei(group);

  const layer=plateGeometry();
  const coreMaterial=neon(0xf6ad54,{body:.69,glow:.27,strength:.66});
  coreMaterial.side=THREE.DoubleSide;
  const wallCore=infoTag(new THREE.Mesh(layer.shape,coreMaterial),'cellPlate');
  const skinMaterial=new THREE.MeshBasicMaterial({color:0x61dfd2,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
  const skins=[-.155,.155].map(y=>{
    const sheet=infoTag(new THREE.Mesh(layer.shape,skinMaterial),'plateMembranes');
    sheet.position.y=y;group.add(sheet);return sheet;
  });
  group.add(wallCore);
  // Три полосы на переднем срезе дают прочитать слои готовой перегородки.
  const bands=[
    [0,.24,coreMaterial,'cellPlate'],
    [-.155,.065,neon(0x68eddc,{body:.69,glow:.29,strength:.66}),'plateMembranes'],
    [.155,.065,neon(0x68eddc,{body:.69,glow:.29,strength:.66}),'plateMembranes'],
  ].map(([y,height,material,id])=>{
    const band=infoTag(new THREE.Mesh(new THREE.BoxGeometry(2*WIDTH,height,.075),material),id);
    band.position.set(0,y,DEPTH-.024);group.add(band);return band;
  });

  const apparatus=createPhragmoplast(WIDTH,DEPTH);
  group.add(apparatus.group);
  const edgePoint=new THREE.Vector3(-.75,0,1.25);
  let growth=0, wallInView=false;
  const labels=[
    {text:'Клеточная стенка',object:wall,anchor:new THREE.Vector3(-5.18,2.9,5.28),ready:()=>wallInView},
    {text:'Фрагмопласт',object:apparatus.guides,anchor:apparatus.anchor,ready:()=>apparatus.hasAnchor},
    {text:'Клеточная пластинка',object:wallCore,anchor:edgePoint,ready:()=>wallCore.visible},
  ];
  return {group,labels,get growth(){return growth;},set(k){
    growth=smoothstep(k,.27,1);
    wallInView=k>=.75;
    const context=.48+.52*smoothstep(k,.52,.85);
    wallMaterial.uniforms.strength.value=.46*context;
    cutMaterial.uniforms.strength.value=.40+.32*context;
    membraneMaterial.uniforms.strength.value=.28*context;
    backMaterial.uniforms.strength.value=.55*context;
    const front=apparatus.set(k);
    const coverage=clamp(front-.18,0,1)*smoothstep(k,.33,.47)+.065*smoothstep(k,.86,1);
    layer.draw(coverage);
    wallCore.visible=coverage>.014;skins.forEach(skin=>{skin.visible=wallCore.visible;});
    bands.forEach(band=>{
      band.visible=k>=.94;
      band.scale.x=smoothstep(k,.94,1);
    });
    edgePoint.set(-1.7*coverage,0,1.65*coverage);
  }};
}
