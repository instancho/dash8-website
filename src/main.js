import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import * as THREE from 'three';
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

// ── Performance monitor (FPS counter, top-right) — dev only ─────────────────
const stats = import.meta.env.DEV ? new Stats() : null;
if (stats) {
  stats.showPanel(0); // 0 = FPS
  stats.dom.style.cssText = 'position:fixed;top:0;right:0;left:auto;z-index:9999;';
  document.body.appendChild(stats.dom);
}

// Dev-only averaged FPS readout — measured from real frame intervals (reflects
// dropped frames), updated twice a second. Bottom-right.
let fpsEl = null, fpsFrames = 0, fpsAccum = 0;
if (import.meta.env.DEV) {
  fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'position:fixed;bottom:4px;right:6px;z-index:99999;font:12px/1.4 monospace;color:#7CFC00;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:3px;pointer-events:none;';
  fpsEl.textContent = '— fps';
  document.body.appendChild(fpsEl);
}

// ── Lenis smooth scroll ────────────────────────────────────────────────────
const lenis = new Lenis();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// ── Three.js core ──────────────────────────────────────────────────────────
const threeCanvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.045);

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
  // Wait until char-cloud.js pre-init has sized the canvas to the viewport.
  // The HTML default is 300px wide — reject that and keep polling.
  const minWidth = Math.round(window.innerWidth * (window.devicePixelRatio || 1) * 0.5);
  if (!heroCanvasEl || heroCanvasEl.width < minWidth) {
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

// ── Projects live texture — maps the projects-bg.js canvas onto the 3D screen ─
const projectsCanvasEl = document.getElementById('projects-canvas');
let projectsTexture = null;

function initProjectsTexture() {
  const minWidth = Math.round(window.innerWidth * (window.devicePixelRatio || 1) * 0.5);
  if (!projectsCanvasEl || projectsCanvasEl.width < minWidth) {
    requestAnimationFrame(initProjectsTexture);
    return;
  }
  projectsTexture = new THREE.CanvasTexture(projectsCanvasEl);
  projectsTexture.colorSpace = THREE.SRGBColorSpace;
  projectsTexture.wrapS = THREE.RepeatWrapping;
  projectsTexture.repeat.x = -1;
  projectsTexture.offset.x = 1;

  // Swap to MeshBasicMaterial — unlit, bypasses ACES tone mapping and color grade
  screenMeshes[2].material.dispose();
  const projectsMat = new THREE.MeshBasicMaterial({
    map: projectsTexture,
    side: THREE.DoubleSide,
    fog: false,
  });
  projectsMat.toneMapped = false;
  screenMeshes[2].material = projectsMat;
}
requestAnimationFrame(initProjectsTexture);

// ── About live texture — maps the about ASCII canvas onto the 3D screen ───
const aboutCanvasEl = document.getElementById('about-ascii-canvas');
let aboutTexture = null;

function initAboutTexture() {
  if (!aboutCanvasEl || aboutCanvasEl.width < 2) {
    requestAnimationFrame(initAboutTexture);
    return;
  }
  aboutTexture = new THREE.CanvasTexture(aboutCanvasEl);
  aboutTexture.colorSpace = THREE.SRGBColorSpace;
  aboutTexture.wrapS = THREE.RepeatWrapping;
  aboutTexture.repeat.x = -1;
  aboutTexture.offset.x = 1;

  screenMeshes[1].material.dispose();
  const aboutMat = new THREE.MeshBasicMaterial({
    map: aboutTexture,
    side: THREE.DoubleSide,
    fog: false,
  });
  aboutMat.toneMapped = false;
  screenMeshes[1].material = aboutMat;
}
requestAnimationFrame(initAboutTexture);

// ── Contact live texture — maps the contact ASCII canvas onto the 3D screen ─
const contactCanvasEl = document.getElementById('contact-ascii-canvas');
let contactTexture = null;

function initContactTexture() {
  if (!contactCanvasEl || contactCanvasEl.width < 2) {
    requestAnimationFrame(initContactTexture);
    return;
  }
  contactTexture = new THREE.CanvasTexture(contactCanvasEl);
  contactTexture.colorSpace = THREE.SRGBColorSpace;
  contactTexture.wrapS = THREE.RepeatWrapping;
  contactTexture.repeat.x = -1;
  contactTexture.offset.x = 1;

  screenMeshes[3].material.dispose();
  const contactMat = new THREE.MeshBasicMaterial({
    map: contactTexture,
    side: THREE.DoubleSide,
    fog: false,
  });
  contactMat.toneMapped = false;
  screenMeshes[3].material = contactMat;
}
requestAnimationFrame(initContactTexture);

// ── HDRI environment ───────────────────────────────────────────────────────
new EXRLoader().load(
  '/Assets/textures/NightEnvironmentHDRI007_2K_HDR.exr',
  (exrTexture) => {
    exrTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = exrTexture;
    scene.background = exrTexture;
    scene.backgroundIntensity = 0.002;
    scene.environmentIntensity = 0.15;
    scene.environmentRotation = new THREE.Euler(0, 0, 0);
    scene.backgroundRotation = new THREE.Euler(0, 0, 0);
    if (window.preloaderDone) window.preloaderDone('hdri');
  },
  undefined,
  (err) => {
    console.error('HDRI failed to load:', err);
    if (window.preloaderDone) window.preloaderDone('hdri');
  }
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



// ── Screen platforms — one below each screen ────────────────────────────────
const screenPlatforms = [];
const SCREEN_COLORS = {
  hero:     0x1C48E8,
  about:    0xF3305D,
  projects: 0xe3b23c,
  contact:  0x22162B,
};
SECTIONS.forEach((sec) => {
  const g = new THREE.Group();
  const x = RADIUS * Math.sin(sec.theta);
  const z = RADIUS * Math.cos(sec.theta);
  g.position.set(x, -5.9, z);
  g.scale.setScalar(0.75);
  scene.add(g);

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6.5, 0.3, 64),
    new THREE.MeshLambertMaterial({ color: 0x111118, emissive: 0x000000, reflectivity: 0, fog: true })
  );
  disc.name = 'screen_platform_disc_' + sec.id;
  g.add(disc);

  const edge = new THREE.Mesh(
    new THREE.TorusGeometry(6.25, 0.06, 16, 128),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })
  );
  edge.name = 'screen_platform_edge_' + sec.id;
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.16;
  g.add(edge);

  const ringColor = SCREEN_COLORS[sec.id] || 0x2244aa;

  // Glow layers — many soft rings with additive blending for smooth falloff
  const glowLayers = [
    { tube: 1.05, opacity: 0.015 },
    { tube: 0.75, opacity: 0.025 },
    { tube: 0.52, opacity: 0.035 },
    { tube: 0.33, opacity: 0.05 },
    { tube: 0.21, opacity: 0.07 },
    { tube: 0.12, opacity: 0.1 },
  ];
  glowLayers.forEach(gl => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, gl.tube, 16, 96),
      new THREE.MeshBasicMaterial({
        color: ringColor, transparent: true, opacity: gl.opacity,
        fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.17;
    g.add(mesh);
  });

  // Core ring
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(3.5, 0.03, 16, 96),
    new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.6, fog: false })
  );
  inner.name = 'screen_platform_inner_' + sec.id;
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 0.17;
  g.add(inner);

  screenPlatforms.push({ group: g, inner });
});

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

// Combined post-processing — vignette + chromatic aberration + film grain + color grading
// Merged into a single shader pass (saves 3 full-screen texture reads per frame)
const combinedPostShader = {
  uniforms: {
    tDiffuse:       { value: null },
    uChromatic:     { value: 0.003 },
    uGrainTime:     { value: 0.0 },
    uGrainIntensity:{ value: 0.005 },
    uGradeIntensity:{ value: 0.12 },
    uDarkness:      { value: 1.6 },
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
    uniform float uChromatic;
    uniform float uGrainTime;
    uniform float uGrainIntensity;
    uniform float uGradeIntensity;
    uniform float uDarkness;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      // Chromatic aberration
      vec2 dir = vUv - 0.5;
      float dist = length(dir);
      float offset = uChromatic * dist;
      float r = texture2D(tDiffuse, vUv + dir * offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * offset).b;
      vec3 color = vec3(r, g, b);

      // Vignette
      vec2 uv2 = (vUv - 0.5) * 2.0;
      float vig = clamp(1.0 - dot(uv2, uv2) * uDarkness, 0.0, 1.0);
      color *= mix(1.0 - uDarkness * 0.3, 1.0, vig);

      // Film grain
      float grain = rand(vUv + uGrainTime) * 2.0 - 1.0;
      color += grain * uGrainIntensity;

      // Color grading
      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 shadows = vec3(0.0, 0.05, 0.1);
      vec3 highlights = vec3(0.08, 0.04, 0.0);
      vec3 grade = mix(shadows, highlights, lum);
      color += grade * uGradeIntensity;
      color = mix(vec3(lum), color, 1.08);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
const combinedPass = new ShaderPass(combinedPostShader);
composer.addPass(combinedPass);

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
const reflectorGeo = new THREE.PlaneGeometry(240, 240);
const reflector = new Reflector(reflectorGeo, {
  textureWidth: 128,
  textureHeight: 128,
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

const fadeMaskGeo = new THREE.PlaneGeometry(400, 400);
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
const floorGeo = new THREE.PlaneGeometry(400, 400);
floorGeo.rotateX(-Math.PI / 2);
const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
floorMesh.name = 'floor';
floorMesh.position.y = -6;
floorMesh.renderOrder = 1;
scene.add(floorMesh);




// ── Floor luminous wave system ────────────────────────────────────────────────
const floorWaveVS = `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const floorWaveFS = `
  uniform float uWavePos;
  uniform float uWaveWidth;
  uniform float uDirX;
  uniform float uDirZ;
  uniform float uIntensity;

  varying vec3 vWorldPos;

  void main() {
    // Grid constants: PlaneGeometry(400,400), repeat(6,6), 16 cells per tile
    const float cellSize   = 2.0833;
    const float majorSize  = 8.3333;
    const float lineW      = 0.06;
    const float majorLineW = 0.10;

    float cx  = mod(abs(vWorldPos.x), cellSize);
    float cz  = mod(abs(vWorldPos.z), cellSize);
    float gx  = 1.0 - smoothstep(0.0, lineW, min(cx, cellSize - cx));
    float gz  = 1.0 - smoothstep(0.0, lineW, min(cz, cellSize - cz));
    float grid = max(gx, gz);

    float mx  = mod(abs(vWorldPos.x), majorSize);
    float mz  = mod(abs(vWorldPos.z), majorSize);
    float mgx = 1.0 - smoothstep(0.0, majorLineW, min(mx, majorSize - mx));
    float mgz = 1.0 - smoothstep(0.0, majorLineW, min(mz, majorSize - mz));
    grid = max(grid, max(mgx, mgz) * 1.5);

    float proj     = vWorldPos.x * uDirX + vWorldPos.z * uDirZ;
    float dist     = abs(proj - uWavePos);
    float envelope = exp(-dist * dist / (uWaveWidth * uWaveWidth));

    // Radial fade — keep wave on floor only, away from screen bases
    float radius  = length(vWorldPos.xz);
    float radFade = 1.0 - smoothstep(28.0, 50.0, radius);

    float brightness = grid * envelope * uIntensity * radFade;
    vec3  col        = mix(vec3(0.15, 0.5, 1.0), vec3(0.8, 0.92, 1.0), envelope);

    gl_FragColor = vec4(col * brightness, min(1.0, brightness * 0.85));
  }
`;

// All 12 directions: 4 axis-aligned + 4 diagonal + 4 intermediate (~22.5°)
const FLOOR_WAVE_DIRS = (() => {
  const dirs = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    dirs.push([Math.cos(a), Math.sin(a)]);
  }
  return dirs;
})();

const floorWaves = [];

for (let w = 0; w < 3; w++) {
  const wGeo = new THREE.PlaneGeometry(600, 600);
  wGeo.rotateX(-Math.PI / 2);
  const wUniforms = {
    uWavePos:   { value: -999.0 },
    uWaveWidth: { value: 12.0 },
    uDirX:      { value: 1.0 },
    uDirZ:      { value: 0.0 },
    uIntensity: { value: 0.0 },
  };
  const wMat = new THREE.ShaderMaterial({
    vertexShader:   floorWaveVS,
    fragmentShader: floorWaveFS,
    uniforms:       wUniforms,
    transparent:    true,
    blending:       THREE.AdditiveBlending,
    depthWrite:     false,
    depthTest:      true,
    fog:            false,
    side:           THREE.DoubleSide,
  });
  const wMesh = new THREE.Mesh(wGeo, wMat);
  wMesh.name        = `floor_wave_${w}`;
  wMesh.position.y  = -5.98;
  wMesh.renderOrder = 6;
  scene.add(wMesh);

  floorWaves.push({
    uniforms:      wUniforms,
    active:        false,
    pos:           -999,
    speed:         0,
    baseIntensity: 0,
    nextAt:        2 + w * 4 + Math.random() * 4,
  });
}

function launchFloorWave(wv) {
  const dir = FLOOR_WAVE_DIRS[Math.floor(Math.random() * FLOOR_WAVE_DIRS.length)];
  wv.uniforms.uDirX.value      = dir[0];
  wv.uniforms.uDirZ.value      = dir[1];
  wv.uniforms.uWaveWidth.value = 7 + Math.random() * 8;
  wv.baseIntensity             = 0.5 + Math.random() * 0.3;
  wv.uniforms.uIntensity.value = 0;
  wv.pos   = -160;
  wv.speed = 8 + Math.random() * 12;
  wv.uniforms.uWavePos.value = wv.pos;
  wv.active = true;
}

function updateFloorWaves(dt) {
  floorWaves.forEach((wv) => {
    if (!wv.active) {
      wv.nextAt -= dt;
      if (wv.nextAt <= 0) launchFloorWave(wv);
      return;
    }

    wv.pos += wv.speed * dt;
    wv.uniforms.uWavePos.value = wv.pos;

    // Fade in over first 30 units, fade out over last 30 units
    const fadeIn  = Math.min(1.0, Math.max(0.0, (wv.pos + 160) / 30));
    const fadeOut = Math.min(1.0, Math.max(0.0, (wv.pos - 130) / 30));
    wv.uniforms.uIntensity.value = wv.baseIntensity * fadeIn * (1.0 - fadeOut);

    if (wv.pos >= 160) {
      wv.active = false;
      wv.uniforms.uIntensity.value = 0;
      wv.nextAt = 3 + Math.random() * 8;
    }
  });
}

// ── Camera state ───────────────────────────────────────────────────────────
const cam = { zoom: MAX_ZOOM, rotY: 0 };

// ── Intro camera sequence ─────────────────────────────────────────────────
// Phase 1 (3s): top-down spinning fast
// Phase 2 (3.5s): descend to eye level, spin decelerating
// Phase 3 (1.5s): final slow spin to face hero + zoom in
const intro = {
  active: true,
  camY: 90,           // start high above
  camZ: -2,           // near center looking down
  camRotX: -Math.PI / 2 + 0.05,  // looking down
  rigRotY: 0,         // accumulated rotation
  spinSpeed: 4.5,     // rad/s, matches ring end speed
  zoom: 0,            // 0 = zoomed out, MAX_ZOOM = zoomed in
  done: false,
};

const introTl = gsap.timeline({ paused: true, onComplete: () => {
  intro.active = false;
  cam.rotY = 0;
  cam.zoom = MAX_ZOOM;
  cameraRig.rotation.y = 0;
  camera.position.y = 2;
  camera.position.z = -MAX_ZOOM;
  camera.rotation.x = 0;
  camera.rotation.y = 0;
  // Reset scroll to top before releasing so ScrollTrigger starts at hero
  window.scrollTo(0, 0);
  lenis.scrollTo(0, { immediate: true });
  ScrollTrigger.refresh();
  lenis.start();
} });

// Phase 1 (0–3s): hold top-down, spinning fast
introTl.to(intro, { duration: 3, ease: 'none' });
introTl.addLabel('descend');

// Phase 2 (3–6.5s): descend to screen level, tilt camera horizontal, decelerate spin
introTl.to(intro, {
  camY: 2,
  camRotX: 0,
  spinSpeed: 0.8,
  duration: 3.5,
  ease: 'power2.inOut',
}, 'descend');

introTl.to(intro, {
  camZ: -8,
  duration: 3.5,
  ease: 'power2.in',
}, 'descend');

introTl.addLabel('settle');

// Phase 3: stop spin, tween rotation directly to hero-facing angle
introTl.call(() => {
  // Kill spin immediately — GSAP will drive rotation from here
  intro.spinSpeed = 0;
  // Calculate the next forward hero-facing angle
  const target = Math.ceil(intro.rigRotY / (Math.PI * 2)) * Math.PI * 2;
  // Tween rigRotY directly to the target
  gsap.to(intro, {
    rigRotY: target,
    duration: 2,
    ease: 'power3.out',
  });
}, [], 'settle');

introTl.addLabel('zoomIn', 'settle+=2');

// Phase 4: gently enter hero screen
introTl.to(intro, {
  zoom: MAX_ZOOM * 0.6,
  duration: 1,
  ease: 'power2.out',
}, 'zoomIn');

function startIntroSequence() {
  if (intro.done) return;
  intro.done = true;
  introTl.play();
}

window._startCameraIntro = startIntroSequence;


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

let scrollProgress = 0;
let scrollDirection = 'forward';

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
  onUpdate: (self) => {
    if (self.progress !== scrollProgress) {
      scrollDirection = self.progress > scrollProgress ? 'forward' : 'backward';
    }
    scrollProgress = self.progress;
  },
});

// ── Overlay management ─────────────────────────────────────────────────────
const overlayEls = SECTIONS.map((s) => document.getElementById(s.id));
const navLinkEls = Array.from(document.querySelectorAll('.nav-link[data-section]'));
const cameraLogoEl = document.getElementById('camera-logo');
const SHOW_THRESHOLD = MAX_ZOOM * 0.5;
const FULL_THRESHOLD = MAX_ZOOM * 0.8;
const INTERACT_THRESHOLD = MAX_ZOOM * 0.9;
const sectionWasActive = new Array(SECTIONS.length).fill(false);

// True when an opaque section overlay fully covers the viewport — the 3D scene
// is then 100% occluded, so the whole composer render can be skipped.
let sceneOccluded = false;

// Hide all overlays at boot (intro camera is active)
if (intro.active) {
  overlayEls.forEach(el => {
    if (!el) return;
    el.style.opacity = 0;
    el.style.pointerEvents = 'none';
    if (el.id !== 'hero') el.classList.remove('active');
  });
}

function updateOverlays() {
  let closest = 0;
  let minDist = Infinity;
  SECTIONS.forEach((sec, i) => {
    const dist = Math.abs(cam.rotY - sec.rotY);
    if (dist < minDist) { minDist = dist; closest = i; }
  });

  const isFacing = minDist < 0.15;

  let maxOpacity = 0;
  overlayEls.forEach((el, i) => {
    if (!el) return;
    if (i === closest && isFacing && cam.zoom > SHOW_THRESHOLD) {
      const t = (cam.zoom - SHOW_THRESHOLD) / (FULL_THRESHOLD - SHOW_THRESHOLD);
      const opacity = Math.min(1, Math.max(0, t));
      maxOpacity = Math.max(maxOpacity, opacity);
      el.style.opacity = opacity;
      const canInteract = cam.zoom > INTERACT_THRESHOLD;
      el.style.pointerEvents = canInteract ? 'auto' : 'none';
      // Only toggle 'active' for non-hero sections — hero keeps it always for canvas rendering
      if (el.id !== 'hero') {
        el.classList.toggle('active', canInteract);
        if (canInteract && !sectionWasActive[i]) {
          if (el.id === 'about' && window._aboutServicesEnter) {
            window._aboutServicesEnter(scrollDirection);
          }
        }
        sectionWasActive[i] = canInteract;
      }
    } else {
      el.style.opacity = 0;
      el.style.pointerEvents = 'none';
      // Never remove 'active' from hero — char-cloud.js needs it to keep rendering
      if (el.id !== 'hero') {
        el.classList.remove('active');
      }
      if (el.id === 'about' && window._aboutServicesReset) {
        window._aboutServicesReset();
      }
    }
  });

  // Navbar active link
  navLinkEls.forEach((link) => {
    link.classList.toggle('active', link.dataset.section === SECTIONS[closest].id);
  });

  // Nav progress — driven by timeline scroll position
  if (window.setNavProgress) {
    window.setNavProgress(scrollProgress);
  }

  // Show logo only when camera is zoomed out (transition / camera view)
  if (cameraLogoEl) {
    cameraLogoEl.style.opacity = cam.zoom < SHOW_THRESHOLD ? 1 : 0;
  }

  // Fully covered by an opaque overlay → the 3D render can be skipped this frame.
  sceneOccluded = maxOpacity >= 0.999;
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

// All four screens use MeshBasicMaterial (live canvas textures), so the old
// emissive glitch/breathing systems were no-ops and have been removed.

let lastTime = performance.now();

// ── Render loop ────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Floor wave pulses
  updateFloorWaves(dt);

  // Smooth lerp toward mouse target
  smoothMouse.x += (mouse.x - smoothMouse.x) * PARALLAX_SMOOTH;
  smoothMouse.y += (mouse.y - smoothMouse.y) * PARALLAX_SMOOTH;

  if (intro.active) {
    // Only accumulate spin when spinSpeed > 0 (GSAP drives rigRotY during settle)
    if (intro.spinSpeed > 0.01) {
      intro.rigRotY += intro.spinSpeed * dt;
    }

    cameraRig.rotation.y = intro.rigRotY;
    camera.position.y = intro.camY;
    camera.position.z = intro.camZ - intro.zoom;
    camera.rotation.x = intro.camRotX;
    camera.rotation.y = 0;
    lenis.stop();
  } else {
    cameraRig.rotation.y = cam.rotY;
    camera.position.y = 2;
    camera.position.z = -cam.zoom;

    // Camera tumble — follows cursor, clamped to prevent losing content
    const maxTiltX = 0.04; // ~2.5° vertical
    const maxTiltY = 0.06;  // ~3.4° horizontal
    camera.rotation.y = Math.max(-maxTiltY, Math.min(maxTiltY, smoothMouse.x * 0.25));
    camera.rotation.x = Math.max(-maxTiltX, Math.min(maxTiltX, smoothMouse.y * 0.15));
  }


  // Motion blur — stronger when camera is rotating. Skip the pass entirely when
  // idle (no trail to accumulate) to save a full-screen blend every frame.
  const rotDelta = Math.abs(cam.rotY - prevRotY);
  const blurAmount = Math.min(0.2, rotDelta * 3);
  afterimagePass.uniforms['damp'].value = blurAmount;
  afterimagePass.enabled = blurAmount > 0.002 && !window.__noAfterimage;
  prevRotY = cam.rotY;

  // Dev-only isolation toggles for profiling the composer cost.
  bloomPass.enabled = !window.__noBloom;
  combinedPass.enabled = !window.__noCombined;

  // Expose camera state so canvas modules can pause heavy rendering when their
  // screen is on the far side of the scene (not facing the camera).
  window.projectsZoom = cam.zoom;
  window.dash8CamRotY = cam.rotY;

  // Slowly rotate starfield
  stars.rotation.y += 0.00008;

  // Rotate HDRI environment for dynamic reflections
  if (scene.environmentRotation) {
    scene.environmentRotation.y += 0.000873;
    scene.backgroundRotation.y = scene.environmentRotation.y;
  }

  // Rotate inner platform ring
  screenPlatforms.forEach((sp, i) => {
    sp.inner.rotation.z += 0.002;
    const innerPhase = i * 2.1;
    sp.inner.rotation.x = Math.PI / 2 + Math.sin(now * 0.0007 + innerPhase) * 0.035;
    sp.inner.rotation.y = Math.cos(now * 0.0006 + innerPhase * 1.4) * 0.03;
    sp.group.rotation.y += 0.000291;
    const phase = i * 1.57;
    sp.group.position.y = -5.9 + Math.sin(now * 0.0005 + phase) * 0.12;
    sp.group.rotation.x = Math.sin(now * 0.0004 + phase * 1.3) * 0.0157;
    sp.group.rotation.z = Math.cos(now * 0.00035 + phase * 0.9) * 0.0157;
  });

  // Hide scene clutter during intro top-down view
  embers.visible = !intro.active;
  particles.visible = !intro.active;
  reflector.visible = !intro.active && !window.__noReflector;
  cableDots.forEach(d => { d.visible = !intro.active; });

  // Animate cable pulse dots
  cableDots.forEach((dot) => {
    dot.userData.phase = (dot.userData.phase + dot.userData.speed) % 1;
    const pt = dot.userData.curve.getPoint(dot.userData.phase);
    dot.position.x = pt.x;
    dot.position.z = pt.z;
  });

  // Animate holographic UI fragments — orbit + bob (hidden during intro)
  holoFragments.forEach((h) => {
    h.mesh.visible = !intro.active;
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

  // Update combined post-processing uniforms
  combinedPass.uniforms.uChromatic.value = 0.003 + rotDelta * 2;
  combinedPass.uniforms.uGrainTime.value = performance.now() * 0.001;

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

  if (!intro.active) updateOverlays();

  // Skip the entire 3D render while an opaque overlay fully covers the scene —
  // the composer output would be invisible behind it anyway.
  // (window.__forceOccluded is a dev-only isolation switch for profiling.)
  if (!sceneOccluded && !window.__forceOccluded) {
    // Only re-upload the canvas textures that can actually be seen: the screen
    // currently facing the camera every frame, plus one of the others per frame
    // (round-robin) so peripheral/reflected screens stay reasonably fresh.
    let fIdx = 0, fMin = Infinity;
    for (let i = 0; i < SECTIONS.length; i++) {
      const d = Math.abs(cam.rotY - SECTIONS[i].rotY);
      if (d < fMin) { fMin = d; fIdx = i; }
    }
    const rr = frameCount % 4;
    const texes = [heroTexture, aboutTexture, projectsTexture, contactTexture];
    for (let i = 0; i < texes.length; i++) {
      if (texes[i] && (i === fIdx || i === rr)) texes[i].needsUpdate = true;
    }

    if (stats) stats.begin();
    composer.render();
    if (stats) stats.end();
  }

  // Averaged FPS readout (dev) — from real frame intervals, refreshed every 0.5s
  if (fpsEl) {
    fpsFrames++;
    fpsAccum += dt;
    if (fpsAccum >= 0.5) {
      fpsEl.textContent = Math.round(fpsFrames / fpsAccum) + ' fps avg';
      fpsFrames = 0;
      fpsAccum = 0;
    }
  }

  frameCount++;
}
let frameCount = 0;
if (import.meta.env.DEV) {
  window.__dbg = () => ({ zoom: +cam.zoom.toFixed(1), rotY: +cam.rotY.toFixed(2), occ: sceneOccluded });
}
animate();

// ── Resize ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
