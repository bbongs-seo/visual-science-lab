import * as THREE from "three";
import {
  addTouchTarget,
  applyResponsiveFraming,
  createLabel,
  createOrbitControls,
} from "../../../shared/three/stage.js";
import { createStars } from "../../../shared/three/space.js";
import { createAirfoil } from "../../../shared/flow.js";

const TAKEOFF_SPEED = 160; // km/h: 이 속도에서 뜨는 힘 = 무게
const MAX_SPEED = 300;
const FLOW_SCALE = 3.2; // 최고 속도일 때 멀리 바람이 화면에서 초당 움직이는 거리
const PARTICLES = 700;
const SPAN = 4; // 날개 폭(화면 깊이 방향)
const X_MIN = -6.5;
const X_MAX = 6.5;
const Y_RANGE = 2.8;
const MAX_REL_SPEED = 3;
const SLOW = new THREE.Color(1, 0.62, 0.25);
const MID = new THREE.Color(0.78, 0.82, 0.9);
const FAST = new THREE.Color(0.3, 0.88, 1);

const FORCE_SVG = `
  <svg class="gauge" viewBox="0 0 200 96" role="img" aria-label="날개를 뜨게 하는 힘과 비행기 무게 비교">
    <rect width="200" height="96" fill="#0d1436"/>
    <text x="10" y="28" font-size="11" fill="#c6cdef">뜨는 힘</text>
    <rect x="62" y="17" width="128" height="16" rx="8" fill="#26305e"/>
    <rect class="force__lift" x="62" y="17" width="0" height="16" rx="8" fill="#4cf0c0"/>
    <text x="10" y="66" font-size="11" fill="#c6cdef">무게</text>
    <rect x="62" y="55" width="128" height="16" rx="8" fill="#26305e"/>
    <rect x="62" y="55" width="64" height="16" rx="8" fill="#ff6b8b"/>
    <line x1="126" y1="10" x2="126" y2="80" stroke="#fff" stroke-opacity="0.6" stroke-dasharray="3 3"/>
    <text x="110" y="92" font-size="9" fill="#fff" fill-opacity="0.7">무게만큼</text>
  </svg>`;

export function createScene({ canvas, overlay, complete }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = createOrbitControls(camera, canvas, { minDistance: 6, maxDistance: 32 });
  const framing = {
    direction: new THREE.Vector3(0.3, 0.22, 1).normalize(),
    wideTargetX: 0.4,
    narrowTargetX: 0,
    wideDistance: 13.5,
    narrowDistance: 21,
    targetY: 0.2,
    narrowTargetY: 1.2,
  };

  scene.add(createStars(113, 700));
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a2140, 1.1));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(4, 8, 6);
  scene.add(light);

  const airfoil = createAirfoil();
  const rig = new THREE.Group(); // 날개·공기·화살표가 함께 떠오른다
  scene.add(rig);

  /* ---- 날개 단면을 옆으로 늘인 날개 ---- */
  const shape = new THREE.Shape(airfoil.outline(160).map(([x, y]) => new THREE.Vector2(x, y)));
  const wingGeometry = new THREE.ExtrudeGeometry(shape, { depth: SPAN, bevelEnabled: false, curveSegments: 1 });
  wingGeometry.translate(0, 0, -SPAN / 2);
  const wing = new THREE.Mesh(
    wingGeometry,
    new THREE.MeshStandardMaterial({ color: 0xc9d6ee, metalness: 0.35, roughness: 0.45 })
  );
  wing.userData.body = {
    id: "wing",
    title: "✈️ 날개 단면",
    text: "비행기 날개를 옆에서 자른 모양이에요. 윗면은 둥글게 부풀고 앞쪽이 살짝 들려 있어서, 공기를 아래로 밀어 내리고 윗면 공기를 빠르게 흐르게 해요.",
  };
  rig.add(wing);

  /* ---- 위아래 공기 (누르면 설명) ---- */
  const pressureSpot = (id, title, text, y) => {
    const anchor = new THREE.Object3D();
    anchor.position.set(0.9, y, SPAN / 2 + 0.05);
    anchor.userData.body = { id, title, text };
    rig.add(anchor);
    return { anchor, touch: addTouchTarget(anchor, 0.55) };
  };
  const low = pressureSpot(
    "low",
    "💨 윗면: 빠른 공기, 낮은 압력",
    "날개 윗면을 지나는 공기는 더 빠르게 흘러요. 공기가 빠르게 흐르는 곳은 누르는 힘(압력)이 약해져요.",
    1.15
  );
  const high = pressureSpot(
    "high",
    "🌬️ 아랫면: 느린 공기, 높은 압력",
    "날개 아랫면 공기는 천천히 흐르며 날개를 위로 밀어 올려요. 아래에서 미는 힘이 위에서 누르는 힘보다 커서 날개가 떠요.",
    -0.65
  );

  /* ---- 뜨는 힘과 무게 화살표 ---- */
  const liftArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-1, 0.5, 0), // 양력이 모이는 곳: 앞전에서 시위의 1/4 쯤
    1,
    0x4cf0c0,
    0.45,
    0.32
  );
  const weightArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(-1, -0.1, 0),
    2,
    0xff6b8b,
    0.45,
    0.32
  );
  rig.add(liftArrow, weightArrow);

  /* ---- 공기 알갱이: 짧은 꼬리를 끌며 흐른다 ---- */
  const positions = new Float32Array(PARTICLES * 6);
  const colors = new Float32Array(PARTICLES * 8); // 머리·꼬리 rgba
  const flowGeometry = new THREE.BufferGeometry();
  flowGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  flowGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  const streaks = new THREE.LineSegments(
    flowGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })
  );
  streaks.frustumCulled = false;
  rig.add(streaks);

  // 선은 1px 로만 그려져 색이 잘 안 보이므로 알갱이 머리에 점을 찍는다
  const heads = new Float32Array(PARTICLES * 3);
  const headColors = new Float32Array(PARTICLES * 4);
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute("position", new THREE.BufferAttribute(heads, 3));
  headGeometry.setAttribute("color", new THREE.BufferAttribute(headColors, 4));
  const headPoints = new THREE.Points(
    headGeometry,
    new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, depthWrite: false })
  );
  headPoints.frustumCulled = false;
  rig.add(headPoints);

  const pool = Array.from({ length: PARTICLES }, () => ({ x: 0, y: 0, z: 0, u: 0, v: 0 }));
  const respawn = (p, anywhere) => {
    do {
      p.x = anywhere ? X_MIN + Math.random() * (X_MAX - X_MIN) : X_MIN - Math.random() * 0.6;
      p.y = (Math.random() * 2 - 1) * Y_RANGE;
    } while (airfoil.inside(p.x, p.y));
    p.z = (Math.random() - 0.5) * (SPAN - 0.2);
  };
  pool.forEach((p) => respawn(p, true));

  const velocity = (x, y) => {
    const [u, v] = airfoil.velocity(x, y);
    const s = Math.hypot(u, v);
    // 뒷전 근처는 0/0 에 가까워 숫자가 튈 수 있다
    return s > MAX_REL_SPEED ? [(u / s) * MAX_REL_SPEED, (v / s) * MAX_REL_SPEED] : [u, v];
  };
  const color = new THREE.Color();

  /* ---- 화면 위 글씨 ---- */
  const labels = {
    low: createLabel(overlay, "빠른 공기", "air"),
    high: createLabel(overlay, "느린 공기", "warm"),
    lift: createLabel(overlay, "뜨는 힘(양력)", "lift"),
    weight: createLabel(overlay, "무게", "weight"),
  };
  const anchor = new THREE.Vector3();

  const hud = document.createElement("div");
  hud.className = "hud hud--sky";
  hud.innerHTML = `
    <p class="hud__place">✈️ 날개에 생기는 힘</p>
    ${FORCE_SVG}
    <p class="hud__value"></p>
    <p class="hud__sub"></p>`;
  overlay.append(hud);
  const liftBar = hud.querySelector(".force__lift");
  const hudValue = hud.querySelector(".hud__value");
  const hudSub = hud.querySelector(".hud__sub");

  let speed = null;
  let ratio = 0;
  let rise = 0;
  let clock = 0;

  function setSpeed(kmh) {
    speed = kmh;
    ratio = (kmh / TAKEOFF_SPEED) ** 2; // 뜨는 힘은 속도의 제곱에 비례
    liftArrow.setLength(0.05 + 2 * Math.min(ratio, 2), 0.45, 0.32);
    liftBar.setAttribute("width", (64 * Math.min(ratio, 2)).toFixed(1));
    const flying = ratio >= 1;
    hud.dataset.time = flying ? "sunset" : "day";
    hudValue.textContent = flying
      ? "떠올라요! 뜨는 힘이 무게보다 커요"
      : kmh === 0
        ? "멈춰 있어요 · 바람이 없으면 뜨는 힘도 없어요"
        : `아직 못 떠요 · 뜨는 힘이 무게의 ${Math.round(ratio * 100)}%`;
    hudSub.textContent = `비행 속도 ${kmh}km/h · 뜨려면 약 ${TAKEOFF_SPEED}km/h`;
    if (flying) complete("takeoff");
  }

  return {
    scene,
    camera,
    controls,
    pickTargets: [low.touch, high.touch, wing],

    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyResponsiveFraming(camera, controls, width, height, framing);
    },

    update(dt, state) {
      if (state.slider !== speed) setSpeed(state.slider);
      const wind = (speed / MAX_SPEED) * FLOW_SCALE;

      if (!state.paused) {
        clock += dt;
        // 뜨는 힘이 무게보다 크면 날개(와 둘레 공기)가 천천히 떠오른다
        const target = ratio >= 1 ? 0.5 + Math.sin(clock * 1.6) * 0.06 : 0;
        rise += (target - rise) * Math.min(dt * 2, 1);
        rig.position.y = rise;

        pool.forEach((p) => {
          // 2단계 룽게-쿠타: 날개 둘레 굽은 흐름을 따라가도록
          const [u1, v1] = velocity(p.x, p.y);
          const step = dt * wind;
          const [u2, v2] = velocity(p.x + u1 * step * 0.5, p.y + v1 * step * 0.5);
          p.x += u2 * step;
          p.y += v2 * step;
          p.u = u2;
          p.v = v2;
          if (p.x > X_MAX || Math.abs(p.y) > Y_RANGE + 1 || airfoil.inside(p.x, p.y)) respawn(p, false);
        });
      }

      const tail = 0.12 * wind;
      pool.forEach((p, i) => {
        const s = Math.hypot(p.u, p.v);
        // 멀리 바람(1)은 하양, 느린 공기(0.75 아래)는 주황, 빠른 공기(1.25 위)는 파랑
        const t = Math.min(Math.max((s - 0.75) / 0.5, 0), 1);
        if (t < 0.5) color.copy(SLOW).lerp(MID, t * 2);
        else color.copy(MID).lerp(FAST, (t - 0.5) * 2);
        positions.set([p.x, p.y, p.z, p.x - p.u * tail, p.y - p.v * tail, p.z], i * 6);
        // 보통 바람은 흐리게, 빠르거나 느린 공기는 진하게
        const alpha = wind > 0 ? 0.3 + 0.7 * Math.abs(t - 0.5) * 2 : 0;
        colors.set([color.r, color.g, color.b, alpha, color.r, color.g, color.b, 0], i * 8);
        heads.set([p.x, p.y, p.z], i * 3);
        headColors.set([color.r, color.g, color.b, alpha], i * 4);
      });
      flowGeometry.attributes.position.needsUpdate = true;
      flowGeometry.attributes.color.needsUpdate = true;
      headGeometry.attributes.position.needsUpdate = true;
      headGeometry.attributes.color.needsUpdate = true;
      controls.update();

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      labels.low.place(low.anchor.getWorldPosition(anchor), camera, width, height);
      labels.high.place(high.anchor.getWorldPosition(anchor), camera, width, height);
      anchor.set(-1, 0.75 + 2 * Math.min(ratio, 2), 0).add(rig.position);
      labels.lift.place(anchor, camera, width, height, ratio > 0.02);
      anchor.set(-1, -2.45, 0).add(rig.position);
      labels.weight.place(anchor, camera, width, height);
    },
  };
}
