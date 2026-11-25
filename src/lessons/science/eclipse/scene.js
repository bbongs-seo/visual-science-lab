import * as THREE from "three";
import {
  addTouchTarget,
  applyResponsiveFraming,
  createLabel,
  createOrbitControls,
  isZoomedOut,
} from "../../../shared/three/stage.js";
import {
  SPHERE_SHADOW_GLSL,
  createEarth,
  createMoon,
  createStars,
  createSun,
  SCALE,
} from "../../../shared/three/space.js";
import { SHADOW_SPREAD, SHADOW_TAPER, eclipseAt, moonPhaseName } from "../../../shared/astro.js";

const MOON_ORBIT_SPEED = 18; // '보통' 속도에서 초당 도는 각(도): 20초에 한 바퀴
const EARTH_SPIN = 0.25;
const ORBIT = SCALE.moonDistance;
const EARTH_RADIUS = SCALE.earthRadius;
const MOON_RADIUS = SCALE.moonRadius;
const START_PHASE = 300; // 그믐달에서 출발: 조금 기다리면 일식이 온다
const SIZES = { orbit: ORBIT, earthRadius: EARTH_RADIUS, moonRadius: MOON_RADIUS };

const SKY_SVG = `
  <svg class="gauge" viewBox="0 0 200 100" role="img" aria-label="지구에서 올려다본 해와 달">
    <defs>
      <clipPath id="sky-moon-clip"><circle cx="100" cy="50" r="26"/></clipPath>
      <radialGradient id="sky-corona">
        <stop offset="0.55" stop-color="#fff6d8" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#ffd38a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect class="sky__bg" width="200" height="100" fill="#5aa9ea"/>
    <g class="sky__solar">
      <circle class="sky__corona" cx="100" cy="50" r="44" fill="url(#sky-corona)" opacity="0"/>
      <circle cx="100" cy="50" r="26" fill="#ffd34d"/>
      <circle class="sky__moon-disk" cx="100" cy="50" r="26" fill="#1a1d33"/>
    </g>
    <g class="sky__lunar">
      <circle cx="100" cy="50" r="26" fill="#e4dfcf"/>
      <circle class="sky__earth-shadow" cx="100" cy="50" r="40" fill="#8a2a12" fill-opacity="0.85" clip-path="url(#sky-moon-clip)"/>
    </g>
    <text class="sky__none" x="100" y="56" text-anchor="middle" font-size="13" fill="#e8f0ff">한 줄로 서면 여기에 보여요</text>
  </svg>`;

const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
const passed = (from, to, target) => wrap(from - target) < 0 && wrap(to - target) >= 0;

/** 그림자를 받는 달: 지구 본그림자 안은 붉은 구릿빛으로 어두워진다 (개기월식) */
function receiveEarthShadow(material, shadowSphere, light) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.shadowSphere = { value: shadowSphere };
    shader.uniforms.shadowLight = { value: light };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vShadowWorld;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvShadowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vShadowWorld;\nuniform vec4 shadowSphere;\nuniform vec3 shadowLight;\n${SPHERE_SHADOW_GLSL}`
      )
      .replace(
        "#include <opaque_fragment>",
        "outgoingLight = mix(outgoingLight * vec3(0.55, 0.17, 0.07), outgoingLight, sphereShadow(vShadowWorld, shadowLight, shadowSphere));\n#include <opaque_fragment>"
      );
  };
}

/** 구가 햇빛 반대쪽(+x, 태양은 -x 에 있다)으로 드리우는 그림자 원뿔. spread 가 음수면 좁아지는 본그림자 */
function shadowCone(radius, length, spread, opacity) {
  const far = Math.max(radius + spread * length, 0.001);
  const geometry = new THREE.CylinderGeometry(far, radius, length, 48, 1, true);
  geometry.translate(0, length / 2, 0);
  geometry.rotateZ(-Math.PI / 2); // 원기둥 축(+y)을 +x 로
  const material = new THREE.MeshBasicMaterial({
    color: 0xff4d6d,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.BackSide, // 안쪽 뒷벽만 그려야 천체 밤쪽 면에 붉은 막이 씌지 않는다
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.opacity = opacity;
  mesh.visible = false;
  return mesh;
}

/** 식이 일어나는 동안에만 그림자 원뿔을 서서히 보여 준다 */
function fadeCones(cones, show, dt) {
  for (const cone of cones) {
    const target = show ? cone.userData.opacity : 0;
    const m = cone.material;
    m.opacity += (target - m.opacity) * Math.min(1, dt * 6);
    if (dt === 0) m.opacity = target; // 첫 프레임
    cone.visible = m.opacity > 0.005;
  }
}

export function createScene({ canvas, overlay, complete }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = createOrbitControls(camera, canvas, { minDistance: 5, maxDistance: 40 });
  const framing = {
    // 해·지구·달이 한 줄로 서는 모습이 보이게 앞에서 보고, 넓은 화면에서는 왼쪽 끝에 태양 일부가 걸리게 한다
    direction: new THREE.Vector3(0.1, 0.5, 1).normalize(),
    wideTargetX: -3.5,
    narrowTargetX: 0,
    wideDistance: 17.5,
    narrowDistance: 13, // 좁은 화면은 지구·달을 따라가므로 궤도 전체가 들어갈 만큼 물러나지 않는다
    targetY: 0,
    narrowTargetY: 1.6,
  };

  scene.add(createStars(61));

  /* ---- 태양 · 빛 ---- */
  const earthPosition = new THREE.Vector3(0, 0, 0);
  const sunPosition = new THREE.Vector3(-SCALE.sunDistance, 0, 0);
  const light = sunPosition.clone().sub(earthPosition).normalize(); // 멀리서 오는 햇빛 방향

  const sun = createSun(SCALE.sunRadius);
  sun.group.position.copy(sunPosition);
  sun.mesh.userData.body = {
    id: "sun",
    title: "☀️ 태양",
    text: "태양은 달보다 약 400배 크지만, 지구에서 400배쯤 더 멀리 있어요. 그래서 하늘에서는 해와 달이 거의 같은 크기로 보이고, 달이 해를 꼭 맞게 가릴 수 있어요.",
  };
  scene.add(sun.group);

  scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x0a1020, 0.06));
  const sunLight = new THREE.DirectionalLight(0xfff1cf, 3.2);
  sunLight.position.copy(light).multiplyScalar(20);
  scene.add(sunLight);

  /* ---- 지구 ---- */
  const tilt = new THREE.Group();
  tilt.position.copy(earthPosition);
  tilt.rotation.x = 0.35; // 일식 그림자가 잘 보이게 북반구를 살짝 이쪽으로
  scene.add(tilt);
  const earth = createEarth(EARTH_RADIUS, light);
  earth.mesh.rotation.y = 2.2;
  earth.mesh.userData.body = {
    id: "earth",
    title: "🌏 지구",
    text: "지구도 햇빛을 받아 뒤쪽으로 긴 그림자를 드리워요. 보름달이 이 그림자 속으로 들어가면 월식이 일어나요.",
  };
  tilt.add(earth.mesh, earth.atmosphere);
  const moonShadowOnEarth = earth.mesh.material.uniforms.shadowSphere.value;

  /* ---- 달: 지구 둘레를 돈다 ---- */
  const orbitLine = new THREE.Mesh(
    new THREE.RingGeometry(ORBIT - 0.012, ORBIT + 0.012, 160),
    new THREE.MeshBasicMaterial({
      color: 0xbcd4ff,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  orbitLine.rotation.x = -Math.PI / 2;
  orbitLine.position.copy(earthPosition);
  scene.add(orbitLine);

  const moon = createMoon(MOON_RADIUS);
  const earthShadowOnMoon = new THREE.Vector4(earthPosition.x, earthPosition.y, earthPosition.z, EARTH_RADIUS);
  receiveEarthShadow(moon.material, earthShadowOnMoon, light);
  moon.userData.body = {
    id: "moon",
    title: "🌙 달",
    text: "달은 스스로 빛을 내지 못하고 햇빛을 받아 반짝여요. 약 한 달에 한 번 지구 둘레를 돌면서 해를 가리기도 하고(일식), 지구 그림자에 들어가기도 해요(월식).",
  };
  scene.add(moon);
  const moonTouch = addTouchTarget(moon, 0.7);

  /* ---- 그림자 원뿔: 실제 크기로는 지구에 떨어진 달 그림자가 점만 해서 공간에 뻗은 그림자를 함께 그린다 ---- */
  const moonReach = ORBIT; // 지구 중심까지 (지구 안쪽은 가려진다)
  const earthReach = ORBIT + EARTH_RADIUS * 0.5; // 달 궤도를 조금 지나서까지
  const moonCones = [
    shadowCone(MOON_RADIUS, moonReach, -SHADOW_TAPER, 0.55),
    shadowCone(MOON_RADIUS, moonReach, SHADOW_SPREAD, 0.18),
  ];
  const earthCones = [
    shadowCone(EARTH_RADIUS, earthReach, -SHADOW_TAPER, 0.45),
    shadowCone(EARTH_RADIUS, earthReach, SHADOW_SPREAD, 0.15),
  ];
  earthCones.forEach((cone) => cone.position.copy(earthPosition));
  scene.add(...moonCones, ...earthCones);

  /* ---- 화면 위 글씨 ---- */
  const labels = {
    moonShadow: createLabel(overlay, "달 그림자", "shadow"),
    earthShadow: createLabel(overlay, "지구 그림자", "shadow"),
  };

  const hud = document.createElement("div");
  hud.className = "hud hud--sky";
  hud.innerHTML = `
    <p class="hud__place">🔭 지구에서 본 하늘</p>
    ${SKY_SVG}
    <p class="hud__value"></p>
    <p class="hud__sub"></p>`;
  overlay.append(hud);
  const $ = (selector) => hud.querySelector(selector);
  const sky = {
    bg: $(".sky__bg"),
    solar: $(".sky__solar"),
    lunar: $(".sky__lunar"),
    none: $(".sky__none"),
    corona: $(".sky__corona"),
    moonDisk: $(".sky__moon-disk"),
    earthShadow: $(".sky__earth-shadow"),
  };
  const hudValue = $(".hud__value");
  const hudSub = $(".hud__sub");
  let hudText = "";

  const moonDir = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const follow = new THREE.Vector3();
  const followBase = new THREE.Vector3(); // 따라가는 기준점. 두 손가락으로 옮긴 만큼(target - followBase)은 그대로 둔다
  let narrow = false;
  let phase = START_PHASE;

  return {
    scene,
    camera,
    controls,
    pickTargets: [moonTouch, earth.mesh, sun.mesh],

    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyResponsiveFraming(camera, controls, width, height, framing);
      followBase.copy(controls.target);
      narrow = width / height < 0.85;
    },

    update(dt, state) {
      const before = phase;
      if (state.paused) {
        phase = state.slider ?? phase;
      } else {
        phase = (phase + dt * MOON_ORBIT_SPEED * state.speed) % 360;
        earth.mesh.rotation.y += dt * EARTH_SPIN * state.speed;
        earth.drift(dt * 0.001);
        state.slider = phase;
      }

      /* 달 위치: 0도 = 태양 쪽, 위에서 보면 시계 반대 방향으로 돈다 */
      const a = THREE.MathUtils.degToRad(phase);
      moonDir.set(-Math.cos(a), 0, Math.sin(a));
      moon.position.copy(earthPosition).addScaledVector(moonDir, ORBIT);
      moon.rotation.y = a; // 늘 같은 얼굴을 지구 쪽으로
      moonShadowOnEarth.set(moon.position.x, moon.position.y, moon.position.z, MOON_RADIUS);
      moonCones.forEach((cone) => cone.position.copy(moon.position));

      // 좁은 화면: 궤도 전체 대신 지구와 달 사이를 따라가며 크게 보여 준다. 카메라도 같이 옮겨 돌려 본 각도는 지킨다
      if (narrow) {
        follow.copy(earthPosition).lerp(moon.position, 0.5).sub(followBase);
        follow.y = 0;
        follow.multiplyScalar(dt === 0 ? 1 : Math.min(1, dt * 4));
        followBase.add(follow);
        controls.target.add(follow);
        camera.position.add(follow);
      }
      controls.update();

      /* 식 판정과 하늘 그림 */
      const eclipse = eclipseAt(phase, SIZES);
      fadeCones(moonCones, eclipse.type === "solar" && eclipse.kind !== null, dt);
      fadeCones(earthCones, eclipse.type === "lunar" && eclipse.kind !== null, dt);
      if (eclipse.kind === "total") complete(eclipse.type === "solar" ? "solar-total" : "lunar-total");
      // 개기일식은 아주 좁은 순간이라 빠르게 돌 때 프레임 사이로 건너뛸 수 있다: 한 줄을 지나쳤는지도 본다
      if (!state.paused && passed(before, phase, 0)) complete("solar-total");
      if (!state.paused && passed(before, phase, 180)) complete("lunar-total");

      const key = `${eclipse.type}|${eclipse.kind}|${Math.round((eclipse.reveal ?? eclipse.offset) * 40)}`;
      if (key !== hudText) {
        hudText = key;
        const solar = eclipse.type === "solar";
        const showing = eclipse.kind !== null;
        hud.dataset.eclipse = showing ? eclipse.kind : "none";
        sky.solar.style.display = solar && showing ? "" : "none";
        sky.lunar.style.display = !solar && showing ? "" : "none";
        sky.none.style.display = showing ? "none" : "";

        if (solar) {
          const side = Math.sin(a) >= 0 ? 1 : -1;
          sky.moonDisk.setAttribute("cx", (100 + side * eclipse.reveal * 52).toFixed(1));
          sky.corona.setAttribute("opacity", eclipse.kind === "total" ? "1" : "0");
          sky.bg.setAttribute("fill", eclipse.kind === "total" ? "#0d1436" : "#5aa9ea");
        } else {
          const scale = 26 / MOON_RADIUS;
          const side = Math.sin(a) >= 0 ? 1 : -1;
          sky.earthShadow.setAttribute("r", (eclipse.umbra * scale).toFixed(1));
          sky.earthShadow.setAttribute("cx", (100 + side * eclipse.offset * scale).toFixed(1));
          sky.bg.setAttribute("fill", "#0d1436");
        }

        const texts = {
          "solar|total": ["개기일식 · 해가 달에 완전히 가려졌어요", "해 - 달 - 지구가 한 줄로 섰어요"],
          "solar|partial": ["부분일식 · 해가 조금 가려졌어요", "달이 해 앞을 지나가고 있어요"],
          "lunar|total": ["개기월식 · 달이 붉게 물들었어요", "해 - 지구 - 달이 한 줄로 섰어요"],
          "lunar|partial": ["부분월식 · 달이 지구 그림자에 들어가요", "보름달이 지구 그림자를 지나가요"],
        };
        const [value, sub] = texts[`${eclipse.type}|${eclipse.kind}`] || [
          `${moonPhaseName(phase)} · 지금은 일식도 월식도 없어요`,
          "태양, 지구, 달이 한 줄로 서면 식이 일어나요",
        ];
        hudValue.textContent = value;
        hudSub.textContent = sub;
      }

      /* 이름표 위치 */
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      anchor.copy(earthPosition).addScaledVector(light, EARTH_RADIUS * 0.9);
      anchor.y += EARTH_RADIUS * 1.15; // 그림자를 가리지 않게 위쪽에
      anchor.z = moon.position.z * 0.6;
      const showLabels = !isZoomedOut(controls);
      labels.moonShadow.place(anchor, camera, width, height, showLabels && eclipse.type === "solar" && eclipse.kind !== null);
      anchor.copy(moon.position).y += MOON_RADIUS * 2.4;
      labels.earthShadow.place(anchor, camera, width, height, showLabels && eclipse.type === "lunar" && eclipse.kind !== null);
    },
  };
}
