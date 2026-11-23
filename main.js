/* =========================================================
   지구와 달 과학 놀이터 — main.js
   Three.js(ES Module + importmap)로 만든 두 개의 3D 관찰 화면
   1) 낮과 밤 : 태양 · 자전하는 지구 · 낮/밤 라벨
   2) 밀물과 썰물 : 지구 · 공전하는 달 · 부풀어 오르는 바닷물
   ========================================================= */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ---------------------------------------------------------
   0. 작은 도구들
   --------------------------------------------------------- */

/** 씨앗 고정 난수 (매번 같은 지구/달이 그려지도록) */
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

const TEX_W = 2048;
const TEX_H = 1024;
const DEG = TEX_W / 360; // 1도당 픽셀 (세로도 동일: 2048 / 360 == 1024 / 180)

/** 경도·위도 중심에 살짝 일그러진 섬 모양 path를 만든다 */
function blobPath(cx, cy, rx, ry, random, wobble = 0.16, points = 64) {
  const path = new Path2D();
  const phase = random() * Math.PI * 2;
  const k1 = 2 + Math.floor(random() * 2);
  const k2 = 4 + Math.floor(random() * 3);
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const noise =
      1 +
      wobble * Math.sin(a * k1 + phase) +
      wobble * 0.55 * Math.sin(a * k2 + phase * 1.7);
    const x = cx + Math.cos(a) * rx * noise;
    const y = cy + Math.sin(a) * ry * noise;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/* ---------------------------------------------------------
   1. 절차적 텍스처 (지구 낮 / 지구 밤 / 달 / 태양 글로우)
   --------------------------------------------------------- */

const LAND = [
  // [이름, 중심 경도, 중심 위도, 가로 반지름(도), 세로 반지름(도)]
  ["북아메리카", -100, 49, 36, 16],
  ["알래스카", -152, 63, 13, 7],
  ["중앙아메리카", -86, 15, 9, 5],
  ["그린란드", -42, 73, 13, 6.5],
  ["남아메리카", -60, -13, 14, 19],
  ["아프리카", 19, 3, 21, 23],
  ["유럽", 16, 50, 16, 8],
  ["중동", 45, 27, 9, 8],
  ["아시아", 96, 47, 41, 19],
  ["인도", 79, 20, 8.5, 9.5],
  ["동남아시아", 108, 2, 12, 8],
  ["호주", 134, -25, 14, 8.5],
  ["뉴질랜드", 173, -42, 4.5, 4],
  ["마다가스카르", 47, -19, 4, 7],
  ["일본", 138, 37, 3.6, 6.5],
];

/** 밤에 반짝이는 주요 도시 (경도, 위도, 텍스처 불빛 개수) */
const CITY_LIGHTS = [
    [126.9, 37.5, 58],
    [139.7, 35.7, 70],
    [121.5, 31.2, 62],
    [113.3, 23.1, 55],
    [116.4, 39.9, 40],
    [77.2, 28.6, 44],
    [72.8, 19.1, 38],
    [88.4, 22.6, 32],
    [100.5, 13.8, 32],
    [103.8, 1.35, 26],
    [106.8, -6.2, 34],
    [114.2, 30.6, 30],
    [104.9, 11.6, 22],
    [-74.0, 40.7, 52],
    [-87.6, 41.9, 30],
    [-118.2, 34.0, 44],
    [-95.4, 29.8, 26],
    [-122.4, 37.8, 24],
    [-79.4, 43.7, 24],
    [-99.1, 19.4, 38],
    [-46.6, -23.5, 40],
    [-58.4, -34.6, 28],
    [-70.7, -33.4, 20],
    [-43.2, -22.9, 22],
    [-0.13, 51.5, 34],
    [2.35, 48.85, 34],
    [13.4, 52.5, 26],
    [12.5, 41.9, 22],
    [4.9, 52.4, 20],
    [37.6, 55.75, 34],
    [30.3, 59.9, 20],
    [28.98, 41.0, 30],
    [31.2, 30.0, 26],
    [3.4, 6.5, 34],
    [28.0, -26.2, 22],
    [151.2, -33.9, 26],
    [144.9, -37.8, 20],
    [153.0, -27.5, 16],
  
];

const DESERTS = [
  // [경도, 위도, 반지름(도), 불투명도]
  [12, 23, 17, 0.42],
  [45, 22, 10, 0.4],
  [133, -24, 11, 0.34],
  [100, 41, 10, 0.26],
  [-70, -23, 5, 0.28],
  [24, -22, 8, 0.2],
];

function paintEarthTextures() {
  const random = seededRandom(20261123);
  const shapes = LAND.map(([, lon, lat, rxDeg, ryDeg]) => {
    const x = (lon + 180) * DEG;
    const y = (90 - lat) * DEG;
    return {
      x,
      y,
      rx: rxDeg * DEG,
      ry: ryDeg * DEG,
      path: blobPath(x, y, rxDeg * DEG, ryDeg * DEG, random, 0.17, 72),
    };
  });

  /* ---------- 낮 텍스처 ---------- */
  const dayCanvas = makeCanvas(TEX_W, TEX_H);
  const day = dayCanvas.getContext("2d");

  const ocean = day.createLinearGradient(0, 0, 0, TEX_H);
  ocean.addColorStop(0, "#0e3243");
  ocean.addColorStop(0.22, "#15475c");
  ocean.addColorStop(0.42, "#1d5c73");
  ocean.addColorStop(0.52, "#246b84");
  ocean.addColorStop(0.68, "#195469");
  ocean.addColorStop(1, "#0e3445");
  day.fillStyle = ocean;
  day.fillRect(0, 0, TEX_W, TEX_H);

  // 바다의 은은한 물결
  for (let i = 0; i < 140; i += 1) {
    const x = random() * TEX_W;
    const y = random() * TEX_H;
    const r = 30 + random() * 190;
    const light = random() > 0.45;
    const g = day.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(
      0,
      light ? "rgba(120, 200, 220, 0.10)" : "rgba(4, 28, 44, 0.12)"
    );
    g.addColorStop(1, "rgba(4, 28, 44, 0)");
    day.fillStyle = g;
    day.beginPath();
    day.ellipse(x, y, r, r * (0.35 + random() * 0.3), random() * Math.PI, 0, Math.PI * 2);
    day.fill();
  }

  // 대륙 : 얕은 바다 빛 → 부드러운 해안 → 본색 → 밝은 고원 → 사막
  for (const shape of shapes) {
    day.save();
    day.strokeStyle = "rgba(96, 196, 208, 0.22)";
    day.lineWidth = 22;
    day.stroke(shape.path);
    day.restore();
  }

  for (const shape of shapes) {
    day.save();
    day.shadowColor = "rgba(96, 152, 98, 0.85)";
    day.shadowBlur = 24;
    day.fillStyle = "#5e9247";
    day.fill(shape.path);
    day.restore();
  }

  for (const shape of shapes) {
    day.save();
    day.fillStyle = "#5a8c42";
    day.fill(shape.path);
    day.strokeStyle = "rgba(36, 72, 50, 0.45)";
    day.lineWidth = 6;
    day.stroke(shape.path);
    day.restore();
  }

  for (const shape of shapes) {
    day.save();
    day.clip(shape.path);
    for (let i = 0; i < 7; i += 1) {
      const cx = shape.x + (random() - 0.5) * shape.rx * 1.1;
      const cy = shape.y + (random() - 0.5) * shape.ry * 1.1;
      const r = (0.18 + random() * 0.4) * Math.max(shape.rx, shape.ry);
      const g = day.createRadialGradient(cx, cy, 0, cx, cy, r);
      const bright = random() > 0.4;
      g.addColorStop(
        0,
        bright ? "rgba(160, 200, 108, 0.6)" : "rgba(56, 102, 56, 0.5)"
      );
      g.addColorStop(1, "rgba(58, 104, 58, 0)");
      day.fillStyle = g;
      day.beginPath();
      day.arc(cx, cy, r, 0, Math.PI * 2);
      day.fill();
    }
    day.restore();
  }

  for (const [lon, lat, rDeg, alpha] of DESERTS) {
    const cx = (lon + 180) * DEG;
    const cy = (90 - lat) * DEG;
    const r = rDeg * DEG;
    const g = day.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(206, 186, 122, ${alpha})`);
    g.addColorStop(0.65, `rgba(198, 176, 112, ${alpha * 0.55})`);
    g.addColorStop(1, "rgba(198, 176, 112, 0)");
    day.save();
    day.globalCompositeOperation = "source-atop";
    day.fillStyle = g;
    day.beginPath();
    day.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2);
    day.fill();
    day.restore();
  }

  // 극지방의 얼음
  const north = day.createLinearGradient(0, 0, 0, TEX_H * 0.1);
  north.addColorStop(0, "rgba(238, 248, 255, 0.96)");
  north.addColorStop(0.6, "rgba(226, 242, 252, 0.55)");
  north.addColorStop(1, "rgba(226, 242, 252, 0)");
  day.fillStyle = north;
  day.fillRect(0, 0, TEX_W, TEX_H * 0.1);

  const south = day.createLinearGradient(0, TEX_H, 0, TEX_H * 0.9);
  south.addColorStop(0, "rgba(242, 249, 255, 0.98)");
  south.addColorStop(0.55, "rgba(232, 244, 254, 0.75)");
  south.addColorStop(1, "rgba(232, 244, 254, 0)");
  day.fillStyle = south;
  day.fillRect(0, TEX_H * 0.9, TEX_W, TEX_H * 0.1);

  /* ---------- 대륙 마스크 (도시 불빛 위치 계산용) ---------- */
  const maskCanvas = makeCanvas(TEX_W, TEX_H);
  const mask = maskCanvas.getContext("2d");
  mask.fillStyle = "#000000";
  mask.fillRect(0, 0, TEX_W, TEX_H);
  mask.fillStyle = "#ffffff";
  for (const shape of shapes) mask.fill(shape.path);
  const maskData = mask.getImageData(0, 0, TEX_W, TEX_H).data;

  /* ---------- 밤 텍스처 ---------- */
  const nightCanvas = makeCanvas(TEX_W, TEX_H);
  const night = nightCanvas.getContext("2d");
  const nightBg = night.createLinearGradient(0, 0, 0, TEX_H);
  nightBg.addColorStop(0, "#050a14");
  nightBg.addColorStop(0.5, "#071120");
  nightBg.addColorStop(1, "#050a14");
  night.fillStyle = nightBg;
  night.fillRect(0, 0, TEX_W, TEX_H);

  // 밤에도 아주 흐릿하게 보이는 땅
  night.fillStyle = "#0d1c26";
  for (const shape of shapes) night.fill(shape.path);

  const isLand = (px, py) => {
    const x = Math.min(TEX_W - 1, Math.max(0, Math.floor(px)));
    const y = Math.min(TEX_H - 1, Math.max(0, Math.floor(py)));
    return maskData[(y * TEX_W + x) * 4] > 128;
  };

  night.globalCompositeOperation = "lighter";

  const drawLight = (x, y, radius, alpha) => {
    const g = night.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255, 236, 184, ${alpha})`);
    g.addColorStop(0.45, `rgba(255, 214, 132, ${alpha * 0.55})`);
    g.addColorStop(1, "rgba(255, 196, 96, 0)");
    night.fillStyle = g;
    night.beginPath();
    night.arc(x, y, radius, 0, Math.PI * 2);
    night.fill();
  };

  // 땅 위에 흩어진 작은 불빛
  let placed = 0;
  let guard = 0;
  while (placed < 900 && guard < 60000) {
    guard += 1;
    const x = random() * TEX_W;
    const y = random() * TEX_H;
    if (!isLand(x, y)) continue;
    const lat = 90 - (y / TEX_H) * 180;
    const weight = 0.25 + 0.75 * Math.exp(-Math.pow((Math.abs(lat) - 40) / 26, 2));
    if (random() > weight) continue;
    drawLight(x, y, 2.6 + random() * 4.4, 0.55 + random() * 0.45);
    placed += 1;
  }


  for (const [lon, lat, count] of CITY_LIGHTS) {
    const cx = (lon + 180) * DEG;
    const cy = (90 - lat) * DEG;
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const spread = Math.pow(random(), 0.55) * 2.1 * DEG;
      drawLight(
        cx + Math.cos(angle) * spread,
        cy + Math.sin(angle) * spread * 0.8,
        2.4 + random() * 4.2,
        0.6 + random() * 0.4
      );
    }
  }
  night.globalCompositeOperation = "source-over";

  const dayTexture = new THREE.CanvasTexture(dayCanvas);
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  dayTexture.anisotropy = 4;

  const nightTexture = new THREE.CanvasTexture(nightCanvas);
  nightTexture.colorSpace = THREE.SRGBColorSpace;
  nightTexture.anisotropy = 4;

  return { dayTexture, nightTexture };
}

function paintMoonTexture() {
  const random = seededRandom(77531);
  const canvas = makeCanvas(1024, 512);
  const ctx = canvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, "#d8d5cc");
  base.addColorStop(0.45, "#c9c6bc");
  base.addColorStop(0.75, "#c2bfb5");
  base.addColorStop(1, "#cdcabf");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);

  // 바다(어두운 평원)
  for (let i = 0; i < 10; i += 1) {
    const x = random() * 1024;
    const y = 120 + random() * 270;
    const rx = 45 + random() * 110;
    const ry = rx * (0.45 + random() * 0.35);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, "rgba(126, 122, 114, 0.42)");
    g.addColorStop(0.7, "rgba(136, 132, 123, 0.24)");
    g.addColorStop(1, "rgba(136, 132, 123, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 크레이터
  for (let i = 0; i < 150; i += 1) {
    const x = random() * 1024;
    const y = random() * 512;
    const r = 2.5 + Math.pow(random(), 2.1) * 30;
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, "rgba(150, 146, 136, 0.55)");
    g.addColorStop(0.72, "rgba(178, 174, 163, 0.28)");
    g.addColorStop(1, "rgba(226, 223, 212, 0.5)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(240, 238, 229, 0.42)";
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.94, Math.PI * 0.15, Math.PI * 1.25);
    ctx.stroke();

    ctx.fillStyle = "rgba(112, 108, 100, 0.16)";
    ctx.beginPath();
    ctx.arc(x + r * 0.16, y + r * 0.2, r * 0.68, 0, Math.PI * 2);
    ctx.fill();
  }

  // 미세한 반점
  for (let i = 0; i < 2600; i += 1) {
    const x = random() * 1024;
    const y = random() * 512;
    const a = 0.03 + random() * 0.07;
    ctx.fillStyle = random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(80,76,70,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function paintGlowTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255, 250, 220, 1)");
  g.addColorStop(0.18, "rgba(255, 232, 150, 0.9)");
  g.addColorStop(0.34, "rgba(255, 210, 110, 0.45)");
  g.addColorStop(0.6, "rgba(255, 186, 80, 0.14)");
  g.addColorStop(1, "rgba(255, 170, 60, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 태양 주변을 감싸는 고리 모양의 빛무리 */
function paintHaloTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255, 228, 140, 0)");
  g.addColorStop(0.3, "rgba(255, 224, 128, 0)");
  g.addColorStop(0.4, "rgba(255, 216, 110, 0.4)");
  g.addColorStop(0.55, "rgba(255, 198, 88, 0.22)");
  g.addColorStop(0.75, "rgba(255, 180, 70, 0.07)");
  g.addColorStop(1, "rgba(255, 170, 60, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const textureCache = {};
function getTextures() {
  if (!textureCache.earth) {
    textureCache.earth = paintEarthTextures();
    textureCache.moon = paintMoonTexture();
    textureCache.glow = paintGlowTexture();
    textureCache.halo = paintHaloTexture();
  }
  return {
    dayTexture: textureCache.earth.dayTexture,
    nightTexture: textureCache.earth.nightTexture,
    moonTexture: textureCache.moon,
    glowTexture: textureCache.glow,
    haloTexture: textureCache.halo,
  };
}

/* ---------------------------------------------------------
   2. 공통 3D 재료
   --------------------------------------------------------- */

const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  uniform vec3 rimColor;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndl = dot(n, sunDirection);

    // 낮과 밤의 경계를 부드럽게 섞는다
    float daylight = smoothstep(-0.07, 0.24, ndl);
    vec3 dayColor = texture2D(dayMap, vUv).rgb * (0.72 + 0.32 * clamp(ndl, 0.0, 1.0));
    vec3 nightColor = texture2D(nightMap, vUv).rgb;
    vec3 color = mix(nightColor, dayColor, daylight);

    // 경계선 바로 옆, 낮 쪽에만 아주 좁게 번지는 노을빛
    float warmBand = pow(clamp(1.0 - abs(ndl), 0.0, 1.0), 14.0);
    color += vec3(0.36, 0.17, 0.06) * warmBand * smoothstep(-0.02, 0.12, ndl) * 0.32;

    // 가장자리의 대기 산란
    float fresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.6);
    color += rimColor * fresnel * (0.18 + 0.55 * clamp(ndl, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

function createEarthMaterial(sunDirection) {
  const { dayTexture, nightTexture } = getTextures();
  return new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: dayTexture },
      nightMap: { value: nightTexture },
      sunDirection: { value: sunDirection.clone().normalize() },
      rimColor: { value: new THREE.Color(0x4a9fe0) },
    },
    vertexShader: EARTH_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
  });
}

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 glowColor;

  varying vec3 vNormalV;
  varying vec3 vViewPos;

  void main() {
    float fresnel = pow(clamp(1.0 - abs(dot(vNormalV, normalize(-vViewPos))), 0.0, 1.0), 2.4);
    gl_FragColor = vec4(glowColor, fresnel * 0.85);
    #include <colorspace_fragment>
  }
`;

function createAtmosphereMaterial(color = 0x69c4ff) {  return new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(color) } },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

const WATER_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  uniform vec3 waterColor;
  uniform vec3 rimColor;

  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // 가운데는 거의 투명하고 가장자리만 푸르게 빛나는 유리 같은 바닷물
    float fresnel = pow(1.0 - clamp(abs(dot(n, viewDir)), 0.0, 1.0), 3.0);
    float alpha = 0.028 + 0.6 * fresnel;
    vec3 color = mix(waterColor, rimColor, clamp(fresnel * 1.7, 0.0, 1.0));

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.9));
    #include <colorspace_fragment>
  }
`;

function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      waterColor: { value: new THREE.Color(0x2c8fc4) },
      rimColor: { value: new THREE.Color(0x9fe6ff) },
    },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/* 밤 반구에서만 보이는 도시 불빛 (3D 점) */
const CITY_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;

  uniform vec3 sunDirection;
  uniform float pixelScale;

  varying vec3 vColor;
  varying float vNight;

  void main() {
    vec3 worldNormal = normalize(mat3(modelMatrix) * normalize(position));
    float ndl = dot(worldNormal, sunDirection);
    vNight = 1.0 - smoothstep(-0.20, 0.06, ndl);
    vColor = aColor;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * pixelScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const CITY_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vNight;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.06, d) * vNight;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

function createCityLights(radius, sunDirection) {
  const positions = [];
  const colors = [];
  const sizes = [];
  const random = seededRandom(5150);
  const color = new THREE.Color();

  for (const [lon, lat] of CITY_LIGHTS) {
    for (let i = 0; i < 2; i += 1) {
      const l = lon + (random() - 0.5) * 2.6;
      const b = lat + (random() - 0.5) * 2.2;
      const phi = ((l + 180) / 360) * Math.PI * 2;
      const theta = ((90 + b) / 180) * Math.PI;
      positions.push(
        -radius * Math.cos(phi) * Math.sin(theta),
        radius * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      color.setHSL(0.11, 0.72, 0.62 + random() * 0.22);
      colors.push(color.r, color.g, color.b);
      sizes.push(0.026 + random() * 0.03);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: sunDirection.clone().normalize() },
      pixelScale: { value: 700 },
    },
    vertexShader: CITY_VERTEX,
    fragmentShader: CITY_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { points: new THREE.Points(geometry, material), material };
}

function createStarLayer(seed) {
  const group = new THREE.Group();
  const random = seededRandom(seed);

  const build = (count, size, opacity, bright) => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 26 + random() * 54;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const warm = random();
      const color = new THREE.Color();
      color.setHSL(0.58 - warm * 0.13, warm * 0.3, bright ? 0.88 : 0.6 + random() * 0.35);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    return new THREE.Points(geometry, material);
  };

  group.add(build(1500, 0.075, 0.85, false));
  group.add(build(160, 0.17, 1, true));
  return group;
}

/* ---------------------------------------------------------
   3. 무대 공통
   --------------------------------------------------------- */

function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function applyResponsiveFraming(camera, controls, width, height, options) {
  const aspect = width / height;
  const wide = THREE.MathUtils.clamp((aspect - 0.85) / 0.75, 0, 1);
  const targetX = THREE.MathUtils.lerp(options.narrowTargetX, options.wideTargetX, wide);
  const distance = THREE.MathUtils.lerp(options.narrowDistance, options.wideDistance, wide);

  controls.target.set(targetX, options.targetY || 0, 0);
  camera.position.copy(controls.target).addScaledVector(options.direction, distance);
  controls.update();
}

function projectChip(chip, worldPosition, camera, width, height) {
  const projected = worldPosition.clone().project(camera);
  const visible = projected.z < 1;
  chip.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
  chip.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
  chip.classList.toggle("is-visible", visible);
}

function setupBodyPicking({ canvas, stage, camera, targets }) {
  const info = stage.querySelector("[data-info]");
  if (!info) return;
  const titleEl = info.querySelector(".body-info__title");
  const textEl = info.querySelector(".body-info__text");
  const closeButton = info.querySelector(".body-info__close");
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  let hideTimer = 0;

  closeButton.addEventListener("click", () => {
    info.hidden = true;
  });

  canvas.addEventListener("pointerdown", (event) => {
    down = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > 8) return;

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(targets, false);

    if (!hits.length) {
      info.hidden = true;
      return;
    }
    const body = hits[0].object.userData.body;
    if (!body) return;

    titleEl.textContent = body.title;
    textEl.textContent = body.text;
    info.hidden = false;
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      info.hidden = true;
    }, 12000);
  });
}

/* ---------------------------------------------------------
   4. 무대 1 — 낮과 밤이 생기는 이유
   --------------------------------------------------------- */

function buildDayNightScene(canvas) {
  const stage = canvas.closest(".stage");
  const { glowTexture, haloTexture } = getTextures();

  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(0.1, 1.25, 11.5);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(1.3, 0.05, 0);
  const framing = {
    direction: new THREE.Vector3(-1.2, 1.2, 11.5).normalize(),
    wideTargetX: 1.3,
    narrowTargetX: 0.15,
    wideDistance: 11.62,
    narrowDistance: 16.4,
    targetY: 0.05,
  };  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;
  controls.minDistance = 7.5;
  controls.maxDistance = 17;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = Math.PI - 0.6;
  controls.update();

  scene.add(createStarLayer(11));

  /* ---- 태양 ---- */
  const sunPosition = new THREE.Vector3(-3.7, 0.32, 0);
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd45e })
  );
  sunMesh.position.copy(sunPosition);
  sunMesh.userData.body = {
    title: "태양",
    text: "태양은 스스로 빛과 열을 내는 커다란 별이에요. 지구보다 약 109배나 커요. 지구는 이 빛 덕분에 밝아지고 따뜻해져요.",
  };
  scene.add(sunMesh);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTexture,
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    })
  );
  glow.scale.set(5.2, 5.2, 1);
  glow.position.copy(sunPosition);
  glow.renderOrder = -1;
  scene.add(glow);

  /* ---- 지구 ---- */
  const earthPosition = new THREE.Vector3(1.0, 0, 0);
  const earthRadius = 1.45;
  const sunDirection = sunPosition.clone().sub(earthPosition).normalize();

  const earthGroup = new THREE.Group();
  earthGroup.position.copy(earthPosition);
  earthGroup.rotation.z = -0.2;
  scene.add(earthGroup);

  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius, 96, 72),
    createEarthMaterial(sunDirection)
  );
  earthMesh.rotation.y = -Math.PI * 0.5;
  earthMesh.userData.body = {
    title: "지구",
    text: "지구는 하루에 한 번 스스로 돌면서 태양 둘레를 1년에 한 번 함께 돌아요. 우리가 살고 있는 행성이에요.",
  };
  earthGroup.add(earthMesh);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius * 1.055, 64, 48),
    createAtmosphereMaterial(0x5fb8ff)
  );
  atmosphere.renderOrder = 2;
  earthGroup.add(atmosphere);

  const cityLights = createCityLights(earthRadius * 1.004, sunDirection);
  earthMesh.add(cityLights.points);

  const earthGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x3f8fd6,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.32,
    })
  );
  earthGlow.scale.set(5.1, 5.1, 1);
  earthGlow.position.copy(earthPosition);
  earthGlow.renderOrder = -1;
  scene.add(earthGlow);

  /* ---- 라벨 ---- */
  const chips = {
    day: stage.querySelector('[data-chip="day"]'),
    night: stage.querySelector('[data-chip="night"]'),
  };
  const dayAnchor = new THREE.Vector3();
  const nightAnchor = new THREE.Vector3();
  const sunDirFlat = sunDirection.clone();

  /* ---- 상호작용 ---- */
  setupBodyPicking({
    canvas,
    stage,
    camera,
    targets: [earthMesh, sunMesh],
  });

  let elapsed = 0;

  return {
    scene,
    camera,
    renderer,
    controls,

    resize(width, height) {
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      applyResponsiveFraming(camera, controls, width, height, framing);
      cityLights.material.uniforms.pixelScale.value =
        (height * renderer.getPixelRatio()) /
        (2 * Math.tan((camera.fov * Math.PI) / 360));
    },

    update(dt, state) {
      elapsed += dt;
      if (!state.paused) {
        earthMesh.rotation.y += dt * 0.32 * state.speed;
      }
      controls.update();

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      dayAnchor
        .copy(earthPosition)
        .addScaledVector(sunDirFlat, earthRadius * 0.42)
        .add(new THREE.Vector3(0, earthRadius * 0.92, earthRadius * 0.5));
      nightAnchor
        .copy(earthPosition)
        .addScaledVector(sunDirFlat, -earthRadius * 1.02)
        .add(new THREE.Vector3(0, -earthRadius * 0.52, earthRadius * 0.45));

      projectChip(chips.day, dayAnchor, camera, width, height);
      projectChip(chips.night, nightAnchor, camera, width, height);
    },
  };
}

/* ---------------------------------------------------------
   5. 무대 2 — 밀물과 썰물이 생기는 이유
   --------------------------------------------------------- */

function buildTidesScene(canvas) {
  const stage = canvas.closest(".stage");
  const { moonTexture } = getTextures();

  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(0.1, 2.1, 12.2);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.75, 0, 0);
  const framing = {
    direction: new THREE.Vector3(-0.65, 2.1, 12.2).normalize(),
    wideTargetX: 0.75,
    narrowTargetX: -0.55,
    wideDistance: 12.39,
    narrowDistance: 16.8,
    targetY: 0,
  };
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;
  controls.minDistance = 8;
  controls.maxDistance = 19;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = Math.PI - 0.6;
  controls.update();

  scene.add(createStarLayer(29));

  const sunDirection = new THREE.Vector3(-0.92, 0.24, 0.5).normalize();
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x0a1220, 0.8));
  const sunLight = new THREE.DirectionalLight(0xfff1cf, 2.9);
  sunLight.position.copy(sunDirection).multiplyScalar(20);
  scene.add(sunLight);

  /* ---- 지구 ---- */
  const earthPosition = new THREE.Vector3(0.45, 0, 0);
  const earthRadius = 1.35;

  const earthGroup = new THREE.Group();
  earthGroup.position.copy(earthPosition);
  earthGroup.rotation.z = -0.16;
  scene.add(earthGroup);

  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius, 96, 72),
    createEarthMaterial(sunDirection)
  );
  earthMesh.rotation.y = Math.PI * 0.35;
  earthMesh.userData.body = {
    title: "지구",
    text: "지구의 바닷물은 달과 지구가 서로 끌어당기는 힘 때문에 양쪽으로 살짝 부풀어 올라요. 그래서 물이 부푼 곳은 한 번에 두 군데예요.",
  };
  earthGroup.add(earthMesh);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius * 1.05, 64, 48),
    createAtmosphereMaterial(0x5fb8ff)
  );
  atmosphere.renderOrder = 2;
  earthGroup.add(atmosphere);

  const cityLights = createCityLights(earthRadius * 1.004, sunDirection);
  earthMesh.add(cityLights.points);

  /* ---- 바닷물 타원체 (달 쪽과 반대쪽이 부푼다) ---- */
  const tideGroup = new THREE.Group();
  tideGroup.position.copy(earthPosition);
  scene.add(tideGroup);

  const waterMaterial = createWaterMaterial();

  const waterMesh = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius * 1.015, 80, 56),
    waterMaterial
  );
  waterMesh.scale.set(1.42, 1.03, 1.02);
  waterMesh.renderOrder = 3;
  waterMesh.userData.body = {
    title: "바닷물",
    text: "달이 가까운 쪽과 그 반대쪽의 바닷물이 함께 부풀어 올라요. 물이 부푼 곳에서는 밀물이, 물이 빠지는 곳에서는 썰물이 나타나요.",
  };
  tideGroup.add(waterMesh);

  /* ---- 달 ---- */
  const orbit = new THREE.Group();
  orbit.position.copy(earthPosition);
  orbit.rotation.x = 0.16;
  scene.add(orbit);

  const moonPivot = new THREE.Group();
  orbit.add(moonPivot);

  const moonRadius = 0.48;
  const orbitRadius = 3.3;
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(moonRadius, 64, 48),
    new THREE.MeshStandardMaterial({
      map: moonTexture,
      roughness: 0.95,
      metalness: 0,
    })
  );
  moonMesh.position.set(-orbitRadius, 0, 0);
  moonMesh.rotation.y = Math.PI * 0.4;
  moonMesh.userData.body = {
    title: "달",
    text: "달은 지구의 유일한 자연 위성이에요. 지구 둘레를 한 달에 한 번쯤 돌면서 바닷물을 살짝 끌어당겨요.",
  };
  moonPivot.add(moonMesh);

  /* ---- 라벨 ---- */
  const chips = {
    a: stage.querySelector('[data-chip="tide-a"]'),
    b: stage.querySelector('[data-chip="tide-b"]'),
  };

  /* ---- 상호작용 ---- */
  setupBodyPicking({
    canvas,
    stage,
    camera,
    targets: [earthMesh, moonMesh, waterMesh],
  });

  const moonDirection = new THREE.Vector3();
  const chipA = new THREE.Vector3();
  const chipB = new THREE.Vector3();
  const moonWorld = new THREE.Vector3();
  let elapsed = 0;

  return {
    scene,
    camera,
    renderer,
    controls,

    resize(width, height) {
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      applyResponsiveFraming(camera, controls, width, height, framing);
      cityLights.material.uniforms.pixelScale.value =
        (height * renderer.getPixelRatio()) /
        (2 * Math.tan((camera.fov * Math.PI) / 360));
    },

    update(dt, state) {
      elapsed += dt;
      if (!state.paused) {
        moonPivot.rotation.y += dt * 0.26 * state.speed;
        earthMesh.rotation.y += dt * 0.12 * state.speed;
        waterMesh.scale.x = 1.42 + Math.sin(elapsed * 1.4) * 0.014;
      }
      controls.update();

      moonMesh.getWorldPosition(moonWorld);
      moonDirection
        .set(moonWorld.x - earthPosition.x, 0, moonWorld.z - earthPosition.z)
        .normalize();

      // 타원체의 긴 축을 달 쪽으로 맞춘다
      tideGroup.rotation.y = -Math.atan2(moonDirection.z, moonDirection.x);

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      chipA
        .copy(earthPosition)
        .addScaledVector(moonDirection, earthRadius * 1.55)
        .add(new THREE.Vector3(0, earthRadius * 0.16, earthRadius * 0.16));
      chipB
        .copy(earthPosition)
        .addScaledVector(moonDirection, -earthRadius * 1.55)
        .add(new THREE.Vector3(0, earthRadius * 0.02, earthRadius * 0.16));

      projectChip(chips.a, chipA, camera, width, height);
      projectChip(chips.b, chipB, camera, width, height);
    },
  };
}

/* ---------------------------------------------------------
   6. 음성 설명 (Web Speech API)
   --------------------------------------------------------- */

const NARRATION = {
  daynight: [
    "지구는 하루에 한 번 스스로 빙글빙글 돌아요. 이렇게 도는 것을 자전이라고 해요.",
    "태양은 스스로 빛을 내는 커다란 별이에요. 지구에서 태양 빛을 받는 쪽은 환하게 밝아서 낮이 돼요.",
    "빛이 닿지 않는 반대쪽은 어두워서 밤이 되고, 그곳에는 도시의 불빛이 반짝여요.",
    "지구가 자전하기 때문에 낮과 밤이 번갈아 찾아오고, 하루가 지나면 다시 아침이 와요.",
    "화면을 드래그해서 지구를 돌려 보면, 밝은 낮 쪽과 어두운 밤 쪽을 직접 확인할 수 있어요.",
  ],
  tides: [
    "달은 지구 둘레를 한 달에 한 번쯤 천천히 돌아요.",
    "달이 가까운 쪽의 바닷물은 달의 인력에 이끌려 살짝 부풀어 올라요. 이것을 밀물이라고 해요.",
    "지구와 달이 함께 돌면서 생기는 힘 때문에, 달 반대쪽의 바닷물도 똑같이 부풀어 올라요.",
    "지구가 스스로 돌면서 이 부푼 곳을 지나가면, 물이 들어오는 밀물과 빠져나가는 썰물이 번갈아 나타나요.",
    "그래서 바닷가에서는 하루에 두 번쯤 밀물과 썰물이 반복된답니다.",
  ],
};

function pickKoreanVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const korean = voices.filter((voice) => (voice.lang || "").toLowerCase().startsWith("ko"));
  if (!korean.length) return null;
  return (
    korean.find((voice) => /google|natural|neural/i.test(voice.name)) ||
    korean.find((voice) => /yuna|sora|jinho|mina/i.test(voice.name)) ||
    korean[0]
  );
}

class Narrator {
  constructor({ sentences, onSentence, onState }) {
    this.sentences = sentences;
    this.onSentence = onSentence || (() => {});
    this.onState = onState || (() => {});
    this.supported = "speechSynthesis" in window;
    this.token = 0;
    this.state = "idle";
    this.voice = null;

    if (this.supported) {
      const loadVoice = () => {
        this.voice = pickKoreanVoice();
      };
      loadVoice();
      window.speechSynthesis.addEventListener("voiceschanged", loadVoice);
    }
  }

  emit(state) {
    this.state = state;
    this.onState(state);
  }

  cancelAudio() {
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch (error) {
      /* 무시: 브라우저가 아직 준비되지 않은 경우 */
    }
  }

  async start() {
    this.token += 1;
    const token = this.token;
    this.cancelAudio();
    this.emit("playing");

    for (const sentence of this.sentences) {
      if (token !== this.token) return;
      this.onSentence(sentence);
      // eslint-disable-next-line no-await-in-loop
      await this.speak(sentence);
    }

    if (token === this.token) this.emit("done");
  }

  stop() {
    this.token += 1;
    this.cancelAudio();
    this.emit("stopped");
  }

  speak(text) {
    return new Promise((resolve) => {
      let settled = false;
      let safety = 0;
      const readTime = Math.max(2800, 1100 + text.length * 185);

      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safety);
        resolve();
      };

      if (!this.supported) {
        safety = window.setTimeout(finish, readTime);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = 0.94;
      utterance.pitch = 1.06;
      utterance.volume = 1;
      if (this.voice) utterance.voice = this.voice;

      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (event.error === "interrupted" || event.error === "canceled") {
          finish();
          return;
        }
        // 음성을 낼 수 없는 환경에서는 자막을 읽을 시간만큼만 기다린다
        if (!settled) {
          window.clearTimeout(safety);
          safety = window.setTimeout(finish, readTime);
        }
      };

      safety = window.setTimeout(finish, 7000 + text.length * 250);

      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        window.clearTimeout(safety);
        safety = window.setTimeout(finish, readTime);
      }
    });
  }
}

/* ---------------------------------------------------------
   7. 화면 조립
   --------------------------------------------------------- */

const engine = {
  active: "daynight",
  scenes: {},
  narrators: {},
  state: {
    daynight: { paused: false, speed: 1, played: false },
    tides: { paused: false, speed: 1, played: false },
  },
  captionTimers: {},
};

const toast = document.querySelector(".toast");
let toastTimer = 0;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function buildScene(tab) {
  if (engine.scenes[tab]) return engine.scenes[tab];
  const canvas =
    tab === "daynight"
      ? document.getElementById("canvas-daynight")
      : document.getElementById("canvas-tides");
  const scene =
    tab === "daynight"
      ? buildDayNightScene(canvas)
      : buildTidesScene(canvas);
  engine.scenes[tab] = scene;

  const stage = canvas.closest(".stage");
  scene.resize(stage.clientWidth, stage.clientHeight);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        scene.resize(width, height);
      }
    });
    observer.observe(stage);
    scene.observer = observer;
  }

  return scene;
}

function formatSpeed(value) {
  return `${value.toFixed(1)}배`;
}

function setupControls(tab) {
  const state = engine.state[tab];

  const pauseButton = document.querySelector(`[data-pause="${tab}"]`);
  const pauseLabel = pauseButton.querySelector(".btn-pause__label");

  const updatePause = () => {
    pauseButton.classList.toggle("is-paused", state.paused);
    pauseButton.setAttribute("aria-pressed", String(state.paused));
    pauseLabel.textContent = state.paused ? "이어서 보기" : "잠깐 멈추기";
  };
  updatePause();

  pauseButton.addEventListener("click", () => {
    state.paused = !state.paused;
    updatePause();
  });

  const slider = document.querySelector(`[data-speed="${tab}"]`);
  const output = document.getElementById(`speed-out-${tab}`);

  const updateSlider = () => {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const value = Number(slider.value);
    state.speed = value;
    output.textContent = formatSpeed(value);
    const percent = ((value - min) / (max - min)) * 100;
    slider.style.setProperty("--fill", `${percent}%`);
    slider.setAttribute("aria-valuetext", formatSpeed(value));
  };
  updateSlider();
  slider.addEventListener("input", updateSlider);
}

function showCaption(tab, text) {
  const caption = document.querySelector(`[data-caption="${tab}"]`);
  if (!caption) return;
  window.clearTimeout(engine.captionTimers[tab]);
  if (text) {
    caption.textContent = text;
    caption.hidden = false;
  } else {
    engine.captionTimers[tab] = window.setTimeout(() => {
      caption.hidden = true;
      caption.textContent = "";
    }, 2600);
  }
}

function refreshAudioButtons(tab) {
  const state = engine.state[tab];
  const narrator = engine.narrators[tab];
  const speaking = narrator ? narrator.state === "playing" : false;
  const secondary = state.played || tab === "tides";

  const play = document.querySelector(`[data-speak="${tab}"][data-role="play"]`);
  const stop = document.querySelector(`[data-speak="${tab}"][data-role="stop"]`);
  const replay = document.querySelector(`[data-speak="${tab}"][data-role="replay"]`);

  play.hidden = speaking;
  stop.hidden = !secondary;
  stop.disabled = !speaking;
  replay.hidden = !secondary;
}

function setupNarration(tab) {
  const state = engine.state[tab];
  let unsupportedNotified = false;

  const narrator = new Narrator({
    sentences: NARRATION[tab],
    onSentence(text) {
      showCaption(tab, text);
    },
    onState(status) {
      if (status === "playing") {
        state.played = true;
        refreshAudioButtons(tab);
        if (!narrator.supported && !unsupportedNotified) {
          unsupportedNotified = true;
          showToast("이 브라우저에서는 음성 읽기를 지원하지 않아요. 자막으로 설명을 보여 드릴게요.");
        }
      } else if (status === "done") {
        refreshAudioButtons(tab);
        showCaption(tab, null);
      } else if (status === "stopped") {
        refreshAudioButtons(tab);
        showCaption(tab, null);
      } else {
        refreshAudioButtons(tab);
      }
    },
  });
  engine.narrators[tab] = narrator;

  const play = document.querySelector(`[data-speak="${tab}"][data-role="play"]`);
  const stop = document.querySelector(`[data-speak="${tab}"][data-role="stop"]`);
  const replay = document.querySelector(`[data-speak="${tab}"][data-role="replay"]`);

  play.addEventListener("click", () => narrator.start());
  stop.addEventListener("click", () => narrator.stop());
  replay.addEventListener("click", () => narrator.start());

  refreshAudioButtons(tab);
}

function activateTab(tab) {
  if (engine.active === tab) return;

  const previous = engine.active;
  if (engine.narrators[previous]) engine.narrators[previous].stop();
  if (engine.scenes[previous]) engine.scenes[previous].controls.enabled = false;

  engine.active = tab;

  document.querySelectorAll(".tab").forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  document.querySelectorAll(".panel").forEach((panel) => {
    const isActive = panel.id === `panel-${tab}`;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  const scene = buildScene(tab);
  scene.controls.enabled = true;

  window.requestAnimationFrame(() => {
    const stage = scene.renderer.domElement.closest(".stage");
    scene.resize(stage.clientWidth, stage.clientHeight);
  });
}

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll(".tab"));
  tabs.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const index = tabs.indexOf(button);
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      activateTab(tabs[next].dataset.tab);
    });
  });
}

function startLoop() {
  let last = performance.now();

  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const scene = engine.scenes[engine.active];
    if (scene) {
      const state = engine.state[engine.active];
      scene.update(dt, state);
      scene.renderer.render(scene.scene, scene.camera);
    }
    window.requestAnimationFrame(frame);
  };

  window.requestAnimationFrame(frame);
}

function boot() {
  setupTabs();
  setupControls("daynight");
  setupControls("tides");
  setupNarration("daynight");
  setupNarration("tides");

  buildScene("daynight");
  buildScene("tides").controls.enabled = false;

  startLoop();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      Object.values(engine.narrators).forEach((narrator) => {
        if (narrator.state === "playing") narrator.stop();
      });
    }
  });

  window.addEventListener("pagehide", () => {
    Object.values(engine.narrators).forEach((narrator) => narrator.stop());
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
