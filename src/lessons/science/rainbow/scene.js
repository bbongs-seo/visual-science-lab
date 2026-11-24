import * as THREE from "three";
import {
  applyResponsiveFraming,
  createLabel,
  createOrbitControls,
} from "../../../shared/three/stage.js";
import { createStars } from "../../../shared/three/space.js";
import {
  RAINBOW_COLORS,
  rainbowAngle,
  rainbowPeak,
  traceDroplet,
  waterIndex,
} from "../../../shared/optics.js";

const DROP_RADIUS = 3;
const INCOMING_FROM = -13;
const EXIT_LENGTH = 9.5;
const SWEEP_SPEED = 0.35; // '보통' 속도에서 들어오는 높이가 오르내리는 빠르기
const RED = waterIndex(RAINBOW_COLORS[0].nm);
const VIOLET = waterIndex(RAINBOW_COLORS[RAINBOW_COLORS.length - 1].nm);
const PEAK = rainbowPeak(RED);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const DROP_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DROP_FRAGMENT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.2);
    vec3 color = mix(vec3(0.25, 0.55, 0.95), vec3(0.75, 0.95, 1.0), fresnel);
    gl_FragColor = vec4(color, 0.06 + 0.55 * fresnel);
    #include <colorspace_fragment>
  }
`;

const GAUGE_SVG = `
  <svg class="gauge" viewBox="0 0 200 96" role="img" aria-label="물방울에서 되돌아 나오는 빛의 각도">
    <rect width="200" height="96" fill="#0d1436"/>
    <path d="M 174 86 A 74 74 0 0 0 137 22" fill="none" stroke="#3a4a86" stroke-width="10" stroke-linecap="round"/>
    <line class="gauge__peak" x1="100" y1="86" stroke="#ffffff" stroke-opacity="0.55" stroke-dasharray="3 3"/>
    <text class="gauge__peak-text" font-size="10" fill="#ffffff" fill-opacity="0.8">42°</text>
    <line class="gauge__violet" x1="100" y1="86" stroke="#bf5af2" stroke-width="3" stroke-linecap="round"/>
    <line class="gauge__red" x1="100" y1="86" stroke="#ff3b30" stroke-width="3" stroke-linecap="round"/>
    <circle cx="100" cy="86" r="5" fill="#6fb6ff"/>
    <line x1="100" y1="86" x2="196" y2="86" stroke="#ffd34d" stroke-width="2"/>
    <text x="160" y="80" font-size="10" fill="#ffd34d">← 햇빛</text>
  </svg>`;

/** 되돌아 나온 각(도)을 계기판 위 점으로: 햇빛은 오른쪽에서 물방울(가운데)로 오고, 되돌아 나온 빛은 그 선에서 위로 벌어진다 */
const gaugePoint = (deg, length) => {
  const rad = (deg * Math.PI) / 180;
  return [100 + Math.cos(rad) * length, 86 - Math.sin(rad) * length];
};

export function createScene({ canvas, overlay, complete }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = createOrbitControls(camera, canvas, { minDistance: 8, maxDistance: 40 });
  const framing = {
    direction: new THREE.Vector3(0.12, 0.12, 1).normalize(),
    wideTargetX: -4.5,
    narrowTargetX: -3.5,
    wideDistance: 21,
    narrowDistance: 38,
    targetY: -3.2,
    narrowTargetY: 0.8,
  };

  scene.add(createStars(97, 900));

  /* ---- 물방울 (아주 크게 확대) ---- */
  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(DROP_RADIUS, 96, 64),
    new THREE.ShaderMaterial({
      vertexShader: DROP_VERTEX,
      fragmentShader: DROP_FRAGMENT,
      transparent: true,
      depthWrite: false,
    })
  );
  drop.renderOrder = 5;
  drop.userData.body = {
    id: "drop",
    title: "💧 빗방울 (크게 확대)",
    text: "진짜 빗방울은 지름이 1~2mm쯤이에요. 햇빛이 빗방울로 들어갈 때 한 번 꺾이고, 안쪽 벽에 부딪혀 되돌아 나올 때 또 꺾여요.",
  };
  scene.add(drop);

  /* ---- 여러 높이로 들어온 빛이 나가는 길 (흐린 선): 42° 근처에 몰린다 ---- */
  const fan = [];
  const green = waterIndex(530);
  for (let b = 0.03; b < 1; b += 0.032) {
    const { points, out } = traceDroplet(b, green);
    const [x, y] = points[2];
    fan.push(x * DROP_RADIUS, y * DROP_RADIUS, 0);
    fan.push(x * DROP_RADIUS + out[0] * EXIT_LENGTH, y * DROP_RADIUS + out[1] * EXIT_LENGTH, 0);
  }
  const fanGeometry = new THREE.BufferGeometry();
  fanGeometry.setAttribute("position", new THREE.Float32BufferAttribute(fan, 3));
  scene.add(
    new THREE.LineSegments(
      fanGeometry,
      new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.18 })
    )
  );

  /* ---- 지금 들어오는 햇빛 한 줄기와 일곱 색 ---- */
  const thin = new THREE.CylinderGeometry(0.04, 0.04, 1, 8, 1, true);
  const thick = new THREE.CylinderGeometry(0.08, 0.08, 1, 10, 1, true);
  const makeSegment = (geometry, color) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
    mesh.renderOrder = 3;
    scene.add(mesh);
    return mesh;
  };
  const incoming = makeSegment(thick, 0xfffbe8);
  const rays = RAINBOW_COLORS.map((c) => ({
    n: waterIndex(c.nm),
    parts: [0, 1, 2].map(() => makeSegment(thin, c.hex)),
  }));

  const tmp = new THREE.Vector3();
  const place = (mesh, a, b) => {
    tmp.subVectors(b, a);
    const length = tmp.length();
    mesh.position.copy(a).addScaledVector(tmp, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, tmp.normalize());
    mesh.scale.set(1, length, 1);
  };
  const v = (x, y) => new THREE.Vector3(x * DROP_RADIUS, y * DROP_RADIUS, 0);

  /* ---- 화면 위 글씨 ---- */
  const labels = {
    sun: createLabel(overlay, "햇빛 →", "day"),
    red: createLabel(overlay, "빨강", "ray-red"),
    violet: createLabel(overlay, "보라", "ray-violet"),
  };
  const anchors = { sun: new THREE.Vector3(), red: new THREE.Vector3(), violet: new THREE.Vector3() };

  const hud = document.createElement("div");
  hud.className = "hud hud--sky";
  hud.innerHTML = `
    <p class="hud__place">🌈 되돌아 나오는 빛의 각도</p>
    ${GAUGE_SVG}
    <p class="hud__value"></p>
    <p class="hud__sub"></p>`;
  overlay.append(hud);
  const $ = (s) => hud.querySelector(s);
  const [px, py] = gaugePoint(PEAK.angle, 80);
  $(".gauge__peak").setAttribute("x2", px.toFixed(1));
  $(".gauge__peak").setAttribute("y2", py.toFixed(1));
  $(".gauge__peak-text").setAttribute("x", (px + 3).toFixed(1));
  $(".gauge__peak-text").setAttribute("y", (py + 2).toFixed(1));
  const needle = { red: $(".gauge__red"), violet: $(".gauge__violet") };
  const hudValue = $(".hud__value");
  const hudSub = $(".hud__sub");

  let height = null;
  let sweep = Math.asin(0.4);

  function setHeight(b) {
    height = b;
    const p1 = v(-Math.sqrt(1 - b * b), b);
    place(incoming, new THREE.Vector3(INCOMING_FROM, b * DROP_RADIUS, 0), p1);
    anchors.sun.set(INCOMING_FROM + 2.2, b * DROP_RADIUS + 0.7, 0);

    rays.forEach((ray, index) => {
      const { points, out } = traceDroplet(b, ray.n);
      const [a, b2, c] = points.map(([x, y]) => v(x, y));
      place(ray.parts[0], a, b2);
      place(ray.parts[1], b2, c);
      const end = c.clone().add(new THREE.Vector3(out[0], out[1], 0).multiplyScalar(EXIT_LENGTH));
      place(ray.parts[2], c, end);
      // 빨강은 보라보다 더 크게 꺾여 띠의 바깥(오른쪽 아래)으로 나온다: 이름표를 띠 양옆으로 벌린다
      tmp.set(-out[1], out[0], 0).multiplyScalar(0.9);
      if (index === 0) anchors.red.copy(end).add(tmp);
      if (index === rays.length - 1) anchors.violet.copy(end).sub(tmp);
    });

    const redAngle = rainbowAngle(b, RED);
    const violetAngle = rainbowAngle(b, VIOLET);
    [
      [needle.red, redAngle],
      [needle.violet, violetAngle],
    ].forEach(([line, deg]) => {
      const [x, y] = gaugePoint(deg, 70);
      line.setAttribute("x2", x.toFixed(1));
      line.setAttribute("y2", y.toFixed(1));
    });

    const atPeak = Math.abs(b - PEAK.b) < 0.025;
    hud.dataset.time = atPeak ? "sunset" : "day";
    hudValue.textContent = atPeak
      ? "무지개 각도! 빛이 가장 많이 모여요"
      : `빨강 ${redAngle.toFixed(1)}° · 보라 ${violetAngle.toFixed(1)}°`;
    hudSub.textContent =
      b < 0.05
        ? "가운데로 들어간 빛은 거의 그대로 되돌아와요"
        : "색마다 꺾이는 정도가 달라 나오는 각도가 갈라져요";
  }

  return {
    scene,
    camera,
    controls,
    pickTargets: [drop],

    resize(width, h) {
      camera.aspect = width / h;
      camera.updateProjectionMatrix();
      applyResponsiveFraming(camera, controls, width, h, framing);
    },

    update(dt, state) {
      if (state.paused) {
        if (state.slider !== height) setHeight(state.slider);
        if (state.slider < 0.05) complete("center");
        if (Math.abs(state.slider - PEAK.b) < 0.025) complete("peak");
      } else {
        sweep += dt * SWEEP_SPEED * state.speed;
        const b = 0.03 + 0.95 * (0.5 - 0.5 * Math.cos(sweep));
        setHeight(b);
        state.slider = b;
      }
      controls.update();

      const width = canvas.clientWidth;
      const h = canvas.clientHeight;
      labels.sun.place(anchors.sun, camera, width, h);
      labels.red.place(anchors.red, camera, width, h);
      labels.violet.place(anchors.violet, camera, width, h);
    },
  };
}
