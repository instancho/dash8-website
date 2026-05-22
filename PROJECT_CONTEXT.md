# Dash8 Website — Project Context Document

> Use this document to onboard Claude Code into a new session. Paste it as context or reference it so no progress is lost.

---

## 1. Project Overview

A **Three.js website** for Dash8 — a dark, cinematic 3D scene with **4 curved glass hologram screens** arranged in a circle. The camera orbits between screens via scroll, zooming out, rotating, and zooming back in. The hero section features a canvas-based ASCII character cloud animation.

**Live deployment:** https://dash8-website.onrender.com
**GitHub repo:** https://github.com/instancho/dash8-website (public)

---

## 2. Tech Stack

| Tool | Version/Notes |
|------|---------------|
| Vite | ^8.0.13 (bundler + dev server) |
| Three.js | ^0.184.0 |
| GSAP + ScrollTrigger | ^3.15.0 (scroll-driven camera animation) |
| Lenis | ^1.3.23 (smooth scroll) |
| Render | Hosting (build: `vite build`, start: `vite preview --host 0.0.0.0 --port $PORT`) |

---

## 3. File Structure

```
Dash8 Website/
  index.html              — Main HTML (4 section overlays, navbar, canvas, scroll spacer)
  css/style.css           — All styles (design tokens, navbar, overlays, CRT effects, responsive)
  src/main.js             — Core Three.js scene (1163 lines) — screens, floor, lights, particles, post-processing, render loop
  public/
    js/char-cloud.js      — Hero canvas animation (781 lines) — ASCII matrix reveal, glitch, diagonal wave
    js/navbar.js           — Navbar glitch hover, active tracking, scroll-progress dots
    Assets/
      Logo.svg
      environment.glb
      textures/
        NightEnvironmentHDRI007_2K_HDR.exr    — HDRI environment map
        Metal027_2K-JPG_*.jpg                  — Metal textures (unused currently)
    Font/
      house-sans/HouseSansComp-CompBoldIta.otf — Display font for hero text
  vite.config.js          — allowedHosts for Render, assetsDir: '_assets'
  package.json
  .gitignore              — node_modules/, dist/, .DS_Store
```

**Important:** Files in `public/` are served as static assets by Vite and must use absolute paths (e.g., `/Assets/textures/...`). The `js/char-cloud.js` and `js/navbar.js` are loaded as non-module `<script>` tags, NOT bundled by Vite.

---

## 4. Architecture

### 4.1 Scene Layout (src/main.js)

**Screens:** 4 curved cylindrical segments (radius=36, height=16, arc=0.864 rad, 48 segments) arranged at cardinal angles:
- Hero: theta=PI (faces camera at rotY=0)
- About: theta=PI/2 (rotY=-PI/2)
- Projects: theta=0 (rotY=-PI)
- Contact: theta=3PI/2 (rotY=-3PI/2)

Each screen has:
- **Screen mesh** — MeshPhysicalMaterial with transmission, emissive, emissiveMap
- **Emboss mesh** — MeshStandardMaterial, BackSide, outer shell for thickness
- Both grouped in a `THREE.Group` (`screenGroups[]`) for synchronized floating animation

**Hero screen exception:** Material swapped to `MeshBasicMaterial` with `toneMapped: false` in `initHeroTexture()`. This is CRITICAL — without it, ACES tone mapping desaturates the blue, and lighting/emissive washes out the canvas content. Glitch system and breathing animation both skip index 0.

**Floor system (y=-6):**
- Reflector (y=-6.02) — 120x120, 512x512 texture, captures screen reflections
- Fade mask (y=-6.01) — 200x200, radial gradient to black, hides reflector edges
- Textured floor (y=-6) — 200x200, MeshPhysicalMaterial with sci-fi grid texture, alpha map for edge fade, opacity=0.35 so reflections show through

**Platform (y=-5.9):** Central disc with emissive edge ring and rotating inner ring

**Other elements:**
- Starfield (800 points, upper hemisphere, slow rotation)
- Floating particles (200 points, drift upward, react to mouse)
- Ember/spark particles (80 points, near screen bases, drift upward)
- Holographic UI fragments (8 planes, orbit + bob)
- Floor cables (4 tubes from screens to center with traveling pulse dots)

### 4.2 Camera System

```
cameraRig (Object3D, rotates Y via GSAP)
  camera (PerspectiveCamera, FOV=42)
    camLight (SpotLight, headlight)
```

- `cam.zoom` controls camera Z distance (0 = centered, MAX_ZOOM=30 = zoomed into screen)
- `cam.rotY` controls which screen is faced
- Mouse parallax: camera tilts opposite to mouse direction, clamped (maxTiltX=0.04, maxTiltY=0.06), smoothing=0.008

### 4.3 Scroll Animation (GSAP Timeline)

Pattern per transition: zoom out -> rotate -> zoom in (3 steps x 3 transitions = 9 steps)
- ScrollTrigger on `#scroll-spacer` (1000vh)
- Snaps to all label positions
- `scrub: 1.5` for smooth scroll binding

### 4.4 Overlay System

HTML section overlays (`content-overlay` class) fade in/out based on camera zoom:
- `SHOW_THRESHOLD = MAX_ZOOM * 0.5` — start fading in
- `FULL_THRESHOLD = MAX_ZOOM * 0.8` — fully visible
- `INTERACT_THRESHOLD = MAX_ZOOM * 0.9` — pointer events enabled
- Hero section keeps `active` class always (char-cloud.js needs it to render)

### 4.5 Hero Canvas (public/js/char-cloud.js)

- Background: `#1C48E8` (blue)
- Text: "Beyond" / "Aesthetics" in HouseSansComp italic bold
- Character grid with mask-based brightness, noise displacement, 3D perspective projection
- Intro: glitchy matrix reveal (1.6s duration, green->white)
- Outro: reverse de-reveal (exposed via `window.triggerHeroOutro()` / `window.resetHeroIntro()`)
- Effects: mouse repel, chromatic aberration on hover, global glitch tears, diagonal ASCII wave (3-5s intervals with turbulence), ambient floating characters
- Font loading: 3s timeout to prevent hanging on slow connections

### 4.6 Post-Processing Pipeline (in order)

1. **RenderPass** — base scene render
2. **UnrealBloomPass** — strength=0.08, radius=0.2, threshold=0.95
3. **AfterimagePass** — motion blur, dynamically driven by rotation delta (0 at rest, up to 0.2)
4. **Vignette** — custom shader, darkness=1.6
5. **Chromatic Aberration** — custom shader, intensity=0.003 + boost during rotation
6. **Film Grain** — custom shader, intensity=0.005
7. **Color Grading** — teal shadows / warm highlights, intensity=0.12, slight saturation boost (1.08)
8. **OutputPass** — tone mapping + color space

### 4.7 Lighting

| Light | Type | Intensity | Position/Notes |
|-------|------|-----------|----------------|
| ambientLight | Ambient | 4.5 | Global fill |
| spotLight | SpotLight | 240 | y=15, points at y=-7.5, angle=PI/2.5 |
| floorLight | PointLight | 75 | y=-4, range=50 |
| screenLight | PointLight | 15 | Attached to cameraRig, follows camera |
| camLight | SpotLight | 120 | Attached to camera, points at floor |

- Tone mapping: ACESFilmicToneMapping, exposure=1.2
- HDRI: NightEnvironmentHDRI007_2K_HDR.exr, intensity=1.35, continuously rotating (0.0003 rad/frame)

### 4.8 Render Loop Animations

- Screen glitch system (skip hero): random UV shift + emissive flicker, 50-200ms, every 3-11s
- Screen breathing (skip hero): emissive pulse via sin(now * 0.001) * 0.15, base=2.0
- Screen floating: Y bob (0.12 units) + X drift (0.03 units), phase-offset per screen
- Starfield slow rotation
- HDRI environment rotation
- Inner platform ring rotation
- Cable pulse dot animation
- Holographic fragment orbit + bob
- Ember particle drift + mouse reactivity
- Floating particle drift + mouse reactivity + opacity response
- Chromatic aberration boost during camera rotation
- Motion blur (afterimage) driven by rotation delta

---

## 5. Rendering & Performance

**Optimizations applied:**
- `antialias: false`, `powerPreference: 'high-performance'`
- Pixel ratio capped at 1.5
- Reduced counts: STAR_COUNT=800, PARTICLE_COUNT=200, HOLO_COUNT=8, SEGS=48
- Only 5 lights (down from 13 originally)
- Reflector: 512x512 texture resolution
- Stats.js monitor visible (top-right) — remove for production

---

## 6. Known Issues & Critical Gotchas

### Hero Screen Visibility (RECURRING ISSUE)
The hero screen content becomes invisible if:
- Material is MeshPhysicalMaterial (emissive + ACES = washed out)
- `toneMapped` is not set to `false`
- `emissiveIntensity` is too high on any MeshPhysicalMaterial variant
- **Fix:** Hero MUST use `MeshBasicMaterial` with `toneMapped: false`. This bypasses all lighting and tone mapping. The material swap happens in `initHeroTexture()` (line ~222-230).

### Vite Static Assets
- Assets in `public/` must be referenced with absolute paths starting with `/`
- Non-module scripts (char-cloud.js, navbar.js) are NOT bundled by Vite — they live in `public/js/`
- `assetsDir: '_assets'` in vite.config.js to avoid case collision with `public/Assets/` on case-insensitive macOS vs case-sensitive Linux

### Deployment (Render)
- Build: `vite build`
- Start: `vite preview --host 0.0.0.0 --port $PORT`
- `allowedHosts: ['dash8-website.onrender.com']` in vite.config.js
- Font loading has 3s timeout to prevent hero hanging on slow connections

---

## 7. Current State & Uncommitted Changes

**Last pushed commit:** `ea5a80e` — "Blue hero bg, diagonal ASCII wave, HDRI rotation, performance optimizations"

**Uncommitted changes since last push:**
- Camera tumble direction inverted (opposite to mouse movement)
- Horizontal camera tilt reduced by 40% (maxTiltY: 0.1 -> 0.06)
- Camera smoothing slowed (PARALLAX_SMOOTH: 0.02 -> 0.008)
- Screens grouped into THREE.Group for floating animation (Y bob + X drift)
- Navbar hidden via `display: none !important` in CSS (temporarily — user will say when to restore)

---

## 8. Design Tokens & Colors

```css
--bg:     #0a0a0a    /* Page/scene background */
--fg:     #e8e8e8    /* Primary text */
--dim:    #666        /* Secondary text */
--accent: #ff3d00    /* Orange accent */
--blue:   #1C4FE8    /* Brand blue (hero bg, CTA, accents) */
```

- Hero background: `#1C48E8` (slightly different shade, set in char-cloud.js)
- Hero loader background: `#1C48E8`
- Screen text: `rgba(234,234,234,alpha)`
- Floor grid lines: white-ish `rgba(180-200, 190-225, 210-225, 0.2-0.29)`

---

## 9. Fonts

| Font | Usage | Source |
|------|-------|--------|
| JetBrains Mono | Body, glyphs, navbar scramble | Google Fonts |
| Micro 5 | Navbar links, section labels | Google Fonts |
| HouseSansComp | Hero display text ("Beyond Aesthetics") | Local (public/Font/) |
| Share Tech Mono | Loaded but not actively used | Google Fonts |
| SneakersMax | Defined in CSS but not actively used | Local (Font/) |

---

## 10. Git History

```
ea5a80e Blue hero bg, diagonal ASCII wave, HDRI rotation, performance optimizations
d425eb3 Camera tumble, floor grid visibility tuning, and cleanup
594e0f5 Revert hero screen to known working state
f4ad66c Boost hero screen emissive and disable glass effect on it for reliable visibility
a2d8a71 Fix HDRI path to absolute and add error logging
2f7e49b Move static assets to public/ for proper Vite production builds
4f519bb Copy char-cloud.js and navbar.js to dist via vite-plugin-static-copy
d0072d6 Add 3s timeout to font loading so hero doesn't hang on slow connections
80d7cd7 Add vite config to allow Render host
4418242 Add start script for Render deployment
bde15a5 Initial commit
```

---

## 11. Section Content Status

| Section | Content | Status |
|---------|---------|--------|
| Hero | ASCII character cloud with "Beyond Aesthetics" | Fully implemented |
| About | Placeholder ("Content goes here") | Not started |
| Projects | Placeholder ("Content goes here") | Not started |
| Contact | Placeholder ("Content goes here") | Not started |

---

## 12. Key Line References (src/main.js)

| Feature | Approx. Lines |
|---------|---------------|
| Scene setup, fog, starfield | 30-74 |
| Camera, renderer | 76-87 |
| Screen config, SECTIONS array | 88-100 |
| Screen mesh creation + groups | 133-201 |
| Hero texture swap (MeshBasicMaterial) | 210-232 |
| HDRI loading | 234-246 |
| Lighting | 248-278 |
| Platform | 281-314 |
| Floor cables + pulse dots | 316-351 |
| Holographic fragments | 354-415 |
| Ember particles | 417-455 |
| Floating particles | 458-482 |
| Post-processing chain | 484-632 |
| Sci-fi floor texture + reflector + fade mask | 634-829 |
| Camera state + GSAP timeline | 834-891 |
| Overlay management | 893-941 |
| Nav click handlers | 943-958 |
| Mouse parallax | 960-968 |
| Glitch system | 971-1026 |
| Render loop | 1030-1154 |
| Resize handler | 1156-1162 |
