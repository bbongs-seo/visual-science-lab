import * as THREE from "three";
import {
  addTouchTarget,
  applyResponsiveFraming,
  createLabel,
  createOrbitControls,
  isBehindSphere,
  isZoomedOut,
} from "../../../shared/three/stage.js";
import {
  createEarth,
  createMoon,
  createPin,
  createStars,
  latLonToVector3,
  SCALE,
} from "../../../shared/three/space.js";
import { describeTide, signedAngleAround, tideLevel } from "../../../shared/astro.js";

const INCHEON = { lat: 37.46, lon: 126.6 };
const EARTH_SPIN = 0.42; // '보통' 속도에서 초당 자전(라디안)
const MOON_ORBIT = EARTH_SPIN / 10; // 실제(약 1/27)보다 빠르게: 달이 움직이는 게 눈에 보이도록
const ORBIT_RADIUS = SCALE.moonDistance;

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
  uniform float time;

  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorldPos);
    // 가운데는 거의 투명하고 가장자리만 푸르게 빛나는 유리 같은 바닷물
    float fresnel = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.6);
    float shimmer = 0.5 + 0.5 * sin(vWorldPos.y * 18.0 + time * 2.0);
    float alpha = 0.015 + 0.6 * fresnel + 0.03 * shimmer;
    vec3 color = mix(vec3(0.08, 0.45, 0.95), vec3(0.6, 0.93, 1.0), clamp(fresnel * 1.6, 0.0, 1.0));
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.85));
    #include <colorspace_fragment>
  }
`;

const BEACH_SVG = `
  <svg class="beach" viewBox="0 0 200 110" role="img" aria-label="인천 바닷가 옆모습">
    <defs>
      <linearGradient id="beach-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6fb8f2"/><stop offset="1" stop-color="#cfeeff"/>
      </linearGradient>
      <linearGradient id="beach-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3fb3e6"/><stop offset="1" stop-color="#155d9a"/>
      </linearGradient>
    </defs>
    <rect width="200" height="110" fill="url(#beach-sky)"/>
    <path d="M0 110 L0 99 C 50 97, 105 92, 150 74 L200 54 L200 110 Z" fill="#7a5c43"/>
    <path d="M118 86 C 140 78, 160 66, 200 44 L200 110 L150 110 Z" fill="#e6c98c"/>
    <text class="beach__crab" x="58" y="98" font-size="12">🦀</text>
    <text x="172" y="44" font-size="15">🏠</text>
    <g class="beach__sea">
      <path class="beach__wave" d="M-40 0 q 10 -4 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 V 80 H -40 Z" fill="url(#beach-sea)" opacity="0.9"/>
    </g>
  </svg>`;

export function createScene({ canvas, overlay, complete, signal }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = createOrbitControls(camera, canvas, { minDistance: 5, maxDistance: 26 });
  const framing = {
    direction: new THREE.Vector3(-0.65, 3.2, 12.2).normalize(),
    wideTargetX: 0.45,
    narrowTargetX: 0.45,
    wideDistance: 11,
    narrowDistance: 21,
    targetY: 0,
    narrowTargetY: 1.2,
  };

  scene.add(createStars(29));

  const sunDirection = new THREE.Vector3(-0.92, 0.24, 0.5).normalize();
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x0a1220, 0.35));
  const sunLight = new THREE.DirectionalLight(0xfff1cf, 3.2);
  sunLight.position.copy(sunDirection).multiplyScalar(20);
  scene.add(sunLight);

  /* ---- 지구 ---- */
  const earthPosition = new THREE.Vector3(0.45, 0, 0);
  const earthRadius = SCALE.earthRadius;

  const tilt = new THREE.Group();
  tilt.position.copy(earthPosition);
  tilt.rotation.x = 0.28;
  scene.add(tilt);

  const earth = createEarth(earthRadius, sunDirection);
  earth.mesh.rotation.y = Math.PI * 0.35;
  earth.mesh.userData.body = {
    id: "earth",
    title: "🌏 지구",
    text: "지구 겉면의 약 70%는 바다예요. 달이 끌어당기는 힘 때문에 바닷물이 양쪽으로 살짝 부풀어 올라요.",
  };
  tilt.add(earth.mesh, earth.atmosphere);

  const incheon = createPin(latLonToVector3(INCHEON.lat, INCHEON.lon, earthRadius * 1.004), {
    color: 0x2ee6c8,
  });
  earth.mesh.add(incheon.pin);
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt.quaternion);

  /* ---- 바닷물: 달 쪽과 반대쪽으로 길쭉한 타원체 ---- */
  const tideGroup = new THREE.Group();
  tideGroup.position.copy(earthPosition);
  scene.add(tideGroup);

  const waterUniforms = { time: { value: 0 } };
  const water = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius * 1.02, 80, 56),
    new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  water.scale.set(1.4, 1.0, 1.0);
  water.renderOrder = 3;
  water.userData.body = {
    id: "water",
    title: "🌊 부풀어 오른 바닷물",
    text: "달 쪽과 그 반대쪽 바닷물이 함께 부풀어 올라요. 부푼 곳에 있는 바닷가는 밀물, 그 사이에 있는 바닷가는 썰물이 돼요. (실제보다 아주 크게 그렸어요)",
  };
  tideGroup.add(water);

  /* ---- 달: 끌어서 옮길 수 있다 ---- */
  const orbit = new THREE.Group();
  orbit.position.copy(earthPosition);
  orbit.rotation.x = 0.12;
  scene.add(orbit);

  const orbitLine = new THREE.Mesh(
    new THREE.RingGeometry(ORBIT_RADIUS - 0.012, ORBIT_RADIUS + 0.012, 160),
    new THREE.MeshBasicMaterial({
      color: 0xbcd4ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  orbitLine.rotation.x = -Math.PI / 2;
  orbit.add(orbitLine);

  const moonPivot = new THREE.Group();
  orbit.add(moonPivot);
  const moon = createMoon(SCALE.moonRadius);
  moon.position.set(-ORBIT_RADIUS, 0, 0);
  moon.userData.body = {
    id: "moon",
    title: "🌙 달",
    text: "지구의 하나뿐인 자연 위성이에요. 지구에서 약 38만 km 떨어져 있어요. 달이 끌어당기는 힘이 바닷물을 움직여요.",
  };
  moonPivot.add(moon);
  const moonTouch = addTouchTarget(moon, 0.8); // 작은 달도 손가락으로 잡기 쉽게
  let moonAngle = 0; // 화면 왼쪽에서 출발: 바닷물이 좌우로 길쭉하게 부푼 모습이 가장 잘 보인다

  /* 달 끌기: OrbitControls 보다 먼저 받으려고 무대에서 capture 단계로 듣는다 */
  const stage = canvas.parentElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const orbitPlane = new THREE.Plane();
  const hit = new THREE.Vector3();
  let drag = null;

  const toPointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
  };

  stage.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target !== canvas) return;
      toPointer(event);
      if (!raycaster.intersectObject(moonTouch, false).length) return;
      controls.enabled = false;
      canvas.setPointerCapture(event.pointerId);
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(orbit.quaternion);
      orbitPlane.setFromNormalAndCoplanarPoint(normal, earthPosition);
      drag = { id: event.pointerId, start: moonAngle };
      stage.classList.add("is-dragging");
    },
    { capture: true, signal }
  );

  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      toPointer(event);
      if (!raycaster.ray.intersectPlane(orbitPlane, hit)) return;
      orbit.worldToLocal(hit);
      moonAngle = Math.atan2(hit.z, -hit.x);
    },
    { signal }
  );

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = Math.abs(Math.atan2(Math.sin(moonAngle - drag.start), Math.cos(moonAngle - drag.start)));
    if (moved > 0.35) complete("drag-moon");
    drag = null;
    controls.enabled = true;
    stage.classList.remove("is-dragging");
  };
  canvas.addEventListener("pointerup", endDrag, { signal });
  canvas.addEventListener("pointercancel", endDrag, { signal });

  /* ---- 화면 위 글씨 ---- */
  const labels = {
    highA: createLabel(overlay, "밀물", "high"),
    highB: createLabel(overlay, "밀물", "high"),
    lowA: createLabel(overlay, "썰물", "low"),
    lowB: createLabel(overlay, "썰물", "low"),
    incheon: createLabel(overlay, "인천", "pin"),
  };

  const hud = document.createElement("div");
  hud.className = "hud hud--beach";
  hud.innerHTML = `
    <p class="hud__place">📍 인천 바닷가</p>
    ${BEACH_SVG}
    <p class="hud__value"></p>
    <p class="hud__sub"></p>`;
  overlay.append(hud);
  const sea = hud.querySelector(".beach__sea");
  const crab = hud.querySelector(".beach__crab");
  const hudValue = hud.querySelector(".hud__value");
  const hudSub = hud.querySelector(".hud__sub");

  const moonWorld = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const pinWorld = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const earthSphere = new THREE.Sphere(earthPosition, earthRadius * 1.05);
  let elapsed = 0;
  let lastLevel = null;
  let highTides = 0;
  let armed = false;
  let hudText = "";

  return {
    scene,
    camera,
    controls,
    pickTargets: [moonTouch, water, earth.mesh],

    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyResponsiveFraming(camera, controls, width, height, framing);
    },

    update(dt, state) {
      elapsed += dt;
      if (!state.paused) {
        const step = dt * state.speed;
        earth.mesh.rotation.y += step * EARTH_SPIN;
        earth.drift(step * EARTH_SPIN * 0.004);
        if (!drag) moonAngle += step * MOON_ORBIT;
        waterUniforms.time.value = elapsed;
      }
      moonPivot.rotation.y = moonAngle;
      controls.update();

      /* 바닷물 부푼 방향을 달 쪽으로 */
      moon.getWorldPosition(moonWorld);
      moonDir.set(moonWorld.x - earthPosition.x, 0, moonWorld.z - earthPosition.z).normalize();
      tideGroup.rotation.y = -Math.atan2(moonDir.z, moonDir.x);
      water.scale.x = 1.4 + Math.sin(elapsed * 1.4) * 0.012;

      /* 인천의 물높이 */
      earth.mesh.updateWorldMatrix(true, true);
      incheon.pin.getWorldPosition(pinWorld);
      const local = pinWorld.clone().sub(earthPosition);
      const level = tideLevel(signedAngleAround(moonDir, local, axis));
      const rising = lastLevel === null ? true : level >= lastLevel;
      lastLevel = level;

      if (level < 0) armed = true;
      if (armed && level > 0.92) {
        armed = false;
        highTides += 1;
        if (highTides >= 2) complete("two-high-tides");
      }

      sea.style.transform = `translateY(${(78 - level * 28).toFixed(1)}px)`;
      crab.style.opacity = level < -0.35 ? "1" : "0";
      const tide = describeTide(level, rising);
      const next = `${tide.key}|${highTides}`;
      if (next !== hudText) {
        hudText = next;
        hud.dataset.tide = tide.key;
        hudValue.textContent = tide.text;
        hudSub.textContent = highTides
          ? `지금까지 밀물 ${highTides}번 찾아왔어요`
          : "밀물이 몇 번 오는지 세어 보세요";
      }

      /* 이름표 위치 */
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      side.crossVectors(up, moonDir).normalize();
      const showLabels = !isZoomedOut(controls);
      const place = (label, dir, distance) => {
        anchor.copy(earthPosition).addScaledVector(dir, distance);
        anchor.y += earthRadius * 0.12;
        label.place(anchor, camera, width, height, showLabels && !isBehindSphere(anchor, camera, earthSphere));
      };
      place(labels.highA, moonDir, earthRadius * 1.6);
      place(labels.highB, moonDir.clone().negate(), earthRadius * 1.6);
      place(labels.lowA, side, earthRadius * 1.2);
      place(labels.lowB, side.clone().negate(), earthRadius * 1.2);

      toCamera.copy(camera.position).sub(pinWorld);
      labels.incheon.place(
        incheon.tip.getWorldPosition(anchor),
        camera,
        width,
        height,
        showLabels && local.dot(toCamera) > 0
      );
    },
  };
}
