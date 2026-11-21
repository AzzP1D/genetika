import * as THREE from 'three';
import { infoTag } from './mitoinfo.js';
import { neon } from './style.js';

const { lerp, clamp, smoothstep } = THREE.MathUtils;
const TAU = 2 * Math.PI;

export function plateReach(x, z) {
  return (x**4 + z**4)**.25;
}

// Все трубочки одного типа используют одну геометрию и один вызов отрисовки.
function tubeBatch(capacity, length, material, info, endTaper = .34) {
  const facets = 6, vertices = (length + 1) * facets;
  const positions = new Float32Array(capacity * vertices * 3);
  const normals = new Float32Array(positions.length), colors = new Float32Array(positions.length);
  const indices = [];
  for (let i = 0; i < capacity; i++) {
    for (let row = 0; row < length; row++) {
      for (let j = 0; j < facets; j++) {
        const a = i * vertices + row * facets + j, b = a - j + (j + 1) % facets;
        indices.push(a, b, a + facets, b, b + facets, a + facets);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  const attributes = [positions, normals, colors].map(array =>
    new THREE.BufferAttribute(array, 3).setUsage(THREE.DynamicDrawUsage));
  ['position', 'normal', 'color'].forEach((name, i) => geometry.setAttribute(name, attributes[i]));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6.4);
  const mesh = infoTag(new THREE.Mesh(geometry, material), info);
  const circle = Array.from({length: facets}, (_, j) => [Math.cos(j * TAU / facets), Math.sin(j * TAU / facets)]);
  const p = new THREE.Vector3(), next = new THREE.Vector3(), last = new THREE.Vector3();
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3();
  const direction = new THREE.Vector3(), xAxis = new THREE.Vector3(1, 0, 0), zAxis = new THREE.Vector3(0, 0, 1);
  let used = 0;
  return {
    mesh,
    begin() { used = 0; },
    add(curve, from, to, radius, base, tip) {
      if (to - from < .014 || radius < .002) return;
      curve.getPoint(from, last);
      curve.getPoint(to, next);
      const ref = Math.abs(next.x - last.x) > Math.abs(next.z - last.z) ? zAxis : xAxis;
      let offset = used++ * vertices * 3;
      for (let row = 0; row <= length; row++) {
        const u = row / length, t = lerp(from, to, u);
        curve.getPoint(t, p);
        curve.getTangent(t, tangent);
        normal.copy(ref).addScaledVector(tangent, -ref.dot(tangent)).normalize();
        binormal.crossVectors(tangent, normal);
        const r = radius * (endTaper + (1-endTaper) * Math.sin(Math.PI * u)**.21);
        for (const [cos, sin] of circle) {
          direction.copy(normal).multiplyScalar(cos).addScaledVector(binormal, sin);
          positions[offset] = p.x + r * direction.x;
          normals[offset] = direction.x;
          colors[offset++] = lerp(base.r, tip.r, u);
          positions[offset] = p.y + r * direction.y;
          normals[offset] = direction.y;
          colors[offset++] = lerp(base.g, tip.g, u);
          positions[offset] = p.z + r * direction.z;
          normals[offset] = direction.z;
          colors[offset++] = lerp(base.b, tip.b, u);
        }
      }
    },
    end() {
      mesh.visible = used > 0;
      geometry.setDrawRange(0, used * length * facets * 6);
      if (used) {
        for (const a of attributes) {
          a.clearUpdateRanges();
          a.addUpdateRange(0, used * vertices * 3);
          a.needsUpdate = true;
        }
      }
    },
  };
}

function path(a, b, c) {
  const curve = new THREE.QuadraticBezierCurve3(a, b, c);
  // Касательная к дуге нужна для 3D-профиля нитей и ориентации пузырьков.
  curve.getTangent = (t, out) => out.copy(b).sub(a).multiplyScalar(1-t)
    .addScaledVector(c, t).addScaledVector(b, -t).normalize();
  return curve;
}

function createTracks(width, depth) {
  const tracks = [];
  const radii = [.035, .135, .29, .45, .61, .79, .96, 1.07];
  [3, 10, 14, 16, 20, 24, 28, 16].forEach((count, ring) => {
    for (let i = 0; i < count; i++) {
      const seed = (i + 1) * 2.39996 + ring * 4.13;
      const angle = TAU * i / count + ring * .74 + .12 * Math.sin(seed);
      const radius = radii[ring] + .041 * Math.cos(seed * 1.4);
      const x = Math.cos(angle), z = Math.sin(angle), size = radius / plateReach(x, z);
      const footX = clamp(x * size, -.97, .97) * width;
      const footZ = clamp(z * size, -.96, .96) * depth;
      for (const side of [-1, 1]) {
        const a = seed + side * 1.25;
        const bend = .21 + .19 * Math.sin(a);
        const startY = side * (1.08 + .47 * Math.sin(.5*a)**2 - .21 * clamp(radius, 0, 1));
        const tipY = side * (.095 + .16 * Math.sin(4*a)**2);
        const twist = .155 * Math.cos(a * 2.1);
        const tip = new THREE.Vector3(footX - .09*z*side, tipY, footZ + .09*x*side);
        const mid = new THREE.Vector3(footX + z*twist, startY*.59, footZ - x*twist);
        const base = new THREE.Vector3(footX - x*bend + z*twist, startY, footZ - z*bend - x*twist);
        const offset = new THREE.Vector3(.061*z,0,-.061*x);
        const companion = Math.sin(a*1.9) > -.04
          ? path(base.clone().addScaledVector(offset,1.5),mid.clone().add(offset),tip.clone().addScaledVector(offset,.6))
          : null;
        tracks.push({curve: path(base,mid,tip), companion, radius, side, seed:a, onset:.075*Math.sin(a*1.57),
          thickness:.017 + .015*Math.cos(a*.66)**2, cargo:(i + ring) % 3 === 0,
        });
      }
    }
  });
  return tracks;
}

function createNetwork(width, depth) {
  const links = [];
  const grid = new Map();
  for (let i = -5; i <= 5; i++) {
    for (let j = -4; j <= 4; j++) {
      const seed = i * 5.23 + j * 3.41;
      const x = (i + (Math.abs(j) % 2) * .45) * .168 + .045*Math.sin(seed);
      const z = j * .209 + .055*Math.cos(seed*1.57);
      grid.set(i*20+j, new THREE.Vector3(x*width, .054*Math.cos(seed), z*depth));
    }
  }
  for (let i = -5; i <= 5; i++) {
    for (let j = -4; j <= 4; j++) {
      const a = grid.get(i*20+j);
      const adjacent = [grid.get((i+1)*20+j), grid.get(i*20+j+1), grid.get((i+(Math.abs(j)%2?1:-1))*20+j+1)];
      adjacent.forEach((b, n) => {
        const skew = Math.sin(i * 4.8 + j * 8.31 + n * 2.47);
        if (!b || skew < -.59) return;
        const mid = a.clone().lerp(b,.5);
        mid.x += .18 * skew;
        mid.z += .21 * Math.sin(skew*4.3);
        mid.y += .08 * skew;
        const ra = plateReach(a.x/width,a.z/depth), rb = plateReach(b.x/width,b.z/depth);
        links.push({curve: ra <= rb ? path(a,mid,b) : path(b,mid,a),
          near:Math.min(ra,rb), far:Math.max(ra,rb), radius:.038+.025*Math.abs(skew)});
      });
    }
  }
  return {links,nodes:[...grid.values()]};
}

export function createPhragmoplast(width, depth) {
  const group = new THREE.Group();
  const tracks = createTracks(width, depth), {links,nodes} = createNetwork(width, depth);
  const guideMaterial = neon(0xffffff,{body:.84,glow:.89,strength:.84});
  const networkMaterial = neon(0xffffff,{body:.86,glow:.51,strength:.76});
  guideMaterial.vertexColors = networkMaterial.vertexColors = true;
  guideMaterial.side = networkMaterial.side = THREE.DoubleSide;
  const guides = tubeBatch(tracks.length + tracks.filter(t=>t.companion).length, 10, guideMaterial, 'phragmoplast');
  const network = tubeBatch(links.length, 9, networkMaterial, 'cellPlate', .80);
  const junctions = infoTag(new THREE.InstancedMesh(new THREE.SphereGeometry(1,9,7),
    neon(0xf6a95c,{body:.76,glow:.45,strength:.77}),nodes.length),'cellPlate');
  const cargoCount = tracks.filter(t => t.cargo).length;
  const shells = infoTag(new THREE.InstancedMesh(new THREE.SphereGeometry(1,16,12),
    neon(0xfac786,{glass:true,body:.36,glow:.66,strength:.68}),cargoCount),'plateVesicles');
  const cores = new THREE.InstancedMesh(new THREE.SphereGeometry(.69,12,8),
    neon(0xf4a55b,{body:.85,glow:.39,strength:.68}),cargoCount);
  junctions.boundingSphere = shells.boundingSphere = cores.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6.4);
  shells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  junctions.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(guides.mesh, network.mesh, junctions, cores, shells);

  const moss = new THREE.Color(0x57a252), green = new THREE.Color(0xb5f66d);
  const mint = new THREE.Color(0x67b86f), lime = new THREE.Color(0xc4f68a);
  const amber = new THREE.Color(0xce752c), honey = new THREE.Color(0xffc477);
  const p = new THREE.Vector3(), tangent = new THREE.Vector3(), stretch = new THREE.Vector3();
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), up = new THREE.Vector3(0,1,0);
  const anchor = new THREE.Vector3(), focus = new THREE.Vector3();
  let best = -Infinity;
  return {
    group, guides:guides.mesh, anchor, get hasAnchor(){return best > -Infinity;},
    set(k) {
      const front = .038 + .1*smoothstep(k,0,.20) + .99*smoothstep(k,.19,.97);
      const dissipation = 1 - smoothstep(k,.88,.99);
      const fused = smoothstep(k,.20,.37);
      let delivered = 0, seams = 0;
      guides.begin(); network.begin();
      best = -Infinity;
      for (const {curve,companion,radius,onset,thickness,side,cargo,seed} of tracks) {
        const distance = front - radius;
        const grow = smoothstep(distance,-.17+onset,.018+onset);
        const retract = smoothstep(distance,.14+onset,.35+onset);
        const tip = grow * (1 - retract);
        const width = thickness * (.43+.57*grow) * (1-retract) * dissipation;
        guides.add(curve,.11*retract,tip,width,side === 1 ? moss : mint,side === 1 ? green : lime);
        if (companion) guides.add(companion,.028+.12*retract,tip*.94,width*.61,moss,green);
        if (side === 1 && tip > .50 && width > .016) {
          curve.getPoint(tip*.63,p);
          const score = p.x + .8*p.z;
          if (score > best) { best = score; focus.copy(p); }
        }
        if (!cargo || tip < .72 || width < .012) continue;
        const travel = (k * (4.8+.40*Math.sin(seed)) + .57 + Math.sin(seed*1.4)*.58 + 1) % 1;
        const arrival = smoothstep(travel,.79,1);
        const density = smoothstep(travel,0,.18) * (1-smoothstep(travel,.93,1));
        const size = (.071+.047*Math.cos(seed)**2) * density * (1-.46*arrival) * dissipation
          * smoothstep(k,.045,.16) * smoothstep(tip,.71,.85);
        if (size < .008) continue;
        const u = lerp(.07,tip,travel);
        curve.getPoint(u,p);
        p.y = lerp(p.y,side*.041,arrival);
        p.z += .049*(1-arrival);
        curve.getTangent(u,tangent);
        rotation.setFromUnitVectors(up,tangent);
        stretch.set(size,size*lerp(1.18,.75,arrival),size);
        matrix.compose(p,rotation,stretch);
        shells.setMatrixAt(delivered,matrix);
        cores.setMatrixAt(delivered++,matrix);
      }
      for (const {curve,near,far,radius} of links) {
        const reach = front + .05;
        const join = smoothstep(reach,near-.08,far+.07);
        const flatten = smoothstep(front-near,.23,.44);
        network.add(curve,0,join,radius * fused * (1-flatten) * dissipation,amber,honey);
      }
      for (const node of nodes) {
        const reach = front - plateReach(node.x/width,node.z/depth);
        const size = .061 * smoothstep(reach,-.034,.065) * (1-smoothstep(reach,.22,.37)) * fused * dissipation;
        if (size < .011) continue;
        junctions.setMatrixAt(seams++, matrix.makeScale(size,size*.8,size).setPosition(node));
      }
      if (best > -Infinity) anchor.lerp(focus,k===0 ? 1 : .16);
      guides.end(); network.end();
      junctions.count = seams;
      junctions.visible = seams > 0;
      junctions.instanceMatrix.needsUpdate = true;
      shells.count = cores.count = delivered;
      shells.visible = cores.visible = delivered > 0;
      shells.instanceMatrix.needsUpdate = cores.instanceMatrix.needsUpdate = true;
      return front;
    },
  };
}
