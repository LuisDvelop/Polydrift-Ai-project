import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BuiltTrackData } from './tracks';
import { ProceduralTexturePack } from './textures';

export interface CheckpointVisual {
  gateIndex: number;
  statusLightMat: THREE.MeshStandardMaterial;
  setState: (state: 'idle' | 'next' | 'passed') => void;
}

export interface BuiltWorldScene {
  group: THREE.Group;
  checkpointVisuals: CheckpointVisual[];
  resetCheckpointStates: () => void;
  dispose: () => void;
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Builds a merged 3-tier low-poly alpine pine foliage geometry pivoted at bottom-center (Y = 0) */
function createPineCanopyGeometry(): THREE.BufferGeometry {
  const tier1 = new THREE.ConeGeometry(2.35, 3.8, 7);
  tier1.translate(0, 3.6, 0);

  const tier2 = new THREE.ConeGeometry(1.85, 3.4, 7);
  tier2.translate(0, 5.7, 0);

  const tier3 = new THREE.ConeGeometry(1.25, 2.8, 7);
  tier3.translate(0, 7.6, 0);

  const merged = mergeGeometries([tier1, tier2, tier3], false);
  tier1.dispose();
  tier2.dispose();
  tier3.dispose();
  if (!merged) {
    return new THREE.ConeGeometry(2.1, 6.8, 7);
  }
  merged.computeVertexNormals();
  return merged;
}

function createSkyDome(): { mesh: THREE.Mesh; dispose: () => void } {
  const geo = new THREE.SphereGeometry(950, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3a8fd6) },
      midColor: { value: new THREE.Color(0x88c9f2) },
      horizonColor: { value: new THREE.Color(0xdbeefe) },
      sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.56).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      varying vec3 vWorldPos;
      void main() {
        float h = clamp(vWorldPos.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
        col = mix(col, topColor, smoothstep(0.24, 0.85, h));
        float sunAmt = max(dot(normalize(vWorldPos), sunDir), 0.0);
        col += vec3(1.0, 0.95, 0.82) * pow(sunAmt, 42.0) * 0.45;
        col += vec3(1.0, 0.92, 0.78) * pow(sunAmt, 6.0) * 0.08;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function buildAlpineWorld(
  track: BuiltTrackData,
  textures: ProceduralTexturePack
): BuiltWorldScene {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const trackDisposable = <T extends { dispose: () => void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  // 1. Sunlit Alpine Sky Dome
  const sky = createSkyDome();
  group.add(sky.mesh);
  disposables.push(sky);

  // 2. Road Ribbon Geometry (Asphalt surface + Red/White Curbs + Low Concrete Side Parapets + Underside)
  const samples = track.samples;
  const n = samples.length;
  const hw = track.roadHalfWidth;
  const curbW = 1.15;
  const wallOuterW = 0.65;
  const wallH = 0.78;
  const deckThickness = 1.2;

  const asphaltPos: number[] = [];
  const asphaltUv: number[] = [];
  const asphaltIdx: number[] = [];

  const curbPos: number[] = [];
  const curbUv: number[] = [];
  const curbIdx: number[] = [];

  const wallPos: number[] = [];
  const wallIdx: number[] = [];

  const pL = new THREE.Vector3();
  const pR = new THREE.Vector3();
  const cLOut = new THREE.Vector3();
  const cROut = new THREE.Vector3();
  const wLTopIn = new THREE.Vector3();
  const wLTopOut = new THREE.Vector3();
  const wLBotOut = new THREE.Vector3();
  const wRTopIn = new THREE.Vector3();
  const wRTopOut = new THREE.Vector3();
  const wRBotOut = new THREE.Vector3();
  const deckL = new THREE.Vector3();
  const deckR = new THREE.Vector3();

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const dist = i === n ? track.totalLength : s.distance;
    const vAsphalt = dist / 14;
    const vCurb = dist / 4.2;

    // Asphalt left/right edges
    pL.copy(s.position).addScaledVector(s.right, -hw);
    pR.copy(s.position).addScaledVector(s.right, hw);
    asphaltPos.push(pL.x, pL.y, pL.z, pR.x, pR.y, pR.z);
    asphaltUv.push(0, vAsphalt, 1, vAsphalt);

    // Curbs on both left and right edges (slightly raised 0.04m with clean bevel slope)
    cLOut.copy(s.position).addScaledVector(s.right, -(hw + curbW)).addScaledVector(s.up, 0.09);
    cROut.copy(s.position).addScaledVector(s.right, hw + curbW).addScaledVector(s.up, 0.09);
    // 4 verts per ring: leftOuter, leftInner, rightInner, rightOuter
    curbPos.push(
      cLOut.x, cLOut.y, cLOut.z,
      pL.x, pL.y + 0.02, pL.z,
      pR.x, pR.y + 0.02, pR.z,
      cROut.x, cROut.y, cROut.z
    );
    curbUv.push(0, vCurb, 1, vCurb, 0, vCurb, 1, vCurb);

    // Side concrete parapets & underside road deck skirt (10 verts per ring)
    wLTopIn.copy(cLOut).addScaledVector(s.up, wallH);
    wLTopOut.copy(wLTopIn).addScaledVector(s.right, -wallOuterW);
    wLBotOut.copy(cLOut).addScaledVector(s.right, -wallOuterW).addScaledVector(s.up, -deckThickness);
    deckL.copy(pL).addScaledVector(s.up, -deckThickness);

    wRTopIn.copy(cROut).addScaledVector(s.up, wallH);
    wRTopOut.copy(wRTopIn).addScaledVector(s.right, wallOuterW);
    wRBotOut.copy(cROut).addScaledVector(s.right, wallOuterW).addScaledVector(s.up, -deckThickness);
    deckR.copy(pR).addScaledVector(s.up, -deckThickness);

    wallPos.push(
      cLOut.x, cLOut.y, cLOut.z,           // 0
      wLTopIn.x, wLTopIn.y, wLTopIn.z,     // 1
      wLTopOut.x, wLTopOut.y, wLTopOut.z,  // 2
      wLBotOut.x, wLBotOut.y, wLBotOut.z,  // 3
      deckL.x, deckL.y, deckL.z,           // 4
      deckR.x, deckR.y, deckR.z,           // 5
      wRBotOut.x, wRBotOut.y, wRBotOut.z,  // 6
      wRTopOut.x, wRTopOut.y, wRTopOut.z,  // 7
      wRTopIn.x, wRTopIn.y, wRTopIn.z,     // 8
      cROut.x, cROut.y, cROut.z            // 9
    );

    if (i < n) {
      const a0 = i * 2;
      const a1 = a0 + 1;
      const a2 = a0 + 2;
      const a3 = a0 + 3;
      asphaltIdx.push(a0, a2, a1, a1, a2, a3);

      const c0 = i * 4;
      const cNext = (i + 1) * 4;
      // Left curb quad
      curbIdx.push(c0, cNext, c0 + 1, c0 + 1, cNext, cNext + 1);
      // Right curb quad
      curbIdx.push(c0 + 2, cNext + 2, c0 + 3, c0 + 3, cNext + 2, cNext + 3);

      // Wall & underside skirt strip (9 quads around outer perimeter)
      const w0 = i * 10;
      const wNext = (i + 1) * 10;
      for (let k = 0; k < 9; k++) {
        const p0 = w0 + k;
        const p1 = w0 + k + 1;
        const p2 = wNext + k;
        const p3 = wNext + k + 1;
        wallIdx.push(p0, p1, p2, p1, p3, p2);
      }
    }
  }

  const asphaltGeo = trackDisposable(new THREE.BufferGeometry());
  asphaltGeo.setAttribute('position', new THREE.Float32BufferAttribute(asphaltPos, 3));
  asphaltGeo.setAttribute('uv', new THREE.Float32BufferAttribute(asphaltUv, 2));
  asphaltGeo.setIndex(asphaltIdx);
  asphaltGeo.computeVertexNormals();

  const asphaltMat = trackDisposable(
    new THREE.MeshStandardMaterial({
      map: textures.asphaltMap,
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.88,
      metalness: 0.05,
    })
  );
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  const curbGeo = trackDisposable(new THREE.BufferGeometry());
  curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3));
  curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(curbUv, 2));
  curbGeo.setIndex(curbIdx);
  curbGeo.computeVertexNormals();

  const curbMat = trackDisposable(
    new THREE.MeshStandardMaterial({
      map: textures.curbMap,
      roughness: 0.62,
      metalness: 0.06,
    })
  );
  const curbMesh = new THREE.Mesh(curbGeo, curbMat);
  curbMesh.receiveShadow = true;
  group.add(curbMesh);

  const wallGeo = trackDisposable(new THREE.BufferGeometry());
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wallGeo.setIndex(wallIdx);
  wallGeo.computeVertexNormals();

  const wallMat = trackDisposable(
    new THREE.MeshStandardMaterial({
      color: 0xd6d3cc,
      roughness: 0.78,
      metalness: 0.08,
      flatShading: true,
    })
  );
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 3. Stone Bridge Piers where Road Rises Over Alpine Gorges
  const pierMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i += 10) {
    const s = samples[i];
    const groundY = track.terrainHeightAt(s.position.x, s.position.z);
    const clearance = s.position.y - groundY;
    if (clearance > 2.4) {
      for (const side of [-hw * 0.68, hw * 0.68]) {
        const px = s.position.x + s.right.x * side;
        const pz = s.position.z + s.right.z * side;
        const gY = track.terrainHeightAt(px, pz) - 1.5;
        const topY = s.position.y - 1.0;
        const h = Math.max(1, topY - gY);
        dummy.position.set(px, gY + h * 0.5, pz);
        dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
        dummy.scale.set(1.6, h, 1.6);
        dummy.updateMatrix();
        pierMatrices.push(dummy.matrix.clone());
      }
    }
  }
  if (pierMatrices.length > 0) {
    const pierGeo = trackDisposable(new THREE.BoxGeometry(1, 1, 1));
    const pierMat = trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0x9c9589,
        roughness: 0.88,
        metalness: 0.05,
        flatShading: true,
      })
    );
    const pierInst = new THREE.InstancedMesh(pierGeo, pierMat, pierMatrices.length);
    pierMatrices.forEach((m, idx) => pierInst.setMatrixAt(idx, m));
    pierInst.instanceMatrix.needsUpdate = true;
    pierInst.castShadow = true;
    pierInst.receiveShadow = true;
    pierInst.computeBoundingSphere();
    group.add(pierInst);
  }

  // 4. Low-Poly Faceted Sunlit Alpine Canyon Terrain Mesh
  const terrainSize = 1120;
  const terrainSegs = 136;
  const rawTerrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs);
  rawTerrainGeo.rotateX(-Math.PI / 2);
  const posAttr = rawTerrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = track.terrainHeightAt(vx, vz);
    posAttr.setY(i, vy);
  }
  // Convert to non-indexed for crisp low-poly flat facets with per-face vertex colors
  const terrainGeo = trackDisposable(rawTerrainGeo.toNonIndexed());
  rawTerrainGeo.dispose();
  terrainGeo.computeVertexNormals();

  const tPos = terrainGeo.attributes.position;
  const tNorm = terrainGeo.attributes.normal;
  const colors = new Float32Array(tPos.count * 3);
  const cMeadowLow = new THREE.Color(0x4b8a4e);
  const cMeadowHigh = new THREE.Color(0x6da65d);
  const cLimestone = new THREE.Color(0x9b9284);
  const cGranite = new THREE.Color(0x7c766e);
  const cSnow = new THREE.Color(0xeaf2f8);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < tPos.count; i += 3) {
    // Average face height and slope for crisp uniform facet color
    const yAvg = (tPos.getY(i) + tPos.getY(i + 1) + tPos.getY(i + 2)) / 3;
    const ny = Math.abs(tNorm.getY(i));
    const xAvg = (tPos.getX(i) + tPos.getX(i + 1) + tPos.getX(i + 2)) / 3;
    const zAvg = (tPos.getZ(i) + tPos.getZ(i + 1) + tPos.getZ(i + 2)) / 3;
    const shadeJitter = ((Math.sin(xAvg * 0.13 + zAvg * 0.17) + 1) * 0.5) * 0.08 - 0.04;

    if (yAvg > 62 && ny > 0.52) {
      tmpColor.copy(cSnow);
    } else if (ny < 0.72) {
      // Steep canyon cliff face -> warm alpine limestone / granite strata
      const strata = THREE.MathUtils.clamp((yAvg + 10) / 55, 0, 1);
      tmpColor.copy(cGranite).lerp(cLimestone, strata);
    } else {
      // Sunlit alpine meadow
      const hBlend = THREE.MathUtils.clamp((yAvg + 8) / 38, 0, 1);
      tmpColor.copy(cMeadowLow).lerp(cMeadowHigh, hBlend);
    }
    tmpColor.offsetHSL(0, 0, shadeJitter);

    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = tmpColor.r;
      colors[(i + k) * 3 + 1] = tmpColor.g;
      colors[(i + k) * 3 + 2] = tmpColor.b;
    }
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const terrainMat = trackDisposable(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    })
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // 5. Instanced Alpine Pine Forest (650 composite multi-tier trees -> only 2 draw calls!)
  const rand = seededRandom(track.seed);
  const maxTrees = 650;
  const treeMatrices: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const pineBaseColors = [
    new THREE.Color(0x1f5138),
    new THREE.Color(0x286142),
    new THREE.Color(0x316e49),
    new THREE.Color(0x1a4430),
  ];

  const minClearance = hw + 8.5;
  let attempts = 0;
  while (treeMatrices.length < maxTrees && attempts < maxTrees * 8) {
    attempts++;
    const x = (rand() - 0.5) * 760;
    const z = (rand() - 0.5) * 760;
    const q = track.distanceToRoad2D(x, z);
    if (q.distSq < minClearance * minClearance) continue;

    const y = track.terrainHeightAt(x, z);
    // Keep pines off extreme snow peaks & check local slope so trees sit on grounded slopes
    if (y > 54) continue;
    const yDx = track.terrainHeightAt(x + 2.5, z);
    const yDz = track.terrainHeightAt(x, z + 2.5);
    if (Math.abs(yDx - y) > 2.2 || Math.abs(yDz - y) > 2.2) continue;

    const scaleXZ = 0.85 + rand() * 0.34; // ±15% natural size variation
    const scaleY = 0.82 + rand() * 0.42;
    dummy.position.set(x, y - 0.25, z); // grounded flush into terrain
    dummy.rotation.set((rand() - 0.5) * 0.06, rand() * Math.PI * 2, (rand() - 0.5) * 0.06);
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();
    treeMatrices.push(dummy.matrix.clone());

    const col = pineBaseColors[Math.floor(rand() * pineBaseColors.length)].clone();
    col.offsetHSL((rand() - 0.5) * 0.025, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.05);
    treeColors.push(col);
  }

  if (treeMatrices.length > 0) {
    const trunkGeo = trackDisposable(new THREE.CylinderGeometry(0.28, 0.5, 2.4, 6));
    trunkGeo.translate(0, 1.2, 0);
    const trunkMat = trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0x5d4030,
        roughness: 0.92,
        metalness: 0.02,
        flatShading: true,
      })
    );
    const canopyGeo = trackDisposable(createPineCanopyGeometry());
    const canopyMat = trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0xffffff, // tinted via setColorAt
        roughness: 0.82,
        metalness: 0.02,
        flatShading: true,
      })
    );

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeMatrices.length);
    const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeMatrices.length);

    for (let i = 0; i < treeMatrices.length; i++) {
      trunkInst.setMatrixAt(i, treeMatrices[i]);
      canopyInst.setMatrixAt(i, treeMatrices[i]);
      canopyInst.setColorAt(i, treeColors[i]);
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    canopyInst.instanceMatrix.needsUpdate = true;
    if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;

    trunkInst.castShadow = true;
    canopyInst.castShadow = true;
    canopyInst.receiveShadow = true;
    trunkInst.computeBoundingSphere();
    canopyInst.computeBoundingSphere();
    group.add(trunkInst, canopyInst);
  }

  // 6. Instanced Faceted Alpine Boulders (180 rocks -> 1 draw call)
  const rockMatrices: THREE.Matrix4[] = [];
  const rockColors: THREE.Color[] = [];
  const rockPalette = [0x8c857b, 0x9f9689, 0x76716a, 0xb0a79a];
  let rockAttempts = 0;
  while (rockMatrices.length < 180 && rockAttempts < 1200) {
    rockAttempts++;
    const x = (rand() - 0.5) * 700;
    const z = (rand() - 0.5) * 700;
    const q = track.distanceToRoad2D(x, z);
    if (q.distSq < (hw + 6.5) * (hw + 6.5)) continue;
    const y = track.terrainHeightAt(x, z);

    const sx = 1.2 + rand() * 3.8;
    const sy = 0.8 + rand() * 2.6;
    const sz = 1.2 + rand() * 3.6;
    dummy.position.set(x, y + sy * 0.25, z);
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rockMatrices.push(dummy.matrix.clone());

    const rc = new THREE.Color(rockPalette[Math.floor(rand() * rockPalette.length)]);
    rc.offsetHSL(0, 0, (rand() - 0.5) * 0.08);
    rockColors.push(rc);
  }

  if (rockMatrices.length > 0) {
    const rockGeo = trackDisposable(new THREE.DodecahedronGeometry(1, 0));
    const rockMat = trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.04,
        flatShading: true,
      })
    );
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockMatrices.length);
    for (let i = 0; i < rockMatrices.length; i++) {
      rockInst.setMatrixAt(i, rockMatrices[i]);
      rockInst.setColorAt(i, rockColors[i]);
    }
    rockInst.instanceMatrix.needsUpdate = true;
    if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    rockInst.computeBoundingSphere();
    group.add(rockInst);
  }

  // 7. Instanced Roadside Apex Chevron Delineator Posts along curves (1 draw call)
  const postMatrices: THREE.Matrix4[] = [];
  for (let i = 0; i < n; i += 6) {
    const s = samples[i];
    if (Math.abs(s.curvature) < 0.015) continue;
    // Place on the outside of the turn
    const outSide = s.curvature > 0 ? -1 : 1;
    const pos = s.position
      .clone()
      .addScaledVector(s.right, outSide * (hw + curbW + 0.32))
      .addScaledVector(s.up, wallH + 0.6);
    dummy.position.copy(pos);
    dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postMatrices.push(dummy.matrix.clone());
  }
  if (postMatrices.length > 0) {
    const postGeo = trackDisposable(new THREE.BoxGeometry(0.18, 1.15, 0.42));
    const postMat = trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0x78350f,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.15,
      })
    );
    const postInst = new THREE.InstancedMesh(postGeo, postMat, postMatrices.length);
    postMatrices.forEach((m, idx) => postInst.setMatrixAt(idx, m));
    postInst.instanceMatrix.needsUpdate = true;
    postInst.computeBoundingSphere();
    group.add(postInst);
  }

  // 8. Composite 8-Part Start/Finish Gantry & Numbered Checkpoint Arches
  const checkpointVisuals: CheckpointVisual[] = [];
  const pillarMat = trackDisposable(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.48,
      metalness: 0.65,
    })
  );
  const plinthMat = trackDisposable(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.8,
      metalness: 0.08,
    })
  );
  const startBannerMat = trackDisposable(
    new THREE.MeshStandardMaterial({
      map: textures.startBannerMap,
      roughness: 0.45,
      metalness: 0.1,
    })
  );
  const cpBannerMat = trackDisposable(
    new THREE.MeshStandardMaterial({
      map: textures.checkpointBannerMap,
      roughness: 0.45,
      metalness: 0.1,
    })
  );

  const archSpan = (hw + curbW + 0.4) * 2;
  const archHeight = 7.4;

  const plinthGeo = trackDisposable(new THREE.BoxGeometry(1.5, 1.2, 1.8));
  const pillarGeo = trackDisposable(new THREE.BoxGeometry(0.85, archHeight, 0.95));
  const braceGeo = trackDisposable(new THREE.BoxGeometry(0.45, 2.2, 0.45));
  const beamGeo = trackDisposable(new THREE.BoxGeometry(archSpan + 1.4, 1.35, 1.1));
  const bannerFaceGeo = trackDisposable(new THREE.PlaneGeometry(archSpan - 1.2, 1.15));
  const stripGeo = trackDisposable(new THREE.BoxGeometry(archSpan - 0.6, 0.24, 1.18));
  const sideBeaconGeo = trackDisposable(new THREE.BoxGeometry(0.24, 4.4, 1.04));

  // Road surface checkered Start Line decal at checkpoint 0
  const startLineGeo = trackDisposable(new THREE.PlaneGeometry(hw * 2, 2.4));
  startLineGeo.rotateX(-Math.PI / 2);

  for (const cp of track.checkpoints) {
    const isStart = cp.index === 0;
    const gateGroup = new THREE.Group();
    gateGroup.position.copy(cp.position);

    // Orient gate aligned with track tangent (local -Z points along tangent, local +X along right)
    const basis = new THREE.Matrix4().makeBasis(
      cp.right,
      cp.up,
      cp.tangent.clone().negate()
    );
    gateGroup.quaternion.setFromRotationMatrix(basis);

    const statusLightMat = trackDisposable(
      new THREE.MeshStandardMaterial({
        color: isStart ? 0xf8fafc : 0xf59e0b,
        emissive: isStart ? 0xf59e0b : 0xf59e0b,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.2,
      })
    );

    const halfSpan = archSpan * 0.5;
    for (const side of [-1, 1]) {
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.set(side * halfSpan, 0.6, 0);
      plinth.castShadow = true;
      gateGroup.add(plinth);

      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(side * halfSpan, archHeight * 0.5, 0);
      pillar.castShadow = true;
      gateGroup.add(pillar);

      const brace = new THREE.Mesh(braceGeo, pillarMat);
      brace.position.set(side * (halfSpan - 0.8), archHeight - 1.35, 0);
      brace.rotation.z = side * -0.78;
      gateGroup.add(brace);

      const beacon = new THREE.Mesh(sideBeaconGeo, statusLightMat);
      beacon.position.set(side * (halfSpan - 0.45), 3.4, 0);
      gateGroup.add(beacon);
    }

    const beam = new THREE.Mesh(beamGeo, pillarMat);
    beam.position.set(0, archHeight + 0.35, 0);
    beam.castShadow = true;
    gateGroup.add(beam);

    // Front & back banner planes
    const bMat = isStart ? startBannerMat : cpBannerMat;
    const frontBanner = new THREE.Mesh(bannerFaceGeo, bMat);
    frontBanner.position.set(0, archHeight + 0.35, 0.58);
    gateGroup.add(frontBanner);

    const backBanner = new THREE.Mesh(bannerFaceGeo, bMat);
    backBanner.position.set(0, archHeight + 0.35, -0.58);
    backBanner.rotation.y = Math.PI;
    gateGroup.add(backBanner);

    const strip = new THREE.Mesh(stripGeo, statusLightMat);
    strip.position.set(0, archHeight - 0.38, 0);
    gateGroup.add(strip);

    if (isStart) {
      const startLineMat = trackDisposable(
        new THREE.MeshBasicMaterial({
          map: textures.startBannerMap,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      );
      const startLine = new THREE.Mesh(startLineGeo, startLineMat);
      startLine.position.set(0, 0.05, 0);
      gateGroup.add(startLine);
    }

    group.add(gateGroup);

    const setState = (state: 'idle' | 'next' | 'passed') => {
      if (state === 'passed') {
        statusLightMat.color.setHex(0x10b981);
        statusLightMat.emissive.setHex(0x10b981);
        statusLightMat.emissiveIntensity = 1.8;
      } else if (state === 'next') {
        statusLightMat.color.setHex(0x22d3ee);
        statusLightMat.emissive.setHex(0x22d3ee);
        statusLightMat.emissiveIntensity = 1.65;
      } else {
        statusLightMat.color.setHex(isStart ? 0xf8fafc : 0xf59e0b);
        statusLightMat.emissive.setHex(0xf59e0b);
        statusLightMat.emissiveIntensity = 0.7;
      }
    };

    checkpointVisuals.push({
      gateIndex: cp.index,
      statusLightMat,
      setState,
    });
  }

  const resetCheckpointStates = () => {
    checkpointVisuals.forEach((cv) => {
      if (cv.gateIndex === 1) cv.setState('next');
      else cv.setState('idle');
    });
  };
  resetCheckpointStates();

  return {
    group,
    checkpointVisuals,
    resetCheckpointStates,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
