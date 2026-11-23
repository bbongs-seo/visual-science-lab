/* 우주 레슨들이 함께 쓰는 천체: 지구 · 태양 · 달 · 별하늘 · 위치 핀
   지구·달 사진은 NASA 퍼블릭 도메인 이미지(public/textures), 구름과 빛무리는 캔버스로 그린다. */

import * as THREE from "three";

/* ---------------------------------------------------------
   텍스처
   --------------------------------------------------------- */

const loader = new THREE.TextureLoader();
const textureCache = new Map();
const pendingLoads = new Map();

export function loadTexture(file) {
  if (!textureCache.has(file)) {
    let done;
    pendingLoads.set(file, new Promise((resolve) => (done = resolve)));
    // 실패해도 로딩 화면이 영원히 남지 않도록 오류 때도 끝난 것으로 본다
    const texture = loader.load(`${import.meta.env.BASE_URL}textures/${file}`, done, undefined, done);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    textureCache.set(file, texture);
  }
  return textureCache.get(file);
}

export const texturesReady = () => Promise.all(pendingLoads.values());

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(width, height, paint, colorSpace = THREE.SRGBColorSpace) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  return texture;
}

const proceduralCache = new Map();
function cached(key, make) {
  if (!proceduralCache.has(key)) proceduralCache.set(key, make());
  return proceduralCache.get(key);
}

function radialTexture(stops) {
  return canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([at, color]) => g.addColorStop(at, color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

const glowTexture = () =>
  cached("glow", () =>
    radialTexture([
      [0, "rgba(255, 250, 225, 1)"],
      [0.2, "rgba(255, 226, 140, 0.85)"],
      [0.4, "rgba(255, 196, 90, 0.32)"],
      [0.7, "rgba(255, 160, 60, 0.08)"],
      [1, "rgba(255, 150, 50, 0)"],
    ])
  );

const coronaTexture = () =>
  cached("corona", () =>
    canvasTexture(512, 512, (ctx) => {
      // 가늘게 뻗는 햇살 줄기
      const random = seededRandom(404);
      ctx.translate(256, 256);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 70; i += 1) {
        const angle = random() * Math.PI * 2;
        const length = 120 + random() * 130;
        const width = 2 + random() * 7;
        ctx.save();
        ctx.rotate(angle);
        const g = ctx.createLinearGradient(0, 0, length, 0);
        g.addColorStop(0, "rgba(255, 214, 130, 0.22)");
        g.addColorStop(1, "rgba(255, 190, 90, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(40, -width);
        ctx.lineTo(length, 0);
        ctx.lineTo(40, width);
        ctx.fill();
        ctx.restore();
      }
    })
  );

/** 좌우 끝이 이어지는 구름 지도 (위도별로 구름이 많은 곳·적은 곳을 흉내 낸다) */
const cloudTexture = () =>
  cached("clouds", () => {
    const texture = canvasTexture(
      1024,
      512,
      (ctx, W, H) => {
        const random = seededRandom(2718);
        const octaves = [
          [6, 0.5],
          [12, 0.25],
          [24, 0.13],
          [48, 0.08],
          [96, 0.04],
        ].map(([cellsX, weight]) => {
          const cellsY = Math.max(2, Math.round(cellsX * 0.7));
          const grid = new Float32Array(cellsX * (cellsY + 1));
          for (let i = 0; i < grid.length; i += 1) grid[i] = random();
          return { cellsX, cellsY, weight, grid };
        });
        const smooth = (t) => t * t * (3 - 2 * t);
        const image = ctx.createImageData(W, H);

        for (let y = 0; y < H; y += 1) {
          const lat = 90 - (y / H) * 180;
          const absLat = Math.abs(lat);
          const band =
            0.5 +
            0.22 * Math.exp(-((lat / 7) ** 2)) -
            0.18 * Math.exp(-(((absLat - 24) / 9) ** 2)) +
            0.2 * Math.exp(-(((absLat - 55) / 12) ** 2)) -
            0.25 * Math.exp(-(((absLat - 90) / 12) ** 2));

          for (let x = 0; x < W; x += 1) {
            let value = 0;
            for (const { cellsX, cellsY, weight, grid } of octaves) {
              const fx = (x / W) * cellsX;
              const fy = (y / H) * cellsY;
              const x0 = Math.floor(fx);
              const y0 = Math.floor(fy);
              const x1 = (x0 + 1) % cellsX; // 경도 방향으로 이어 붙인다
              const tx = smooth(fx - x0);
              const ty = smooth(fy - y0);
              const row0 = y0 * cellsX;
              const row1 = (y0 + 1) * cellsX;
              const top = grid[row0 + x0] + (grid[row0 + x1] - grid[row0 + x0]) * tx;
              const bottom = grid[row1 + x0] + (grid[row1 + x1] - grid[row1 + x0]) * tx;
              value += (top + (bottom - top) * ty) * weight;
            }
            const cover = Math.min(1, Math.max(0, (value * band - 0.3) / 0.22));
            const i = (y * W + x) * 4;
            const v = Math.round(cover * 255);
            image.data[i] = v;
            image.data[i + 1] = v;
            image.data[i + 2] = v;
            image.data[i + 3] = 255;
          }
        }
        ctx.putImageData(image, 0, 0);
      },
      THREE.NoColorSpace
    );
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  });

/* ---------------------------------------------------------
   좌표
   --------------------------------------------------------- */

/** 위도·경도 → three.js SphereGeometry 텍스처 좌표와 맞는 3D 위치 */
export function latLonToVector3(lat, lon, radius) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(
    -radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/* ---------------------------------------------------------
   지구
   --------------------------------------------------------- */

const WORLD_VERTEX = /* glsl */ `
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
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;
  uniform float cloudShift;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorldPos);
    vec3 l = normalize(sunDirection);
    float ndl = dot(n, l);
    float daylight = smoothstep(-0.1, 0.16, ndl);

    // 낮: 위성 사진 + 바다 색 보정 + 햇빛 반사
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 gamma = sqrt(day);
    float ocean = smoothstep(0.05, 0.12, gamma.b - max(gamma.r, gamma.g));
    day = mix(day, vec3(0.006, 0.03, 0.12) + day * 1.3, ocean);
    float cloud = texture2D(cloudMap, vec2(vUv.x + cloudShift, vUv.y)).r;

    vec3 lit = day * (0.04 + 1.15 * max(ndl, 0.0));
    vec3 h = normalize(l + v);
    float glint = pow(max(dot(n, h), 0.0), 60.0) * ocean * (1.0 - cloud);
    lit += vec3(1.0, 0.86, 0.62) * glint * 0.7 * step(0.0, ndl);
    lit = mix(lit, vec3(0.95, 0.97, 1.0) * (0.03 + 1.05 * max(ndl, 0.0)), cloud * 0.82);

    // 밤: 도시 불빛만 따뜻하게 살리고 구름이 덮인 곳은 흐리게
    vec3 night = texture2D(nightMap, vUv).rgb;
    float lum = dot(night, vec3(0.299, 0.587, 0.114));
    vec3 lights = night * smoothstep(0.06, 0.4, lum) * vec3(1.5, 1.15, 0.7) * 1.8;
    vec3 dark = (night * 0.12 + lights) * (1.0 - cloud * 0.65);

    vec3 color = mix(dark, lit, daylight);

    // 낮과 밤 경계의 노을빛, 가장자리 대기
    float band = pow(clamp(1.0 - abs(ndl), 0.0, 1.0), 9.0);
    color += vec3(0.6, 0.22, 0.05) * band * smoothstep(-0.12, 0.08, ndl) * 0.22;
    float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    color += vec3(0.3, 0.58, 1.0) * fresnel * smoothstep(-0.25, 0.6, ndl) * 0.55;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 sunDirection;

  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.4);
    float lit = 0.12 + smoothstep(-0.35, 0.55, dot(n, normalize(sunDirection)));
    gl_FragColor = vec4(vec3(0.33, 0.66, 1.0) * fresnel * lit * 0.9, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * 위성 사진 지구. mesh 는 자전시키고, atmosphere 는 기울기 그룹에 함께 넣는다.
 * spin(라디안)을 넘기면 구름도 지표보다 조금 빠르게 흘러간다.
 */
export function createEarth(radius, sunDirection) {
  const direction = sunDirection.clone().normalize();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: loadTexture("earth-day.webp") },
      nightMap: { value: loadTexture("earth-night.webp") },
      cloudMap: { value: cloudTexture() },
      sunDirection: { value: direction },
      cloudShift: { value: 0 },
    },
    vertexShader: WORLD_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 72), material);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.045, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { sunDirection: { value: direction } },
      vertexShader: WORLD_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  atmosphere.renderOrder = 2;

  return {
    mesh,
    atmosphere,
    drift(amount) {
      material.uniforms.cloudShift.value = (material.uniforms.cloudShift.value + amount) % 1;
    },
  };
}

/* ---------------------------------------------------------
   태양
   --------------------------------------------------------- */

const SUN_VERTEX = /* glsl */ `
  varying vec3 vObjectPos;
  varying vec3 vNormalV;

  void main() {
    vObjectPos = position;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAGMENT = /* glsl */ `
  uniform float time;

  varying vec3 vObjectPos;
  varying vec3 vNormalV;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amp * noise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 p = normalize(vObjectPos) * 4.0;
    float boil = fbm(p + vec3(0.0, time * 0.06, time * 0.04));
    float cells = fbm(p * 3.2 - vec3(time * 0.12));
    float heat = boil * 0.6 + cells * 0.4;

    vec3 color = mix(vec3(1.0, 0.36, 0.04), vec3(1.0, 0.82, 0.38), smoothstep(0.32, 0.72, heat));
    color += vec3(1.0, 0.95, 0.75) * smoothstep(0.62, 0.85, heat) * 0.35;

    // 가장자리가 조금 어두워지는 태양 원반의 특징
    float mu = clamp(vNormalV.z, 0.0, 1.0);
    color *= 0.6 + 0.4 * pow(mu, 0.45);
    color += vec3(1.0, 0.9, 0.65) * pow(mu, 4.0) * 0.25;

    gl_FragColor = vec4(color * 1.25, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSun(radius) {
  const group = new THREE.Group();
  const uniforms = { time: { value: 0 } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 48),
    new THREE.ShaderMaterial({ uniforms, vertexShader: SUN_VERTEX, fragmentShader: SUN_FRAGMENT })
  );
  mesh.onBeforeRender = () => {
    uniforms.time.value = performance.now() / 1000;
  };
  group.add(mesh);

  const sprite = (map, scale, opacity) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity,
      })
    );
    s.scale.set(scale, scale, 1);
    s.renderOrder = -1;
    group.add(s);
    return s;
  };
  sprite(glowTexture(), radius * 4.2, 0.9);
  sprite(glowTexture(), radius * 9, 0.35);
  const corona = sprite(coronaTexture(), radius * 6.2, 0.55);
  corona.onBeforeRender = () => {
    corona.material.rotation = performance.now() / 40000;
  };

  return { group, mesh };
}

/* ---------------------------------------------------------
   달
   --------------------------------------------------------- */

export function createMoon(radius) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 48),
    new THREE.MeshStandardMaterial({
      map: loadTexture("moon.webp"),
      roughness: 1,
      metalness: 0,
    })
  );
}

/* ---------------------------------------------------------
   반짝이는 별하늘
   --------------------------------------------------------- */

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;

  uniform float time;
  uniform float pixelRatio;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = color;
    vTwinkle = 0.62 + 0.38 * sin(time * (0.5 + aPhase * 1.6) + aPhase * 40.0);
    gl_PointSize = aSize * pixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, d) * vTwinkle;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

export function createStars(seed, count = 1800) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const radius = 60 + random() * 30;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const warm = random();
    color.setHSL(0.6 - warm * 0.5, 0.25 + warm * 0.3, 0.75 + random() * 0.2);
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = random() < 0.06 ? 3 + random() * 2.2 : 1 + random() * 1.6;
    phases[i] = random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const uniforms = { time: { value: 0 }, pixelRatio: { value: 1 } };
  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    })
  );
  points.onBeforeRender = (renderer) => {
    uniforms.time.value = performance.now() / 1000;
    uniforms.pixelRatio.value = renderer.getPixelRatio();
  };
  return points;
}

/* ---------------------------------------------------------
   지표에 꽂는 위치 핀 (서울, 인천 등)
   --------------------------------------------------------- */

export function createPin(surfacePoint, { color = 0xff4d6d, height = 0.2 } = {}) {
  const normal = surfacePoint.clone().normalize();
  const pin = new THREE.Group();
  pin.position.copy(surfacePoint);
  pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, height, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  stick.position.y = height / 2;
  pin.add(stick);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 20, 14),
    new THREE.MeshBasicMaterial({ color })
  );
  head.position.y = height;
  pin.add(head);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.075, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  ring.onBeforeRender = () => {
    const t = (performance.now() / 1400) % 1;
    ring.scale.setScalar(1 + t * 1.6);
    ring.material.opacity = 0.85 * (1 - t);
  };
  pin.add(ring);

  return { pin, tip: head };
}
