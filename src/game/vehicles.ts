import * as THREE from 'three';
import { VehicleId } from './types';

export interface VehicleRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheels: THREE.Group[];
  allWheelSpinners: THREE.Object3D[];
  airbrakeLeft?: THREE.Mesh;
  airbrakeRight?: THREE.Mesh;
  boostFlames: THREE.Mesh[];
  brakeLights: THREE.MeshStandardMaterial[];
  contactShadow: THREE.Mesh;
  updateVisuals: (params: {
    dt: number;
    speed: number;
    steerAngle: number;
    driftAngle: number;
    isDrifting: boolean;
    isBraking: boolean;
    isBoosting: boolean;
    driftTier: number;
    elapsed: number;
    heightAboveRoad: number;
  }) => void;
  dispose: () => void;
}

const FLAME_TIER_COLORS = [0xf59e0b, 0xf97316, 0x22d3ee, 0x38bdf8];

function makeMaterial(
  isGhost: boolean,
  params: THREE.MeshStandardMaterialParameters | THREE.MeshPhysicalMaterialParameters,
  physical = false
): THREE.MeshStandardMaterial {
  if (isGhost) {
    return new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
  }
  if (physical) {
    return new THREE.MeshPhysicalMaterial(params as THREE.MeshPhysicalMaterialParameters);
  }
  return new THREE.MeshStandardMaterial(params);
}

/**
 * Builds the 10-part composite Alpine Drift GT (PolyTrack-inspired low-poly rally/GT coupe).
 * Local coordinate convention: Forward = -Z, Right = +X, Up = +Y, bottom-center grounded at Y = 0.
 */
function buildDriftCarRig(
  contactShadowMap: THREE.CanvasTexture,
  isGhost: boolean
): VehicleRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Materials with calibrated roughness/metalness contrast (>= 0.25 diff across adjacent parts)
  const paintMat = trackMat(
    makeMaterial(
      isGhost,
      {
        color: 0xf59e0b, // Alpine racing amber
        metalness: 0.38,
        roughness: 0.24,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
      },
      !isGhost
    )
  );
  const trimCarbonMat = trackMat(
    makeMaterial(isGhost, {
      color: 0x1e2530,
      metalness: 0.15,
      roughness: 0.72,
    })
  );
  const stripeMat = trackMat(
    makeMaterial(isGhost, {
      color: 0xf8fafc,
      metalness: 0.1,
      roughness: 0.32,
    })
  );
  const glassMat = trackMat(
    makeMaterial(isGhost, {
      color: 0x0f1c2e,
      metalness: 0.85,
      roughness: 0.12,
    })
  );
  const tireMat = trackMat(
    makeMaterial(isGhost, {
      color: 0x181b20,
      metalness: 0.05,
      roughness: 0.88,
    })
  );
  const rimMat = trackMat(
    makeMaterial(isGhost, {
      color: 0xdbe2ea,
      metalness: 0.88,
      roughness: 0.2,
    })
  );
  const headlightMat = trackMat(
    makeMaterial(isGhost, {
      color: 0xfef9c3,
      emissive: 0xfef08a,
      emissiveIntensity: isGhost ? 0.5 : 1.5,
      roughness: 0.2,
    })
  );
  const brakeLightMat = trackMat(
    makeMaterial(isGhost, {
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: isGhost ? 0.4 : 0.75,
      roughness: 0.2,
    })
  );
  const exhaustMat = trackMat(
    makeMaterial(isGhost, {
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.25,
    })
  );

  // 1. Primary Silhouette: Sculpted Beveled Lower Wedge Chassis (ExtrudeGeometry along X, centered)
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-2.1, 0.36); // front nose bottom (-Z mapped after rotation)
  hullShape.lineTo(2.05, 0.38); // rear bottom
  hullShape.lineTo(2.15, 0.94); // rear deck
  hullShape.lineTo(1.2, 1.02); // behind cabin
  hullShape.lineTo(-0.85, 0.95); // hood base
  hullShape.lineTo(-2.02, 0.66); // hood front slope
  hullShape.lineTo(-2.18, 0.48); // front bumper nose
  hullShape.closePath();

  const hullGeo = trackGeo(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.1,
      bevelSegments: 2,
    })
  );
  // Rotate so shape X maps to world Z (nose at -Z) and extrusion depth centers on X
  hullGeo.translate(0, 0, -0.86);
  hullGeo.rotateY(-Math.PI / 2);
  hullGeo.computeVertexNormals();

  const hullMesh = new THREE.Mesh(hullGeo, paintMat);
  hullMesh.castShadow = !isGhost;
  hullMesh.receiveShadow = !isGhost;
  bodyGroup.add(hullMesh);

  // 2. Secondary Silhouette: Tinted Fastback Cockpit Greenhouse Canopy
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-0.95, 0.94);
  cabinShape.lineTo(1.18, 0.98);
  cabinShape.lineTo(0.66, 1.46);
  cabinShape.lineTo(-0.36, 1.46);
  cabinShape.closePath();

  const cabinGeo = trackGeo(
    new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.24,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.08,
      bevelSegments: 2,
    })
  );
  cabinGeo.translate(0, 0, -0.62);
  cabinGeo.rotateY(-Math.PI / 2);
  cabinGeo.computeVertexNormals();
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.castShadow = !isGhost;
  bodyGroup.add(cabinMesh);

  // 3. Racing Center Roof/Hood Stripe Accent
  const stripeGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.05, 1.32));
  const hoodStripe = new THREE.Mesh(stripeGeo, stripeMat);
  hoodStripe.position.set(0, 0.89, -1.42);
  hoodStripe.rotation.x = 0.22;
  bodyGroup.add(hoodStripe);

  const roofCapGeo = trackGeo(new THREE.BoxGeometry(1.12, 0.07, 1.02));
  const roofCap = new THREE.Mesh(roofCapGeo, paintMat);
  roofCap.position.set(0, 1.52, 0.14);
  bodyGroup.add(roofCap);

  // 4. Front Carbon Aero Splitter & Side Skirts
  const splitterGeo = trackGeo(new THREE.BoxGeometry(2.04, 0.12, 0.56));
  const splitter = new THREE.Mesh(splitterGeo, trimCarbonMat);
  splitter.position.set(0, 0.31, -2.06);
  splitter.castShadow = !isGhost;
  bodyGroup.add(splitter);

  const skirtGeo = trackGeo(new THREE.BoxGeometry(2.04, 0.2, 2.3));
  const skirt = new THREE.Mesh(skirtGeo, trimCarbonMat);
  skirt.position.set(0, 0.34, 0.02);
  bodyGroup.add(skirt);

  // 5. Rear Diffuser + Twin Metallic Exhaust Tips
  const diffuserGeo = trackGeo(new THREE.BoxGeometry(1.88, 0.24, 0.36));
  const diffuser = new THREE.Mesh(diffuserGeo, trimCarbonMat);
  diffuser.position.set(0, 0.36, 2.08);
  bodyGroup.add(diffuser);

  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.095, 0.11, 0.34, 10));
  exhaustGeo.rotateX(Math.PI / 2);
  const boostFlames: THREE.Mesh[] = [];
  const flameGeo = trackGeo(new THREE.ConeGeometry(0.16, 0.95, 8));
  flameGeo.rotateX(Math.PI / 2); // point backward (+Z)
  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: isGhost ? 0.2 : 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  for (const side of [-0.46, 0.46]) {
    const pipe = new THREE.Mesh(exhaustGeo, exhaustMat);
    pipe.position.set(side, 0.36, 2.24);
    bodyGroup.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(side, 0.36, 2.8);
    flame.visible = false;
    bodyGroup.add(flame);
    boostFlames.push(flame);
  }

  // 6. GT Rear Wing Spoiler (Twin struts + airfoil blade + endplates)
  const strutGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.44, 0.28));
  for (const side of [-0.62, 0.62]) {
    const strut = new THREE.Mesh(strutGeo, trimCarbonMat);
    strut.position.set(side, 1.18, 1.88);
    strut.rotation.x = -0.18;
    strut.castShadow = !isGhost;
    bodyGroup.add(strut);
  }
  const wingBladeGeo = trackGeo(new THREE.BoxGeometry(2.08, 0.08, 0.42));
  const wingBlade = new THREE.Mesh(wingBladeGeo, trimCarbonMat);
  wingBlade.position.set(0, 1.4, 1.96);
  wingBlade.rotation.x = 0.12;
  wingBlade.castShadow = !isGhost;
  bodyGroup.add(wingBlade);

  const endplateGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.26, 0.52));
  for (const side of [-1.04, 1.04]) {
    const ep = new THREE.Mesh(endplateGeo, paintMat);
    ep.position.set(side, 1.39, 1.95);
    bodyGroup.add(ep);
  }

  // 7. Emissive Headlights & Rear Taillight Bar
  const headGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.14, 0.12));
  for (const side of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(headGeo, headlightMat);
    hl.position.set(side, 0.62, -2.14);
    bodyGroup.add(hl);
  }
  const tailGeo = trackGeo(new THREE.BoxGeometry(1.66, 0.14, 0.1));
  const tailBar = new THREE.Mesh(tailGeo, brakeLightMat);
  tailBar.position.set(0, 0.84, 2.2);
  bodyGroup.add(tailBar);

  // 8. 4 Articulated Low-Poly Racing Wheels (tire + deep dish rim + hub cap)
  const wheelRadius = 0.42;
  const tireGeo = trackGeo(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.34, 14));
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = trackGeo(new THREE.CylinderGeometry(wheelRadius * 0.64, wheelRadius * 0.64, 0.36, 8));
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.11, wheelRadius * 1.15));

  const wheelPositions: Array<{ x: number; y: number; z: number; front: boolean }> = [
    { x: -1.04, y: wheelRadius, z: -1.32, front: true },
    { x: 1.04, y: wheelRadius, z: -1.32, front: true },
    { x: -1.06, y: wheelRadius, z: 1.28, front: false },
    { x: 1.06, y: wheelRadius, z: 1.28, front: false },
  ];

  const frontWheels: THREE.Group[] = [];
  const allWheelSpinners: THREE.Object3D[] = [];

  for (const wp of wheelPositions) {
    const steerGroup = new THREE.Group();
    steerGroup.position.set(wp.x, wp.y, wp.z);

    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = !isGhost;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    const spoke = new THREE.Mesh(hubGeo, trimCarbonMat);
    spinGroup.add(tire, rim, spoke);
    steerGroup.add(spinGroup);

    root.add(steerGroup);
    if (wp.front) frontWheels.push(steerGroup);
    allWheelSpinners.push(spinGroup);
  }

  // 9. Grounded Soft Radial Contact Shadow Plane
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(3.2, 5.4));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      opacity: isGhost ? 0.16 : 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.04;
  root.add(contactShadow);

  return {
    root,
    bodyGroup,
    frontWheels,
    allWheelSpinners,
    boostFlames,
    brakeLights: [brakeLightMat],
    contactShadow,
    updateVisuals: ({
      dt,
      speed,
      steerAngle,
      driftAngle,
      isDrifting,
      isBraking,
      isBoosting,
      driftTier,
      elapsed,
      heightAboveRoad,
    }) => {
      // Steer front wheels + spin all 4 wheels proportional to ground speed
      const wheelSteer = THREE.MathUtils.clamp(steerAngle * 0.55 - driftAngle * 0.35, -0.55, 0.55);
      for (const fw of frontWheels) {
        fw.rotation.y = wheelSteer;
      }
      const spinDelta = (speed / wheelRadius) * dt;
      for (const sp of allWheelSpinners) {
        sp.rotation.x -= spinDelta;
      }

      // Subtle body suspension pitch & roll
      const targetBodyRoll = THREE.MathUtils.clamp(-steerAngle * 0.14 - driftAngle * 0.16, -0.22, 0.22);
      const targetBodyPitch = isBraking ? 0.055 : isBoosting ? -0.055 : -Math.min(speed / 90, 0.025);
      const damp = 1 - Math.exp(-12 * dt);
      bodyGroup.rotation.z += (targetBodyRoll - bodyGroup.rotation.z) * damp;
      bodyGroup.rotation.x += (targetBodyPitch - bodyGroup.rotation.x) * damp;
      bodyGroup.position.y = Math.sin(elapsed * 22) * Math.min(speed / 120, 1) * 0.012;

      // Brake & boost taillight intensity
      if (!isGhost) {
        brakeLightMat.emissiveIntensity = isBraking ? 2.6 : isBoosting ? 2.2 : 0.75;
      }

      // Boost / drift flames
      const showFlame = isBoosting || (isDrifting && driftTier > 0);
      const flameColor = FLAME_TIER_COLORS[Math.min(3, isBoosting ? 3 : driftTier)];
      flameMat.color.setHex(flameColor);
      for (const fl of boostFlames) {
        fl.visible = showFlame;
        if (showFlame) {
          const pulse = 0.82 + Math.sin(elapsed * 55) * 0.22;
          const lengthScale = isBoosting ? 1.75 : 0.65 + driftTier * 0.28;
          fl.scale.set(1, 1, lengthScale * pulse);
        }
      }

      // Contact shadow scales and fades smoothly when airborne
      const airFactor = THREE.MathUtils.clamp(heightAboveRoad / 6, 0, 1);
      contactShadow.position.y = Math.max(0.03, -heightAboveRoad + 0.04);
      contactShadow.scale.setScalar(1 + airFactor * 0.35);
      shadowMat.opacity = (isGhost ? 0.16 : 0.52) * (1 - airFactor * 0.7);
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

/**
 * Builds the 10-part composite Valkyrie AG-01 (HexGL-inspired anti-gravity twin-prong hovercraft).
 * Forward = -Z, Right = +X, Up = +Y.
 */
function buildHovercraftRig(
  contactShadowMap: THREE.CanvasTexture,
  isGhost: boolean
): VehicleRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const hullWhiteMat = trackMat(
    makeMaterial(
      isGhost,
      {
        color: 0xeef3f8,
        metalness: 0.3,
        roughness: 0.22,
        clearcoat: 0.9,
        clearcoatRoughness: 0.12,
      },
      !isGhost
    )
  );
  const accentCyanMat = trackMat(
    makeMaterial(isGhost, {
      color: 0x06b6d4,
      metalness: 0.45,
      roughness: 0.26,
    })
  );
  const slateFrameMat = trackMat(
    makeMaterial(isGhost, {
      color: 0x1e293b,
      metalness: 0.55,
      roughness: 0.62,
    })
  );
  const visorMat = trackMat(
    makeMaterial(isGhost, {
      color: 0x0c1829,
      metalness: 0.92,
      roughness: 0.08,
    })
  );
  const thrusterGlowMat = trackMat(
    makeMaterial(isGhost, {
      color: 0x38bdf8,
      emissive: 0x06b6d4,
      emissiveIntensity: isGhost ? 0.7 : 2.1,
      roughness: 0.15,
    })
  );

  // 1. Primary Silhouette: Central Sculpted Delta Fuselage
  const coreShape = new THREE.Shape();
  coreShape.moveTo(0, 2.55); // sharp nose
  coreShape.lineTo(0.86, 0.45);
  coreShape.lineTo(1.22, -1.65);
  coreShape.lineTo(0.62, -2.25);
  coreShape.lineTo(-0.62, -2.25);
  coreShape.lineTo(-1.22, -1.65);
  coreShape.lineTo(-0.86, 0.45);
  coreShape.closePath();

  const coreGeo = trackGeo(
    new THREE.ExtrudeGeometry(coreShape, {
      depth: 0.46,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.09,
      bevelSegments: 2,
    })
  );
  coreGeo.rotateX(-Math.PI / 2); // shape +Y becomes -Z (nose forward)
  coreGeo.translate(0, 0.72, 0);
  coreGeo.computeVertexNormals();
  const coreMesh = new THREE.Mesh(coreGeo, hullWhiteMat);
  coreMesh.castShadow = !isGhost;
  coreMesh.receiveShadow = !isGhost;
  bodyGroup.add(coreMesh);

  // 2. Twin Cantilevered Forward Prong Blades (signature AG racer silhouette)
  const prongShape = new THREE.Shape();
  prongShape.moveTo(0, 2.95);
  prongShape.lineTo(0.32, 1.35);
  prongShape.lineTo(0.38, -0.55);
  prongShape.lineTo(-0.18, -0.55);
  prongShape.lineTo(-0.22, 1.55);
  prongShape.closePath();

  const prongGeo = trackGeo(
    new THREE.ExtrudeGeometry(prongShape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 1,
    })
  );
  prongGeo.rotateX(-Math.PI / 2);
  prongGeo.computeVertexNormals();

  for (const side of [-1, 1]) {
    const prong = new THREE.Mesh(prongGeo, side === -1 ? accentCyanMat : accentCyanMat);
    prong.position.set(side * 0.76, 0.66, -0.15);
    prong.scale.x = side;
    prong.castShadow = !isGhost;
    bodyGroup.add(prong);
  }

  // 3. Recessed Metallic Cockpit Visor Canopy
  const canopyGeo = trackGeo(new THREE.ConeGeometry(0.56, 1.85, 6));
  canopyGeo.rotateX(-Math.PI / 2);
  canopyGeo.scale(1.0, 0.62, 1.0);
  const canopy = new THREE.Mesh(canopyGeo, visorMat);
  canopy.position.set(0, 1.24, -0.35);
  canopy.castShadow = !isGhost;
  bodyGroup.add(canopy);

  // 4. Dorsal Stabilizer Intake Fin
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.1, 0);
  dorsalShape.lineTo(1.45, 0);
  dorsalShape.lineTo(1.75, 0.62);
  dorsalShape.lineTo(1.2, 0.62);
  dorsalShape.closePath();
  const dorsalGeo = trackGeo(
    new THREE.ExtrudeGeometry(dorsalShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 1,
    })
  );
  dorsalGeo.translate(0, 0, -0.06);
  dorsalGeo.rotateY(-Math.PI / 2);
  const dorsal = new THREE.Mesh(dorsalGeo, slateFrameMat);
  dorsal.position.set(0, 1.18, 0.45);
  dorsal.castShadow = !isGhost;
  bodyGroup.add(dorsal);

  // 5. Swept Outer Stabilizer Wings + Animated Side Airbrake Flaps
  const wingGeo = trackGeo(new THREE.BoxGeometry(0.95, 0.12, 1.42));
  const flapGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.44, 0.96));

  let airbrakeLeft: THREE.Mesh | undefined;
  let airbrakeRight: THREE.Mesh | undefined;

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, slateFrameMat);
    wing.position.set(side * 1.38, 0.78, 1.05);
    wing.rotation.z = side * -0.18;
    wing.rotation.y = side * 0.22;
    wing.castShadow = !isGhost;
    bodyGroup.add(wing);

    const flap = new THREE.Mesh(flapGeo, accentCyanMat);
    flap.position.set(side * 1.56, 0.92, 1.52);
    flap.castShadow = !isGhost;
    bodyGroup.add(flap);
    if (side === -1) airbrakeLeft = flap;
    else airbrakeRight = flap;
  }

  // 6. Rear Vectoring Plasma Thruster Nozzle & Glowing Core
  const nozzleGeo = trackGeo(new THREE.CylinderGeometry(0.46, 0.56, 0.55, 10));
  nozzleGeo.rotateX(Math.PI / 2);
  const nozzle = new THREE.Mesh(nozzleGeo, slateFrameMat);
  nozzle.position.set(0, 0.94, 2.22);
  bodyGroup.add(nozzle);

  const coreGlowGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.18, 10));
  coreGlowGeo.rotateX(Math.PI / 2);
  const coreGlow = new THREE.Mesh(coreGlowGeo, thrusterGlowMat);
  coreGlow.position.set(0, 0.94, 2.48);
  bodyGroup.add(coreGlow);

  // 7. Animated Plasma Jet Plume
  const plumeGeo = trackGeo(new THREE.ConeGeometry(0.36, 2.2, 10));
  plumeGeo.rotateX(Math.PI / 2);
  const plumeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: isGhost ? 0.22 : 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const plume = new THREE.Mesh(plumeGeo, plumeMat);
  plume.position.set(0, 0.94, 3.55);
  bodyGroup.add(plume);

  // 8. Under-hull Repulsor Glow Strip
  const repulsorGeo = trackGeo(new THREE.BoxGeometry(1.1, 0.08, 2.6));
  const repulsor = new THREE.Mesh(repulsorGeo, thrusterGlowMat);
  repulsor.position.set(0, 0.56, 0.1);
  bodyGroup.add(repulsor);

  // 9. Soft Hovering Contact Shadow
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(3.8, 6.2));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      opacity: isGhost ? 0.14 : 0.44,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.04;
  root.add(contactShadow);

  return {
    root,
    bodyGroup,
    frontWheels: [],
    allWheelSpinners: [],
    airbrakeLeft,
    airbrakeRight,
    boostFlames: [plume],
    brakeLights: [thrusterGlowMat],
    contactShadow,
    updateVisuals: ({
      dt,
      speed,
      steerAngle,
      driftAngle,
      isDrifting,
      isBraking,
      isBoosting,
      driftTier,
      elapsed,
      heightAboveRoad,
    }) => {
      // Smooth hovering levitation bob + deep aerodynamic banking
      const hoverBob = Math.sin(elapsed * 4.2) * 0.11 + 0.14;
      const targetRoll = THREE.MathUtils.clamp(-steerAngle * 0.34 - driftAngle * 0.38, -0.52, 0.52);
      const targetPitch = isBraking ? 0.08 : isBoosting ? -0.075 : -Math.min(speed / 120, 0.04);
      const damp = 1 - Math.exp(-10 * dt);

      bodyGroup.position.y += (hoverBob - bodyGroup.position.y) * damp;
      bodyGroup.rotation.z += (targetRoll - bodyGroup.rotation.z) * damp;
      bodyGroup.rotation.x += (targetPitch - bodyGroup.rotation.x) * damp;

      // Airbrake flaps flare dynamically when drifting or braking
      const leftFlare = (isDrifting && steerAngle > 0.05) || isBraking ? 0.52 : 0.04;
      const rightFlare = (isDrifting && steerAngle < -0.05) || isBraking ? -0.52 : -0.04;
      if (airbrakeLeft) {
        airbrakeLeft.rotation.y += (leftFlare - airbrakeLeft.rotation.y) * damp;
      }
      if (airbrakeRight) {
        airbrakeRight.rotation.y += (rightFlare - airbrakeRight.rotation.y) * damp;
      }

      // Dynamic thruster plume intensity
      const speedRatio = THREE.MathUtils.clamp(speed / 75, 0.15, 1.3);
      const pulse = 0.88 + Math.sin(elapsed * 48) * 0.16;
      const boostMul = isBoosting ? 1.85 : isDrifting && driftTier > 0 ? 1.2 + driftTier * 0.16 : 1.0;
      plume.scale.set(
        isBoosting ? 1.3 : 1.0,
        isBoosting ? 1.3 : 1.0,
        speedRatio * boostMul * pulse
      );
      plume.position.z = 2.48 + 0.95 * speedRatio * boostMul * pulse;
      plumeMat.color.setHex(isBoosting ? 0xf59e0b : isDrifting && driftTier >= 2 ? 0xf97316 : 0x22d3ee);

      if (!isGhost) {
        thrusterGlowMat.emissiveIntensity = isBoosting ? 3.2 : 1.5 + speedRatio * 0.8;
      }

      const totalAir = Math.max(0, heightAboveRoad + hoverBob);
      const airFactor = THREE.MathUtils.clamp(totalAir / 6.5, 0, 1);
      contactShadow.position.y = Math.max(0.03, -heightAboveRoad + 0.04);
      contactShadow.scale.setScalar(1 + airFactor * 0.35);
      shadowMat.opacity = (isGhost ? 0.14 : 0.44) * (1 - airFactor * 0.65);
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export function createVehicleRig(
  vehicleId: VehicleId,
  contactShadowMap: THREE.CanvasTexture,
  isGhost = false
): VehicleRig {
  return vehicleId === 'hovercraft'
    ? buildHovercraftRig(contactShadowMap, isGhost)
    : buildDriftCarRig(contactShadowMap, isGhost);
}
