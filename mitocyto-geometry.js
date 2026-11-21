import * as THREE from 'three';
import { infoTag } from './mitoinfo.js';
import { neon } from './style.js';

const {lerp, smoothstep}=THREE.MathUtils, TAU=Math.PI*2;
const Y=new THREE.Vector3(0,1,0);
const p=(x,y,z)=>new THREE.Vector3(x,y,z);
const COLOR={
  membrane:0x45bfdb, heads:0x8fe9ef, mt:0x95ed50, spindle:0x74d96c, rac:0xa57afa,
  plk:0xffb64d, ect:0x59d4ec, rhoOff:0x577eaf, rhoOn:0xf276cf, gdp:0xff8e65,
  gtp:0x91ebc4, actin:0xfa586d, formin:0x98e7a0, rock:0xa582ff, myosin:0xffb569,
  midbody:0xb8dd70, cep:0xf9c477, alix:0xbc86ed, tsg:0x6da4ff, escrt:0xee82dc, spastin:0xff6c83,
};

function kit() {
  const sphere=new THREE.SphereGeometry(1,20,14);
  const surface=new THREE.IcosahedronGeometry(1,3);
  const positions=surface.getAttribute('position'), normals=surface.getAttribute('normal');
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const r=1+.09*Math.sin(7*x+4*y)*Math.cos(5*y-3*z);
    positions.setXYZ(i,r*x,r*y,r*z);
    normals.setXYZ(i,x,y,z);
  }
  const core=new Map();
  function material(color) {
    if(!core.has(color))core.set(color,neon(color,{body:.92,glow:.74,strength:.82}));
    return core.get(color);
  }
  function mesh(parent,geo,mat,position,id){
    const item=new THREE.Mesh(geo,mat);item.position.copy(position);
    if(id)infoTag(item,id);
    parent.add(item);
    return item;
  }
  function ball(parent,position,r,color,id) {
    const item=mesh(parent,sphere,material(color),position,id);
    item.scale.setScalar(r);
    return item;
  }
  function protein(parent,id,position,color,size,domains=3){
    const item=infoTag(new THREE.Group(),id);
    item.position.copy(position);item.scale.setScalar(size);parent.add(item);
    for(let i=0;i<domains;i++){
      const angle=i*TAU/domains+.13;
      const piece=mesh(item,surface,material(color),p(.42*Math.cos(angle),.34*Math.sin(angle),.12*Math.cos(2*angle)));
      piece.scale.set(.52,.44+.075*(i%2),.41);
      piece.rotation.set(angle*.26,.6*Math.sin(angle),angle);
    }
    return item;
  }
  function tube(parent,pts,width,color,resolution=32,id){
    const curve=new THREE.CatmullRomCurve3(pts);
    return mesh(parent,new THREE.TubeGeometry(curve,resolution,width,7,false),material(color),p(0,0,0),id);
  }
  return {sphere,material,mesh,ball,protein,tube};
}

const mark=(text,object,anchor=p(0,0,0),ready=()=>true)=>({text,object,anchor,ready});
function expose(mesh,k){
  const length=mesh.geometry.index.count;
  mesh.geometry.setDrawRange(0,Math.floor(length/42*k)*42);
  mesh.visible=k>.012;
}

function corticalMembrane(group, shapes) {
  const {sphere,material,mesh}=shapes;
  const membrane=infoTag(new THREE.Group(),'cytoCortex');
  group.add(membrane);
  const glass=neon(COLOR.membrane,{glass:true,body:.10,glow:.33,strength:.32});
  function leaflet(u,v,layer){
    const x=2.26+u*2.32*(1-.11*v**6)+.04*Math.sin(v*4.2);
    const y=2.32*v*(1-.13*u**6)+.15*Math.sin(u*3.3);
    const z=-.64+.05*(x-2.26)**2+.018*y*y+layer*.105;
    return p(x,y,z);
  }
  for(const layer of [-1,1]){
    const geo=new THREE.PlaneGeometry(2,2,36,22);
    const attr=geo.getAttribute('position');
    for(let i=0;i<attr.count;i++){
      const {x,y,z}=leaflet(attr.getX(i),attr.getY(i),layer);
      attr.setXYZ(i,x,y,z);
    }
    geo.computeVertexNormals();
    mesh(membrane,geo,glass,p(0,0,0));
  }
  const lipids=new THREE.InstancedMesh(sphere,material(COLOR.heads),2*(38+34));
  const matrix=new THREE.Matrix4(), tails=[];let i=0;
  function head(u,v,layer){
    const {x,y,z}=leaflet(u,v,layer);
    const radius=.042+.004*Math.sin(3.7*i);
    lipids.setMatrixAt(i++,matrix.makeScale(radius,radius,radius).setPosition(x,y,z));
    tails.push(x-.017,y,z,x-.027,y-.007,z-.076*layer,x+.017,y,z,x+.027,y+.009,z-.076*layer);
  }
  for(const layer of [-1,1]){
    for(let u=0;u<38;u++)head(-1+2*u/37,-1,layer);
    for(let v=0;v<34;v++)head(1,-.94+1.94*v/33,layer);
  }
  const edge=new THREE.BufferGeometry();
  edge.setAttribute('position',new THREE.Float32BufferAttribute(tails,3));
  membrane.add(lipids,new THREE.LineSegments(edge,new THREE.LineBasicMaterial({color:0x61acc0,transparent:true,opacity:.68})));
  return membrane;
}

function nucleotide(parent,shapes,id,position,color,count){
  const item=infoTag(new THREE.Group(),id);item.position.copy(position);parent.add(item);
  shapes.ball(item,p(-.10,0,0),.115,color);
  for(let i=0;i<count;i++)shapes.ball(item,p(.018+.105*i,.024*Math.sin(i*2),0),.064,color);
  return item;
}

// Координаты двух участков клетки сжаты, чтобы одновременно показать перекрытие и кору.
export function buildRingDetail(){
  const group=new THREE.Group(), shapes=kit();
  const {ball,protein,tube}=shapes;
  const spindle=infoTag(new THREE.Group(),'cytoOverlap');
  spindle.position.x=-2.16;group.add(spindle);
  for(const side of [-1,1]){
    for(let i=0;i<11;i++){
      const a=i*2.39996+side*.14, x=Math.cos(a),z=Math.sin(a),r=.16+.038*i;
      tube(spindle,[p(r*x*1.25,side*(2.45+.2*Math.cos(a)),r*z*1.25),
        p(r*x,side*1.03,r*z),p(r*x*.72,-side*(.21+.09*Math.sin(a)),r*z*.72)],
        .033+.011*(i%3),side===1?COLOR.mt:COLOR.spindle,28);
    }
  }
  const complex=infoTag(new THREE.Group(),'centralspindlin');
  complex.position.set(-1.67,.04,.28);group.add(complex);
  for(const side of [-1,1]){
    tube(complex,[p(-.35,side*.13,-.04),p(-.12,side*.10,.06),p(.22,side*.14,.08)],.076,COLOR.ect,17);
    ball(complex,p(-.38,side*.18,-.03),.145,COLOR.ect);
    protein(complex,'racgap1',p(.24,side*.16,side*.08),COLOR.rac,.34);
  }
  const phosphate=[ball(complex,p(.40,.25,.14),.073,COLOR.plk,'cytoPhosphate'),
    ball(complex,p(.42,-.20,.09),.073,COLOR.plk,'cytoPhosphate')];
  const plk=protein(group,'cytoPlk1',p(-.6,.78,.60),COLOR.plk,.44);
  const docked=protein(group,'cytoEct2',p(-.84,.12,.53),COLOR.ect,.48,4);
  const membrane=corticalMembrane(group,shapes);
  const belt=infoTag(new THREE.Group(),'cytoRho');
  group.add(belt);
  for(let i=0;i<16;i++){
    const x=.14+i*.275,y=.17*Math.sin(2.6*i)+.08*Math.cos(.9*i);
    const z=-.36+.055*(x-2.26)**2;
    ball(belt,p(x,y,z),.075+(i%3)*.012,COLOR.rhoOff);
  }
  const rho=protein(group,'cytoRho',p(2.25,.08,-.15),COLOR.rhoOff,.56);
  const activeRho=protein(group,'cytoRho',rho.position,COLOR.rhoOn,.56);
  const activeBelt=infoTag(new THREE.Group(),'cytoRho');
  group.add(activeBelt);
  for(let i=0;i<12;i++){
    const x=.28+i*.355,y=.153*Math.sin(i*2.4),z=-.36+.055*(x-2.26)**2;
    ball(activeBelt,p(x,y,z),.066+(i%4)*.012,COLOR.rhoOn);
  }
  const anchor=shapes.tube(group,[p(2.18,.03,-.18),p(2.15,-.018,-.37),p(2.17,.02,-.60)],.043,COLOR.rhoOff,16,'cytoRho');
  const ect=protein(group,'cytoEct2',p(2.9,.62,.23),COLOR.ect,.56,4);
  const gdp=nucleotide(group,shapes,'cytoGdp',p(2.33,.15,.17),COLOR.gdp,2);
  const gtp=nucleotide(group,shapes,'cytoGtp',p(2.33,.15,.17),COLOR.gtp,3);
  const actin=infoTag(new THREE.Group(),'cytoActin'), motors=infoTag(new THREE.Group(),'cytoMyosin');
  group.add(actin,motors);
  const filaments=[];
  for(let strand=0;strand<5;strand++){
    const points=Array.from({length:19},(_,i)=>{
      const u=strand%2?1-i/18:i/18,x=.16+u*4.25;
      return p(x,(strand-2)*.184+.14*Math.sin(4.9*u+strand*1.5),.46+.14*Math.cos(u*6.8+strand)+strand*.062);
    });
    const filament=tube(actin,points,.055,COLOR.actin,52);
    const nodes=new THREE.InstancedMesh(shapes.sphere,shapes.material(COLOR.actin),45);
    const matrix=new THREE.Matrix4();
    for(let i=0;i<nodes.count;i++){
      const u=i/(nodes.count-1),center=filament.geometry.parameters.path.getPointAt(u);
      const size=.065+.009*Math.sin(i*2.4);
      matrix.makeScale(size,size*.84,size*.91).setPosition(center);
      nodes.setMatrixAt(i,matrix);
    }
    actin.add(nodes);nodes.computeBoundingSphere();
    filaments.push({filament,nodes,delay:strand*.065,direction:strand%2?1:-1});
  }
  const formin=protein(group,'cytoFormin',p(4.27,.34,.79),COLOR.formin,.31,2);
  const rock=protein(group,'cytoRock',p(1.70,-.83,.42),COLOR.rock,.39);
  for(let i=0;i<5;i++){
    const x=.84+i*.75,y=.097*Math.cos(i*2.6),z=.65+(i%2)*.18;
    tube(motors,[p(x-.23,y,z),p(x,y,z+.03),p(x+.23,y,z)],.048,COLOR.myosin,12);
    for(const side of [-1,1]){
      for(const angle of [-1,1]){
        tube(motors,[p(x+side*.12,y,z),p(x+side*.21,y+angle*.09,z+.05),p(x+side*.27,y+angle*.13,z+.06)],
          .028,COLOR.myosin,11);
        ball(motors,p(x+side*.27,y+angle*.13,z+.06),.060,COLOR.myosin);
      }
    }
  }
  const tags={
    spindle:mark('Перекрытие микротрубочек',spindle,p(-.20,.91,.28)),
    complex:mark('Центральспиндлин',complex,p(.10,-.16,.27)),
    membrane:mark('Экваториальная кора',membrane,p(3.2,0,-.48)),
    plk:mark('Plk1',plk,p(.22,.26,.22)),
    docking:mark('ECT2',docked,p(.24,-.25,.24)),
    ect:mark('ECT2',ect,p(.26,.24,.2)),
    rhoOff:mark('RhoA',rho,p(-.36,.14,.16)),
    rhoOn:mark('RhoA',activeRho,p(-.36,.14,.16)),
    gdp:mark('GDP',gdp,p(.12,-.14,.09)),
    gtp:mark('GTP',gtp,p(.20,-.14,.09)),
    formin:mark('Формин',formin,p(.23,.1,.07)),
    rock:mark('ROCK',rock,p(-.15,-.13,.05)),
    motors:mark('Миозин II',motors,p(3.22,-.10,.86)),
  };
  let step=0,block=false;
  return {
    group,
    view(i){
      if(i===0)return {target:p(.08,0,0),radius:3.45,direction:[.18,.12,1]};
      if(i===1)return {target:p(-1.59,.04,.18),radius:2.24,direction:[.10,.17,1]};
      return {target:p(2.25,-.01,.10),radius:i===2?2.35:2.5,direction:[.16,.22,1]};
    },
    labels(){
      if(step===0)return [tags.spindle,tags.complex,tags.membrane];
      if(step===1)return [tags.complex,tags.plk,tags.docking];
      if(step===2||block)return [tags.ect,activeRho.visible?tags.rhoOn:tags.rhoOff,gdp.visible?tags.gdp:tags.gtp];
      return [tags.formin,tags.rock,tags.motors];
    },
    show(index,k,blocked){
      step=index;block=blocked;
      spindle.visible=complex.visible=index<2;
      membrane.visible=true;
      const dock=smoothstep(k,.32,.85);
      const phosphorylation=smoothstep(k,.12,.37);
      plk.visible=index===1;
      plk.position.set(lerp(-.75,-1.16,phosphorylation),lerp(.96,.54,phosphorylation),.60);
      phosphate.forEach(o=>{o.visible=index===1&&phosphorylation>.03;o.scale.setScalar(.073*phosphorylation);});
      docked.visible=index===1;
      docked.position.set(lerp(-.43,-.98,dock),lerp(-.60,-.15,dock),.48);
      docked.rotation.z=-.38*(1-dock);
      const activation=index===2&&!blocked?smoothstep(k,.47,.82):index>=3&&!blocked?1:0;
      const exchange=index===2?smoothstep(k,.12,.48):0;
      const close=index>=2;
      belt.visible=close;
      rho.visible=anchor.visible=close;
      rho.visible=close&&activation<.57;
      activeRho.visible=close&&activation>=.57;
      activeBelt.visible=activation>.04;
      activeBelt.scale.set(1,1,Math.max(.25,activation));
      ect.visible=index===2&&!blocked;
      const release=smoothstep(activation,.68,1);
      ect.position.set(lerp(3.44,2.80,exchange)+.44*release,
        lerp(.78,.28,exchange)+.34*release,lerp(.44,.13,exchange)+.18*release);
      gdp.visible=close&&activation<.74;
      gdp.position.set(2.34-.42*exchange,.16-.38*exchange,.23+.61*exchange);
      gtp.visible=close&&activation>.23;
      gtp.position.set(lerp(2.93,2.39,activation),lerp(-.34,.035,activation),lerp(.73,.34,activation));
      gtp.rotation.z=-.39*activation;
      const grow=index===3&&!blocked?smoothstep(k,0,.69):0;
      actin.visible=grow>0;
      motors.visible=grow>.37;
      const tension=smoothstep(grow,.58,1);
      actin.scale.x=1-.11*tension;
      actin.position.x=.23*tension;
      motors.scale.set(1,Math.max(.16,grow),1);
      formin.visible=grow>.08;rock.visible=grow>.17;
      for(const {filament,nodes,delay,direction} of filaments){
        const deposited=smoothstep(grow,delay,.86);
        expose(filament,deposited);
        nodes.count=Math.floor(45*deposited);
        filament.position.x=nodes.position.x=.13*tension*direction;
      }
    },
  };
}

function bridgeSurface(shapes,parent,material){
  const sides=54,rows=46,indices=[],vertices=new Float32Array((rows+1)*(sides+1)*3);
  for(let row=0;row<rows;row++)for(let i=0;i<sides;i++){
    const a=row*(sides+1)+i,b=a+sides+1;
    indices.push(a,a+1,b,b,a+1,b+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  const mesh=shapes.mesh(parent,geometry,material,p(0,0,0));
  mesh.frustumCulled=false;
  geometry.boundingSphere=new THREE.Sphere(p(0,0,0),6);
  const circle=Array.from({length:sides+1},(_,i)=>[Math.cos(i/sides*TAU),Math.sin(i/sides*TAU)]);
  return {mesh,set(from,to,radius){
    const pos=geometry.getAttribute('position');
    for(let row=0;row<=rows;row++){
      const u=row/rows,y=lerp(from,to,u),r=radius(y,u);
      for(let i=0;i<=sides;i++)pos.setXYZ(row*(sides+1)+i,r*circle[i][0],y,r*circle[i][1]);
    }
    pos.needsUpdate=true;geometry.computeVertexNormals();
  }};
}

export function buildBridgeDetail(){
  const group=new THREE.Group(),shapes=kit(),{ball,protein,tube,mesh,material}=shapes;
  const neck=infoTag(new THREE.Group(),'cytoBridgeMembrane');group.add(neck);
  const glass=neon(COLOR.membrane,{glass:true,body:.22,glow:1.26,strength:.64});
  const connected=bridgeSurface(shapes,neck,glass);
  const ends=[bridgeSurface(shapes,neck,glass),bridgeSurface(shapes,neck,glass)];
  const cut=-1.02;
  const fibers=infoTag(new THREE.Group(),'cytoBridgeTubulin');group.add(fibers);
  const cylinder=new THREE.CylinderGeometry(1,1,1,10);
  const rods=Array.from({length:13},(_,i)=>{
    const a=i*2.39996,r=.077+.02*i;
    const x=r*Math.cos(a),z=r*Math.sin(a),width=.048+.014*(i%3);
    const pair=[mesh(fibers,cylinder,material(COLOR.mt),p(x,0,z)),
      mesh(fibers,cylinder,material(COLOR.spindle),p(x+.026,0,z+.018))];
    return {pair,width,offset:.054*Math.sin(i*2.1)};
  });
  const middle=infoTag(new THREE.Group(),'midbody');group.add(middle);
  for(let i=0;i<15;i++){
    const angle=i/15*TAU;
    const kernel=ball(middle,p(.37*Math.cos(angle),.105*Math.sin(i*1.7),.37*Math.sin(angle)),.129,COLOR.midbody);
    kernel.scale.y=.155+.064*Math.sin(i*2.07)**2;
  }
  const cep=infoTag(new THREE.Group(),'cytoCep55'),alix=infoTag(new THREE.Group(),'cytoAlix'),tsg=infoTag(new THREE.Group(),'cytoTsg');
  middle.add(cep,alix,tsg);
  for(let i=0;i<6;i++){
    const a=i*TAU/6,c=Math.cos(a),s=Math.sin(a);
    protein(cep,'cytoCep55',p(.61*c,.05*Math.sin(i*2),.61*s),COLOR.cep,.22,2);
    protein(alix,'cytoAlix',p(.67*c,.39,.67*s),COLOR.alix,.24);
    protein(tsg,'cytoTsg',p(.67*c,-.39,.67*s),COLOR.tsg,.24,4);
  }
  const coil=infoTag(new THREE.Group(),'cytoEscrt');
  group.add(coil);
  const spiral=Array.from({length:75},(_,i)=>{
    const t=i/74,a=t*TAU*3.15+.68,r=lerp(.65,.173,smoothstep(t,0,1));
    return p(r*Math.cos(a),lerp(-.37,cut,t),r*Math.sin(a));
  });
  const helix=tube(coil,spiral,.058,COLOR.escrt,100);
  const enzyme=infoTag(new THREE.Group(),'cytoSpastin');group.add(enzyme);
  for(let i=0;i<6;i++){
    const a=i/6*TAU;
    protein(enzyme,'cytoSpastin',p(.16*Math.cos(a),.027*Math.sin(i*2),.16*Math.sin(a)),COLOR.spastin,.175,2);
  }
  const tags={
    neck:mark('Мембрана мостика',neck,p(.68,cut,.10)),
    mt:mark('Микротрубочки',fibers,p(.18,-1.59,.18)),
    mid:mark('Срединное тельце',middle,p(.39,.06,.31)),
    cep:mark('CEP55',cep,p(.45,.13,.40)),
    alix:mark('ALIX',alix,p(-.44,.45,.47)),
    tsg:mark('TSG101 / ESCRT-I',tsg,p(.34,-.46,.53)),
    escrt:mark('ESCRT-III',coil,p(.39,-.74,.39)),
    spastin:mark('Спастин',enzyme,p(.19,-.01,.14)),
  };
  function stem(y,indent){
    const shoulder=.94*smoothstep(Math.abs(y),1.84,3.17);
    const narrow=Math.exp(-(((y-cut)/.43)**2));
    return .78+shoulder-.55*narrow*indent+.028*Math.sin(y*5.1);
  }
  function stretch(rod,a,b,width){
    rod.position.y=(a+b)*.5;
    rod.scale.set(width,Math.max(.001,b-a),width);
  }
  let step=0;
  return {
    group,
    view(i){return {target:p(0,i>=2?-.51:-.17,0),radius:2.52,direction:[.19,.035,1]};},
    labels(){
      if(step===0)return [tags.mid,tags.cep,tags.mt];
      if(step===1)return [tags.cep,tags.alix,tags.tsg];
      if(step===2)return [tags.escrt,tags.neck,tags.mid];
      if(step===3)return [tags.spastin,tags.escrt,tags.mt];
      return [tags.mid,tags.neck,tags.mt];
    },
    show(index,k,blocked){
      step=index;
      const indent=index===2?smoothstep(k,.17,1):index>=3?1:0;
      const breakage=index===3?smoothstep(k,.33,.96):index>=4&&!blocked?1:0;
      const split=index===4&&!blocked?smoothstep(k,.42,1):0;
      connected.mesh.visible=split<.07;
      ends.forEach(end=>{end.mesh.visible=split>=.07;});
      if(split<.07)connected.set(-3.24,3.24,y=>stem(y,indent));
      else{
        const gap=.43*split;
        ends[0].set(-3.24-gap,cut-gap,(y,u)=>stem(y+gap,indent)*Math.sqrt(Math.max(0,1-smoothstep(u,.84,1))));
        ends[1].set(cut+gap,3.24+gap,(y,u)=>stem(y-gap,indent)*Math.sqrt(smoothstep(u,0,.14)));
      }
      middle.position.y=.23*split;
      cep.scale.setScalar(index===0?lerp(.34,1,smoothstep(k,0,.89)):1);
      cep.position.y=index===0?.54*(1-smoothstep(k,0,.89)):0;
      const recruited=index===1?smoothstep(k,.06,.86):index>=2?1:0;
      alix.visible=tsg.visible=recruited>.01;
      alix.position.y=.43*(1-recruited);
      tsg.position.y=-.43*(1-recruited);
      alix.scale.setScalar(.32+.68*recruited);tsg.scale.setScalar(.32+.68*recruited);
      const assembly=index===2?smoothstep(k,0,.94):index>=3?1:0;
      coil.visible=assembly>.01&&split<.42;
      expose(helix,assembly*(1-.6*split));
      enzyme.visible=index===3&&!blocked;
      enzyme.position.set(.012,cut+.115,.66*(1-smoothstep(k,0,.43))+.19);
      enzyme.rotation.y=k*Math.PI*.9;
      fibers.position.y=0;
      for(const {pair,width,offset} of rods){
        stretch(pair[0],lerp(-1.29,cut+.20+offset,breakage)+.48*split,3.1+.48*split,width);
        stretch(pair[1],-3.12-.48*split,lerp(.54,cut-.29+offset,breakage)-.48*split,width);
      }
    },
  };
}
