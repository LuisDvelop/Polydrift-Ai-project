import * as THREE from 'three';

export interface ProceduralTexturePack {
  asphaltMap: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  curbMap: THREE.CanvasTexture;
  startBannerMap: THREE.CanvasTexture;
  checkpointBannerMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTexturePack(maxAnisotropy: number): ProceduralTexturePack {
  const aniso = Math.min(maxAnisotropy, 16);

  // 1. Sunlit Alpine Asphalt Albedo (U = across road, V = along road)
  const [asphaltCanvas, aCtx] = makeCanvas(512, 512);
  aCtx.fillStyle = '#2d333d';
  aCtx.fillRect(0, 0, 512, 512);

  // Subtle aggregate stone grain
  for (let i = 0; i < 14000; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 24634.6345) % 1;
    const px = Math.abs(x) * 512;
    const py = Math.abs(y) * 512;
    const v = 38 + ((i * 19) % 28);
    aCtx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    aCtx.fillRect(px, py, 2, 2);
  }

  // Subtle darker tire-groove bands in left/right racing lines
  const grooveGrad = aCtx.createLinearGradient(0, 0, 512, 0);
  grooveGrad.addColorStop(0.0, 'rgba(15, 18, 24, 0.25)');
  grooveGrad.addColorStop(0.12, 'rgba(15, 18, 24, 0.0)');
  grooveGrad.addColorStop(0.28, 'rgba(15, 18, 24, 0.16)');
  grooveGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.03)');
  grooveGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.03)');
  grooveGrad.addColorStop(0.72, 'rgba(15, 18, 24, 0.16)');
  grooveGrad.addColorStop(0.88, 'rgba(15, 18, 24, 0.0)');
  grooveGrad.addColorStop(1.0, 'rgba(15, 18, 24, 0.25)');
  aCtx.fillStyle = grooveGrad;
  aCtx.fillRect(0, 0, 512, 512);

  // Crisp painted white shoulder lines
  aCtx.fillStyle = '#eef2f6';
  aCtx.fillRect(22, 0, 10, 512);
  aCtx.fillRect(480, 0, 10, 512);

  // Dashed amber-white alpine centerline
  aCtx.fillStyle = '#f8fafc';
  aCtx.fillRect(252, 48, 8, 176);
  aCtx.fillRect(252, 304, 8, 176);

  const asphaltMap = new THREE.CanvasTexture(asphaltCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.ClampToEdgeWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.anisotropy = aniso;

  // 2. Asphalt Roughness Data Map (linear NoColorSpace)
  const [roughCanvas, rCtx] = makeCanvas(256, 256);
  rCtx.fillStyle = '#c8c8c8'; // ~0.78 roughness
  rCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const px = Math.abs((Math.sin(i * 45.164) * 43758.5453) % 1) * 256;
    const py = Math.abs((Math.sin(i * 93.719) * 19283.4712) % 1) * 256;
    const v = 165 + ((i * 29) % 70);
    rCtx.fillStyle = `rgb(${v},${v},${v})`;
    rCtx.fillRect(px, py, 2, 2);
  }
  // Slightly smoother polished paint stripes
  rCtx.fillStyle = '#888888';
  rCtx.fillRect(11, 0, 5, 256);
  rCtx.fillRect(240, 0, 5, 256);

  const asphaltRoughness = new THREE.CanvasTexture(roughCanvas);
  asphaltRoughness.colorSpace = THREE.NoColorSpace;
  asphaltRoughness.wrapS = THREE.ClampToEdgeWrapping;
  asphaltRoughness.wrapT = THREE.RepeatWrapping;
  asphaltRoughness.anisotropy = aniso;

  // 3. Red & White Alpine Apex Curb Texture
  const [curbCanvas, cCtx] = makeCanvas(128, 256);
  cCtx.fillStyle = '#dc2626';
  cCtx.fillRect(0, 0, 128, 128);
  cCtx.fillStyle = '#f1f5f9';
  cCtx.fillRect(0, 128, 128, 128);
  // Subtle bevel seam shading
  cCtx.fillStyle = 'rgba(0,0,0,0.16)';
  cCtx.fillRect(0, 0, 12, 256);
  cCtx.fillRect(116, 0, 12, 256);
  cCtx.fillRect(0, 124, 128, 4);

  const curbMap = new THREE.CanvasTexture(curbCanvas);
  curbMap.colorSpace = THREE.SRGBColorSpace;
  curbMap.wrapS = THREE.RepeatWrapping;
  curbMap.wrapT = THREE.RepeatWrapping;
  curbMap.anisotropy = aniso;

  // 4. Start / Finish Checkered Banner
  const [startCanvas, sCtx] = makeCanvas(512, 128);
  const sq = 32;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 16; col++) {
      sCtx.fillStyle = (row + col) % 2 === 0 ? '#f8fafc' : '#0f172a';
      sCtx.fillRect(col * sq, row * sq, sq, sq);
    }
  }
  // Center banner band
  sCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  sCtx.fillRect(128, 26, 256, 76);
  sCtx.strokeStyle = '#f59e0b';
  sCtx.lineWidth = 4;
  sCtx.strokeRect(130, 28, 252, 72);
  sCtx.fillStyle = '#f8fafc';
  sCtx.font = '700 34px "Oxanium", sans-serif';
  sCtx.textAlign = 'center';
  sCtx.textBaseline = 'middle';
  sCtx.fillText('START / FINISH', 256, 65);

  const startBannerMap = new THREE.CanvasTexture(startCanvas);
  startBannerMap.colorSpace = THREE.SRGBColorSpace;
  startBannerMap.anisotropy = aniso;

  // 5. Checkpoint Chevron Banner
  const [cpCanvas, cpCtx] = makeCanvas(512, 128);
  cpCtx.fillStyle = '#0f172a';
  cpCtx.fillRect(0, 0, 512, 128);
  // Diagonal chevrons
  cpCtx.fillStyle = '#f59e0b';
  for (let x = -64; x < 576; x += 64) {
    cpCtx.beginPath();
    cpCtx.moveTo(x, 128);
    cpCtx.lineTo(x + 28, 128);
    cpCtx.lineTo(x + 68, 0);
    cpCtx.lineTo(x + 40, 0);
    cpCtx.closePath();
    cpCtx.fill();
  }
  cpCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  cpCtx.fillRect(140, 26, 232, 76);
  cpCtx.fillStyle = '#f8fafc';
  cpCtx.font = '700 32px "Oxanium", sans-serif';
  cpCtx.textAlign = 'center';
  cpCtx.textBaseline = 'middle';
  cpCtx.fillText('CHECKPOINT', 256, 65);

  const checkpointBannerMap = new THREE.CanvasTexture(cpCanvas);
  checkpointBannerMap.colorSpace = THREE.SRGBColorSpace;
  checkpointBannerMap.anisotropy = aniso;

  // 6. Soft Radial Contact Shadow Decal
  const [shCanvas, shCtx] = makeCanvas(256, 256);
  const grad = shCtx.createRadialGradient(128, 128, 18, 128, 128, 122);
  grad.addColorStop(0.0, 'rgba(6, 10, 18, 0.82)');
  grad.addColorStop(0.45, 'rgba(6, 10, 18, 0.45)');
  grad.addColorStop(0.8, 'rgba(6, 10, 18, 0.12)');
  grad.addColorStop(1.0, 'rgba(6, 10, 18, 0.0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 256, 256);

  const contactShadowMap = new THREE.CanvasTexture(shCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  return {
    asphaltMap,
    asphaltRoughness,
    curbMap,
    startBannerMap,
    checkpointBannerMap,
    contactShadowMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltRoughness.dispose();
      curbMap.dispose();
      startBannerMap.dispose();
      checkpointBannerMap.dispose();
      contactShadowMap.dispose();
    },
  };
}
