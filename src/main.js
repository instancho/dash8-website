import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

gsap.registerPlugin(ScrollTrigger);

// ── Performance monitor (remove later) ──────────────────────────────────────
const stats = new Stats();
stats.dom.style.cssText = 'position:fixed;top:0;right:0;left:auto;z-index:9999;';
document.body.appendChild(stats.dom);

// ── Lenis smooth scroll ────────────────────────────────────────────────────
const lenis = new Lenis();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// ── Three.js core ──────────────────────────────────────────────────────────
const threeCanvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.03);

// ── Starfield sky ───────────────────────────────────────────────────────────
const STAR_COUNT = 800;
const starGeo = new THREE.BufferGeometry();
const starPositions = new Float32Array(STAR_COUNT * 3);
const starColors = new Float32Array(STAR_COUNT * 3);
const starSizes = new Float32Array(STAR_COUNT);

for (let i = 0; i < STAR_COUNT; i++) {
  // Distribute on a large sphere
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = 80 + Math.random() * 10;
  starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi));  // only upper hemisphere
  starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

  // Slight color variation — white to light blue
  const warmth = 0.7 + Math.random() * 0.3;
  starColors[i * 3]     = warmth;
  starColors[i * 3 + 1] = warmth;
  starColors[i * 3 + 2] = 0.8 + Math.random() * 0.2;

  starSizes[i] = 0.1 + Math.random() * 0.25;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

const starMat = new THREE.PointsMaterial({
  size: 0.15,
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  fog: false,
  sizeAttenuation: true,
});
const stars = new THREE.Points(starGeo, starMat);
stars.name = 'stars';
scene.add(stars);

const camera = new THREE.PerspectiveCamera(
  42, window.innerWidth / window.innerHeight, 0.1, 150
);

const cameraRig = new THREE.Object3D();
scene.add(cameraRig);
cameraRig.add(camera);

const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

// ── Screen config ──────────────────────────────────────────────────────────
const RADIUS = 36;
const SCREEN_H = 16;
const ARC = 0.864;
const SEGS = 48;
const MAX_ZOOM = 30;

const SECTIONS = [
  { id: 'hero',     theta: Math.PI,       rotY: 0,               label: '://01', title: 'HOME' },
  { id: 'about',    theta: Math.PI * 0.5, rotY: -Math.PI * 0.5,  label: '://02', title: 'ABOUT' },
  { id: 'projects', theta: 0,             rotY: -Math.PI,        label: '://03', title: 'PROJECTS' },
  { id: 'contact',  theta: Math.PI * 1.5, rotY: -Math.PI * 1.5,  label: '://04', title: 'CONTACT' },
];

// ── Placeholder texture for non-hero screens ───────────────────────────────
function createScreenTexture(label, title) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 768;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, 1024, 768);
  ctx.fillStyle = 'rgba(5, 15, 40, 0.3)';
  ctx.fillRect(0, 0, 1024, 768);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#ff3d00';
  ctx.font = '20px monospace';
  ctx.fillText(label, 512, 340);

  ctx.fillStyle = '#ffffff';
  ctx.font = '72px monospace';
  ctx.fillText(title, 512, 410);

  ctx.fillStyle = '#888';
  ctx.font = '16px monospace';
  ctx.fillText('Content goes here', 512, 470);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Build screen meshes ────────────────────────────────────────────────────
const screenMeshes = [];
const screenGroups = [];
let heroTexture = null;

SECTIONS.forEach((sec) => {
  const geo = new THREE.CylinderGeometry(
    RADIUS, RADIUS, SCREEN_H, SEGS, 1, true,
    sec.theta - ARC / 2, ARC
  );

  const tex = createScreenTexture(sec.label, sec.title);
  // Flip horizontally for BackSide UV correction
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = -1;
  tex.offset.x = 1;

  const mat = new THREE.MeshPhysicalMaterial({
    map: tex,
    side: THREE.DoubleSide,
    fog: false,
    transparent: false,
    opacity: 1.0,
    transmission: 0.5,
    thickness: 4.0,
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.5,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 2.0,
    envMapIntensity: 0,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `screen_${sec.id}`;
  mesh.position.y = 3;
  screenMeshes.push(mesh);

  // ── Screen emboss (outer shell for visible thickness) ──
  const embossDepth = 0.4;
  const outerR = RADIUS + embossDepth;
  const embossGeo = new THREE.CylinderGeometry(
    outerR, outerR, SCREEN_H, SEGS, 1, true,
    sec.theta - ARC / 2, ARC
  );
  const embossMat = new THREE.MeshStandardMaterial({
    color: 0x0a0e1a,
    side: THREE.BackSide,
    fog: false,
    transparent: true,
    opacity: 0.4,
    roughness: 0.3,
    metalness: 0.6,
    envMapIntensity: 0.3,
    depthWrite: false,
  });
  const embossMesh = new THREE.Mesh(embossGeo, embossMat);
  embossMesh.name = `emboss_${sec.id}`;
  embossMesh.position.y = 3;

  // Group screen + emboss so they float together
  const group = new THREE.Group();
  group.name = `screenGroup_${sec.id}`;
  group.add(mesh);
  group.add(embossMesh);
  scene.add(group);
  screenGroups.push(group);


});


// ── Hero live texture — shows the actual canvas animation on the 3D screen ─
const heroCanvasEl = document.getElementById('hero-canvas');

function initHeroTexture() {
  if (!heroCanvasEl || heroCanvasEl.width === 0) {
    requestAnimationFrame(initHeroTexture);
    return;
  }
  heroTexture = new THREE.CanvasTexture(heroCanvasEl);
  heroTexture.colorSpace = THREE.SRGBColorSpace;
  // Flip for BackSide
  heroTexture.wrapS = THREE.RepeatWrapping;
  heroTexture.repeat.x = -1;
  heroTexture.offset.x = 1;

  // Swap hero to MeshBasicMaterial — unlit, shows exact canvas colors
  screenMeshes[0].material.dispose();
  const heroMat = new THREE.MeshBasicMaterial({
    map: heroTexture,
    side: THREE.DoubleSide,
    fog: false,
  });
  heroMat.toneMapped = false;
  screenMeshes[0].material = heroMat;
}
requestAnimationFrame(initHeroTexture);

// ── HDRI environment ───────────────────────────────────────────────────────
new EXRLoader().load(
  '/Assets/textures/NightEnvironmentHDRI007_2K_HDR.exr',
  (exrTexture) => {
    exrTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = exrTexture;
    scene.environmentIntensity = 1.35;
    scene.environmentRotation = new THREE.Euler(0, 0, 0);
    console.log('HDRI loaded');
  },
  undefined,
  (err) => { console.error('HDRI failed to load:', err); }
);

// ── Lighting ───────────────────────────────────────────────────────────────
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// Very low ambient — keeps edges dark
const ambientLight = new THREE.AmbientLight(0xffffff, 4.5);
scene.add(ambientLight);

// Central spotlight pointing down — illuminates only the screen area
const spotLight = new THREE.SpotLight(0xffffff, 240, 70, Math.PI / 2.5, 0.3, 0.8);
spotLight.position.set(0, 15, 0);
spotLight.target.position.set(0, -7.5, 0);
scene.add(spotLight);
scene.add(spotLight.target);

// Direct point light above floor centre for extra illumination
const floorLight = new THREE.PointLight(0xffffff, 75, 50, 0.8);
floorLight.position.set(0, -4, 0);
scene.add(floorLight);

// Point light that follows camera — illuminates the active screen area
const screenLight = new THREE.PointLight(0xccddff, 15, 35, 1.5);
screenLight.position.set(0, 4, -RADIUS * 0.5);
cameraRig.add(screenLight);

// Camera headlight — points where the camera looks
const camLight = new THREE.SpotLight(0xffffff, 120, 60, Math.PI / 4, 0.6, 1.2);
camLight.position.set(0, -1, 0);
camera.add(camLight);
camera.add(camLight.target);
camLight.target.position.set(0, -8, -2);


// ── Central platform ────────────────────────────────────────────────────────
const platformGroup = new THREE.Group();
platformGroup.position.y = -5.9;
scene.add(platformGroup);

// Main disc
const platformGeo = new THREE.CylinderGeometry(6, 6.5, 0.3, 64);
const platformMat = new THREE.MeshStandardMaterial({
  color: 0x111118,
  metalness: 0.8,
  roughness: 0.3,
  envMapIntensity: 0.5,
});
const platformMesh = new THREE.Mesh(platformGeo, platformMat);
platformMesh.name = 'platform_disc';
platformGroup.add(platformMesh);

// Emissive edge ring
const edgeRingGeo = new THREE.TorusGeometry(6.25, 0.06, 16, 128);
const edgeRingMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, fog: false });
const edgeRing = new THREE.Mesh(edgeRingGeo, edgeRingMat);
edgeRing.name = 'platform_edge_ring';
edgeRing.rotation.x = Math.PI / 2;
edgeRing.position.y = 0.16;
platformGroup.add(edgeRing);

// Inner concentric ring detail
const innerRingGeo = new THREE.TorusGeometry(3.5, 0.03, 16, 96);
const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x2244aa, transparent: true, opacity: 0.6, fog: false });
const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
innerRing.name = 'platform_inner_ring';
innerRing.rotation.x = Math.PI / 2;
innerRing.position.y = 0.17;
platformGroup.add(innerRing);

// ── Floor cables (lines from screens to center) ─────────────────────────────
const cableDots = [];
SECTIONS.forEach((sec) => {
  const screenX = RADIUS * 0.95 * Math.sin(sec.theta);
  const screenZ = RADIUS * 0.95 * Math.cos(sec.theta);
  const cablePoints = [];
  const segments = 20;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = screenX * (1 - t);
    const z = screenZ * (1 - t);
    const sag = Math.sin(t * Math.PI) * -0.3;
    cablePoints.push(new THREE.Vector3(x, sag, z));
  }
  const cableCurve = new THREE.CatmullRomCurve3(cablePoints);
  const cableGeo = new THREE.TubeGeometry(cableCurve, 32, 0.02, 8, false);
  const cableMat = new THREE.MeshBasicMaterial({
    color: 0x1a3366,
    transparent: true,
    opacity: 0.4,
  });
  const cable = new THREE.Mesh(cableGeo, cableMat);
  cable.name = `cable_${sec.id}`;
  cable.position.y = -5.8;
  scene.add(cable);

  // Emissive pulse dot that travels along each cable
  const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, fog: false });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.name = `cable_dot_${sec.id}`;
  dot.position.y = -5.8;
  scene.add(dot);
  dot.userData = { curve: cableCurve, phase: Math.random(), speed: 0.002 + Math.random() * 0.003 };
  cableDots.push(dot);
});


// ── Floating holographic UI fragments ───────────────────────────────────────
function createHoloTex() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(30, 60, 120, 0.15)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(68, 136, 255, 0.4)';
  ctx.lineWidth = 1;
  // Grid lines
  for (let i = 0; i < 128; i += 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  // Random data bars
  ctx.fillStyle = 'rgba(68, 136, 255, 0.3)';
  for (let i = 0; i < 5; i++) {
    const bw = 8 + Math.random() * 40;
    const bh = 4 + Math.random() * 16;
    ctx.fillRect(10 + Math.random() * 70, 20 + Math.random() * 80, bw, bh);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const HOLO_COUNT = 8;
const holoTex = createHoloTex();
const holoFragments = [];

for (let i = 0; i < HOLO_COUNT; i++) {
  const w = 0.6 + Math.random() * 1.2;
  const h = 0.4 + Math.random() * 0.8;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    map: holoTex,
    transparent: true,
    opacity: 0.15 + Math.random() * 0.15,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `holo_fragment_${i}`;
  const angle = Math.random() * Math.PI * 2;
  const dist = 10 + Math.random() * 14;
  const yPos = -4 + Math.random() * 10;
  mesh.position.set(Math.cos(angle) * dist, yPos, Math.sin(angle) * dist);
  mesh.rotation.y = angle + Math.PI;
  scene.add(mesh);
  holoFragments.push({
    mesh,
    orbitAngle: angle,
    orbitDist: dist,
    orbitSpeed: (0.0003 + Math.random() * 0.0008) * (Math.random() > 0.5 ? 1 : -1),
    bobPhase: Math.random() * Math.PI * 2,
    bobSpeed: 0.005 + Math.random() * 0.01,
    bobAmp: 0.1 + Math.random() * 0.3,
    baseY: yPos,
  });
}

// ── Ember / spark particles near screen bases ───────────────────────────────
const EMBER_COUNT = 80;
const emberGeo = new THREE.BufferGeometry();
const emberPositions = new Float32Array(EMBER_COUNT * 3);
const emberVelocities = new Float32Array(EMBER_COUNT * 3);
const emberColors = new Float32Array(EMBER_COUNT * 3);

for (let i = 0; i < EMBER_COUNT; i++) {
  // Spawn near a random screen base
  const sec = SECTIONS[Math.floor(Math.random() * SECTIONS.length)];
  const spread = (Math.random() - 0.5) * 6;
  emberPositions[i * 3]     = RADIUS * 0.9 * Math.sin(sec.theta) + spread;
  emberPositions[i * 3 + 1] = -5.5 + Math.random() * 3;
  emberPositions[i * 3 + 2] = RADIUS * 0.9 * Math.cos(sec.theta) + spread;
  emberVelocities[i * 3]     = (Math.random() - 0.5) * 0.005;
  emberVelocities[i * 3 + 1] = 0.005 + Math.random() * 0.015;
  emberVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
  // Orange to blue-white color
  const isBlue = Math.random() > 0.6;
  emberColors[i * 3]     = isBlue ? 0.3 : 1.0;
  emberColors[i * 3 + 1] = isBlue ? 0.5 : 0.4;
  emberColors[i * 3 + 2] = isBlue ? 1.0 : 0.1;
}
emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
emberGeo.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));

const emberMat = new THREE.PointsMaterial({
  size: 0.1,
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  fog: true,
  sizeAttenuation: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const embers = new THREE.Points(emberGeo, emberMat);
embers.name = 'embers';
scene.add(embers);


// ── Floating particles ──────────────────────────────────────────────────────
const PARTICLE_COUNT = 200;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
const particleSpeeds = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  particlePositions[i * 3]     = (Math.random() - 0.5) * 60;  // x
  particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 20;  // y
  particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 60;  // z
  particleSpeeds[i] = 0.002 + Math.random() * 0.008;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

const particleMat = new THREE.PointsMaterial({
  color: 0x888888,
  size: 0.08,
  transparent: true,
  opacity: 0.5,
  fog: true,
  sizeAttenuation: true,
});
const particles = new THREE.Points(particleGeo, particleMat);
particles.name = 'particles';
scene.add(particles);

// ── Post-processing ─────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom — makes bright areas glow (screens, lights)
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.08,  // strength
  0.2,   // radius
  0.95   // threshold
);
composer.addPass(bloomPass);

// Motion blur — AfterimagePass retains previous frames for cinematic trail
const afterimagePass = new AfterimagePass(0.0);  // start with no trail; driven dynamically
composer.addPass(afterimagePass);

let prevRotY = 0;

// Vignette — darkens edges for cinematic feel
const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset:   { value: 1.0 },
    darkness: { value: 1.6 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float vig = clamp(1.0 - dot(uv, uv) * darkness, 0.0, 1.0);
      texel.rgb *= mix(1.0 - darkness * 0.3, 1.0, vig);
      gl_FragColor = texel;
    }
  `,
};
composer.addPass(new ShaderPass(vignetteShader));

// Chromatic aberration — subtle RGB split at edges
const chromaticShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.003 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir);
      float offset = uIntensity * dist;
      vec2 uvR = vUv + dir * offset;
      vec2 uvB = vUv - dir * offset;
      float r = texture2D(tDiffuse, uvR).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, uvB).b;
      float a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = vec4(r, g, b, a);
    }
  `,
};
const chromaticPass = new ShaderPass(chromaticShader);
composer.addPass(chromaticPass);

// Film grain — subtle noise overlay
const filmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uIntensity: { value: 0.005 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float grain = rand(vUv + uTime) * 2.0 - 1.0;
      texel.rgb += grain * uIntensity;
      gl_FragColor = texel;
    }
  `,
};
const filmGrainPass = new ShaderPass(filmGrainShader);
composer.addPass(filmGrainPass);

// Color grading — subtle cinematic teal shadows / warm highlights
const colorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.12 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
      vec3 shadows = vec3(0.0, 0.05, 0.1);
      vec3 highlights = vec3(0.08, 0.04, 0.0);
      vec3 grade = mix(shadows, highlights, lum);
      texel.rgb += grade * uIntensity;
      texel.rgb = mix(vec3(lum), texel.rgb, 1.08);
      gl_FragColor = texel;
    }
  `,
};
composer.addPass(new ShaderPass(colorGradeShader));

// Output pass — applies tone mapping + color space conversion
composer.addPass(new OutputPass());

// ── Procedural sci-fi floor texture ──────────────────────────────────────────
function createSciFiFloorTex() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');

  // Dark base
  ctx.fillStyle = '#0a0e18';
  ctx.fillRect(0, 0, size, size);

  // Grid lines
  const gridSize = 64;
  ctx.strokeStyle = 'rgba(180, 190, 210, 0.2)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= size; i += gridSize) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }

  // Brighter major grid every 4 cells
  ctx.strokeStyle = 'rgba(200, 210, 225, 0.29)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i <= size; i += gridSize * 4) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }

  // Random lit panels
  for (let i = 0; i < 30; i++) {
    const gx = Math.floor(Math.random() * (size / gridSize)) * gridSize;
    const gy = Math.floor(Math.random() * (size / gridSize)) * gridSize;
    const bright = Math.random();
    if (bright > 0.7) {
      // Accent panel
      ctx.fillStyle = `rgba(28, 79, 232, ${0.04 + Math.random() * 0.08})`;
    } else {
      // Subtle light panel
      ctx.fillStyle = `rgba(60, 80, 120, ${0.03 + Math.random() * 0.06})`;
    }
    ctx.fillRect(gx + 2, gy + 2, gridSize - 4, gridSize - 4);
  }

  // Corner dots at intersections
  ctx.fillStyle = 'rgba(200, 210, 225, 0.25)';
  for (let x = 0; x <= size; x += gridSize * 4) {
    for (let y = 0; y <= size; y += gridSize * 4) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Subtle scratches / wear marks
  ctx.strokeStyle = 'rgba(80, 100, 140, 0.08)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 40; i++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const ex = sx + (Math.random() - 0.5) * 200;
    const ey = sy + (Math.random() - 0.5) * 200;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSciFiFloorNormal() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');

  // Flat normal base (128, 128, 255)
  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, size, size);

  // Grid grooves — slight dip at grid lines
  const gridSize = 64;
  ctx.strokeStyle = 'rgb(100, 128, 255)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += gridSize) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

const sciFiFloorColor = createSciFiFloorTex();
const sciFiFloorNormal = createSciFiFloorNormal();

// Alpha map for fading floor edges
const floorAlphaTex = (() => {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, 'white');
  grad.addColorStop(0.12, 'white');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.03)');
  grad.addColorStop(0.4, 'black');
  grad.addColorStop(1, 'black');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
})();

const floorMaterial = new THREE.MeshPhysicalMaterial({
  map: sciFiFloorColor,
  normalMap: sciFiFloorNormal,
  normalScale: new THREE.Vector2(0.3, 0.3),
  alphaMap: floorAlphaTex,
  transparent: true,
  roughness: 0.35,
  metalness: 0.7,
  envMapIntensity: 2.5,
  clearcoat: 0.6,
  clearcoatRoughness: 0.1,
  reflectivity: 1.0,
  fog: false,
  emissive: 0x2a4a80,
  emissiveMap: sciFiFloorColor,
  emissiveIntensity: 0.6,
  opacity: 0.35,
});

// Reflector underneath — captures real screen content
const reflectorGeo = new THREE.PlaneGeometry(120, 120);
const reflector = new Reflector(reflectorGeo, {
  textureWidth: 512,
  textureHeight: 512,
  color: 0x666677,
  recursion: 0,
});
reflector.name = 'reflector';
reflector.rotation.x = -Math.PI / 2;
reflector.position.y = -6.02;
reflector.material.fog = false;
scene.add(reflector);

// Fade mask on top of reflector — hides its sharp edges
const fadeMaskSize = 512;
const fadeMaskCanvas = document.createElement('canvas');
fadeMaskCanvas.width = fadeMaskSize;
fadeMaskCanvas.height = fadeMaskSize;
const fadeMaskCtx = fadeMaskCanvas.getContext('2d');
// Fill with background color, then punch a transparent hole in the center
fadeMaskCtx.fillStyle = '#000000';
fadeMaskCtx.fillRect(0, 0, fadeMaskSize, fadeMaskSize);
const fadeGrad = fadeMaskCtx.createRadialGradient(
  fadeMaskSize / 2, fadeMaskSize / 2, 0,
  fadeMaskSize / 2, fadeMaskSize / 2, fadeMaskSize / 2
);
fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
fadeGrad.addColorStop(0.15, 'rgba(0,0,0,0)');
fadeGrad.addColorStop(0.3, 'rgba(0,0,0,0.5)');
fadeGrad.addColorStop(0.45, 'rgba(0,0,0,0.9)');
fadeGrad.addColorStop(0.55, 'rgba(0,0,0,1)');
fadeGrad.addColorStop(1, 'rgba(0,0,0,1)');
fadeMaskCtx.globalCompositeOperation = 'source-over';
fadeMaskCtx.fillStyle = fadeGrad;
fadeMaskCtx.fillRect(0, 0, fadeMaskSize, fadeMaskSize);
const fadeMaskTex = new THREE.CanvasTexture(fadeMaskCanvas);

const fadeMaskGeo = new THREE.PlaneGeometry(200, 200);
fadeMaskGeo.rotateX(-Math.PI / 2);
const fadeMaskMat = new THREE.MeshBasicMaterial({
  map: fadeMaskTex,
  transparent: true,
  fog: false,
  depthWrite: false,
});
const fadeMask = new THREE.Mesh(fadeMaskGeo, fadeMaskMat);
fadeMask.name = 'reflector_fade_mask';
fadeMask.position.y = -6.01;
fadeMask.renderOrder = 2;
scene.add(fadeMask);

// Textured floor on top — semi-transparent so reflections show through
const floorGeo = new THREE.PlaneGeometry(200, 200);
floorGeo.rotateX(-Math.PI / 2);
const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
floorMesh.name = 'floor';
floorMesh.position.y = -6;
floorMesh.renderOrder = 1;
scene.add(floorMesh);




// ── Camera state ───────────────────────────────────────────────────────────
const cam = { zoom: MAX_ZOOM, rotY: 0 };

// ── Timeline: each phase is a separate scroll step ─────────────────────────
// Step 1: zoom out — Step 2: rotate — Step 3: zoom in (repeat per transition)
const ZOOM_DUR = 1;
const PAN_DUR = 1;

const tl = gsap.timeline({ paused: true });

// Hero active (start)
tl.addLabel('hero');

// Hero → About (3 steps)
tl.to(cam, { zoom: 0, duration: ZOOM_DUR, ease: 'power2.in' });
tl.addLabel('hero-out');
tl.to(cam, { rotY: -Math.PI / 2, duration: PAN_DUR, ease: 'power2.inOut' });
tl.addLabel('about-out');
tl.to(cam, { zoom: MAX_ZOOM, duration: ZOOM_DUR, ease: 'power2.out' });
tl.addLabel('about');

// About → Projects (3 steps)
tl.to(cam, { zoom: 0, duration: ZOOM_DUR, ease: 'power2.in' });
tl.addLabel('about-out2');
tl.to(cam, { rotY: -Math.PI, duration: PAN_DUR, ease: 'power2.inOut' });
tl.addLabel('projects-out');
tl.to(cam, { zoom: MAX_ZOOM, duration: ZOOM_DUR, ease: 'power2.out' });
tl.addLabel('projects');

// Projects → Contact (3 steps)
tl.to(cam, { zoom: 0, duration: ZOOM_DUR, ease: 'power2.in' });
tl.addLabel('projects-out2');
tl.to(cam, { rotY: -Math.PI * 1.5, duration: PAN_DUR, ease: 'power2.inOut' });
tl.addLabel('contact-out');
tl.to(cam, { zoom: MAX_ZOOM, duration: ZOOM_DUR, ease: 'power2.out' });
tl.addLabel('contact');

// ── ScrollTrigger ──────────────────────────────────────────────────────────
const totalDur = tl.duration();

// Snap to every label (each phase boundary is a stop)
const allLabels = Object.values(tl.labels).map((t) => t / totalDur);

// Active section labels for nav click targets
const sectionSnaps = SECTIONS.map((sec) => tl.labels[sec.id] / totalDur);

ScrollTrigger.create({
  trigger: '#scroll-spacer',
  start: 'top top',
  end: 'bottom bottom',
  scrub: 1.5,
  animation: tl,
  snap: {
    snapTo: allLabels,
    duration: { min: 0.3, max: 0.6 },
    ease: 'power3.inOut',
  },
});

// ── Overlay management ─────────────────────────────────────────────────────
const overlayEls = SECTIONS.map((s) => document.getElementById(s.id));
const SHOW_THRESHOLD = MAX_ZOOM * 0.5;
const FULL_THRESHOLD = MAX_ZOOM * 0.8;
const INTERACT_THRESHOLD = MAX_ZOOM * 0.9;

function updateOverlays() {
  let closest = 0;
  let minDist = Infinity;
  SECTIONS.forEach((sec, i) => {
    const dist = Math.abs(cam.rotY - sec.rotY);
    if (dist < minDist) { minDist = dist; closest = i; }
  });

  const isFacing = minDist < 0.15;

  overlayEls.forEach((el, i) => {
    if (!el) return;
    if (i === closest && isFacing && cam.zoom > SHOW_THRESHOLD) {
      const t = (cam.zoom - SHOW_THRESHOLD) / (FULL_THRESHOLD - SHOW_THRESHOLD);
      const opacity = Math.min(1, Math.max(0, t));
      el.style.opacity = opacity;
      const canInteract = cam.zoom > INTERACT_THRESHOLD;
      el.style.pointerEvents = canInteract ? 'auto' : 'none';
      // Only toggle 'active' for non-hero sections — hero keeps it always for canvas rendering
      if (el.id !== 'hero') {
        el.classList.toggle('active', canInteract);
      }
    } else {
      el.style.opacity = 0;
      el.style.pointerEvents = 'none';
      // Never remove 'active' from hero — char-cloud.js needs it to keep rendering
      if (el.id !== 'hero') {
        el.classList.remove('active');
      }
    }
  });

  // Navbar active link
  document.querySelectorAll('.nav-link[data-section]').forEach((link) => {
    link.classList.toggle('active', link.dataset.section === SECTIONS[closest].id);
  });

  // Nav progress dots
  if (window.setNavProgress) {
    const p = Math.min(1, Math.max(0, cam.rotY / (-Math.PI * 1.5)));
    window.setNavProgress(p);
  }
}

// ── Nav click → scroll ─────────────────────────────────────────────────────
document.querySelectorAll('.nav-link[data-section]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const idx = SECTIONS.findIndex((s) => s.id === link.dataset.section);
    if (idx < 0) return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    lenis.scrollTo(sectionSnaps[idx] * maxScroll, { duration: 1.5 });
  });
});

document.querySelector('.nav-cta')?.addEventListener('click', (e) => {
  e.preventDefault();
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  lenis.scrollTo(sectionSnaps[3] * maxScroll, { duration: 1.5 });
});

// ── Cursor parallax (opposite direction) ────────────────────────────────────
const mouse = { x: 0, y: 0 };
const smoothMouse = { x: 0, y: 0 };
const PARALLAX_STRENGTH = 1.0;
const PARALLAX_SMOOTH = 0.008;

window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;   // -1 to 1
  mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
});

// ── Screen glitch system ─────────────────────────────────────────────────────
const glitchState = screenMeshes.map(() => ({
  active: false,
  timer: 0,
  duration: 0,
  nextGlitch: 2 + Math.random() * 6,  // seconds until first glitch
  origOffsetY: 0,
  origEmissiveR: 1, origEmissiveG: 1, origEmissiveB: 1,
}));

function updateGlitches(dt) {
  glitchState.forEach((g, i) => {
    if (i === 0) return; // hero uses MeshBasicMaterial
    const mat = screenMeshes[i].material;
    g.nextGlitch -= dt;

    if (!g.active && g.nextGlitch <= 0) {
      // Start a glitch
      g.active = true;
      g.duration = 0.05 + Math.random() * 0.15;  // 50-200ms
      g.timer = 0;
      g.origOffsetY = mat.map ? mat.map.offset.y : 0;
    }

    if (g.active) {
      g.timer += dt;
      // Random UV shift (horizontal scan lines effect)
      if (mat.map) {
        mat.map.offset.y = g.origOffsetY + (Math.random() - 0.5) * 0.04;
        if (mat.emissiveMap && mat.emissiveMap !== mat.map) {
          mat.emissiveMap.offset.y = mat.map.offset.y;
        }
      }
      // Flicker emissive intensity
      mat.emissiveIntensity = 0.5 + Math.random() * 2.5;
      // Occasional color shift
      if (Math.random() > 0.5) {
        mat.emissive.setRGB(0.7 + Math.random() * 0.3, 0.8 + Math.random() * 0.2, 1);
      }

      if (g.timer >= g.duration) {
        // End glitch — restore
        g.active = false;
        g.nextGlitch = 3 + Math.random() * 8;  // 3-11s until next
        if (mat.map) {
          mat.map.offset.y = g.origOffsetY;
          if (mat.emissiveMap && mat.emissiveMap !== mat.map) {
            mat.emissiveMap.offset.y = g.origOffsetY;
          }
        }
        mat.emissiveIntensity = 2.0; // non-hero screens only
        mat.emissive.setRGB(1, 1, 1);
      }
    }
  });
}

let lastTime = performance.now();

// ── Render loop ────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Screen glitch updates
  updateGlitches(dt);

  // Smooth lerp toward mouse target
  smoothMouse.x += (mouse.x - smoothMouse.x) * PARALLAX_SMOOTH;
  smoothMouse.y += (mouse.y - smoothMouse.y) * PARALLAX_SMOOTH;

  cameraRig.rotation.y = cam.rotY;
  camera.position.y = 2;
  camera.position.z = -cam.zoom;

  // Camera tumble — follows cursor, clamped to prevent losing content
  const maxTiltX = 0.04; // ~2.5° vertical
  const maxTiltY = 0.06;  // ~3.4° horizontal
  camera.rotation.y = Math.max(-maxTiltY, Math.min(maxTiltY, smoothMouse.x * 0.25));
  camera.rotation.x = Math.max(-maxTiltX, Math.min(maxTiltX, smoothMouse.y * 0.15));


  // Motion blur — stronger when camera is rotating
  const rotDelta = Math.abs(cam.rotY - prevRotY);
  const blurAmount = Math.min(0.2, rotDelta * 3);
  afterimagePass.uniforms['damp'].value = blurAmount;
  prevRotY = cam.rotY;

  // Update hero texture every frame (live canvas animation)
  if (heroTexture) heroTexture.needsUpdate = true;

  // Slowly rotate starfield
  stars.rotation.y += 0.00008;

  // Rotate HDRI environment for dynamic reflections
  if (scene.environmentRotation) {
    scene.environmentRotation.y += 0.0003;
  }

  // Rotate inner platform ring
  innerRing.rotation.z += 0.002;

  // Animate cable pulse dots
  cableDots.forEach((dot) => {
    dot.userData.phase = (dot.userData.phase + dot.userData.speed) % 1;
    const pt = dot.userData.curve.getPoint(dot.userData.phase);
    dot.position.x = pt.x;
    dot.position.z = pt.z;
  });

  // Animate holographic UI fragments — orbit + bob
  holoFragments.forEach((h) => {
    h.orbitAngle += h.orbitSpeed;
    h.bobPhase += h.bobSpeed;
    h.mesh.position.x = Math.cos(h.orbitAngle) * h.orbitDist;
    h.mesh.position.z = Math.sin(h.orbitAngle) * h.orbitDist;
    h.mesh.position.y = h.baseY + Math.sin(h.bobPhase) * h.bobAmp;
    h.mesh.rotation.y = h.orbitAngle + Math.PI;
  });

  // Animate ember particles — drift upward, respawn at base
  const emberPos = emberGeo.attributes.position;
  for (let i = 0; i < EMBER_COUNT; i++) {
    emberPos.array[i * 3]     += emberVelocities[i * 3] + smoothMouse.x * 0.003;
    emberPos.array[i * 3 + 1] += emberVelocities[i * 3 + 1];
    emberPos.array[i * 3 + 2] += emberVelocities[i * 3 + 2] + smoothMouse.y * 0.002;
    if (emberPos.array[i * 3 + 1] > 5) {
      const sec = SECTIONS[Math.floor(Math.random() * SECTIONS.length)];
      const spread = (Math.random() - 0.5) * 6;
      emberPos.array[i * 3]     = RADIUS * 0.9 * Math.sin(sec.theta) + spread;
      emberPos.array[i * 3 + 1] = -5.5 + Math.random() * 2;
      emberPos.array[i * 3 + 2] = RADIUS * 0.9 * Math.cos(sec.theta) + spread;
    }
  }
  emberPos.needsUpdate = true;

  // Boost chromatic aberration during rotation
  chromaticPass.uniforms.uIntensity.value = 0.003 + rotDelta * 2;

  // Update film grain time
  filmGrainPass.uniforms.uTime.value = performance.now() * 0.001;

  // Screen idle breathing — subtle emissive pulse
  const breathe = Math.sin(now * 0.001) * 0.15;
  screenMeshes.forEach((m, i) => {
    if (i === 0) return; // hero uses MeshBasicMaterial
    if (!glitchState[i].active) {
      const base = 2.0;
      m.material.emissiveIntensity = base + breathe;
    }
  });

  // Screen floating — each screen bobs gently at its own phase
  screenGroups.forEach((g, i) => {
    const phase = i * 1.57; // quarter-π offset per screen
    g.position.y = Math.sin(now * 0.0006 + phase) * 0.12;
    g.position.x = Math.sin(now * 0.0004 + phase * 1.3) * 0.03;
  });

  // Animate floating particles — drift upward + react to camera movement
  const camDelta = Math.abs(smoothMouse.x) + Math.abs(smoothMouse.y);
  const pos = particleGeo.attributes.position;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pos.array[i * 3 + 1] += particleSpeeds[i];
    pos.array[i * 3] += smoothMouse.x * particleSpeeds[i] * 0.8;
    pos.array[i * 3 + 2] += smoothMouse.y * particleSpeeds[i] * 0.5;
    if (pos.array[i * 3 + 1] > 10) {
      pos.array[i * 3 + 1] = -10;
      pos.array[i * 3]     = (Math.random() - 0.5) * 60;
      pos.array[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
  }
  pos.needsUpdate = true;
  particleMat.opacity = 0.4 + camDelta * 0.3;

  updateOverlays();
  stats.begin();
  composer.render();
  stats.end();
}
animate();

// ── Resize ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
