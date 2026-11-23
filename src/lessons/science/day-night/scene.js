import * as THREE from "three";
import {
  applyResponsiveFraming,
  createLabel,
  createOrbitControls,
} from "../../../shared/three/stage.js";
import {
  createEarth,
  createPin,
  createStars,
  createSun,
  latLonToVector3,
} from "../../../shared/three/space.js";
import { angleForHour, describeHour, signedAngleAround, solarHour } from "../../../shared/astro.js";

const SEOUL = { lat: 37.57, lon: 126.98 };
const EARTH_SPIN = 0.32; // '보통' 속도에서 초당 회전(라디안): 약 20초에 하루
const START_HOUR = 7; // 서울의 아침에서 출발해 낮 → 저녁 → 밤을 차례로 보여 준다
const TAU = Math.PI * 2;
const DAY_OFFSET = new THREE.Vector3(0, 0.95, 0.4);
const NIGHT_OFFSET = new THREE.Vector3(0, -0.75, 0.4);

export function createScene({ canvas, overlay, complete }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = createOrbitControls(camera, canvas, { minDistance: 7.5, maxDistance: 17 });
  const framing = {
    direction: new THREE.Vector3(-1.2, 1.6, 11.5).normalize(),
    wideTargetX: 1.25,
    narrowTargetX: 0.35,
    wideDistance: 11.8,
    narrowDistance: 15,
    targetY: 0.05,
  };

  scene.add(createStars(11));

  /* ---- 태양 ---- */
  const sunPosition = new THREE.Vector3(-3.7, 0.32, 0);
  const sun = createSun(0.8);
  sun.group.position.copy(sunPosition);
  sun.mesh.userData.body = {
    id: "sun",
    title: "☀️ 태양",
    text: "스스로 빛과 열을 내는 별이에요. 지름이 지구의 약 109배나 돼요. 태양 빛이 지구까지 오는 데는 약 8분 20초가 걸려요.",
  };
  scene.add(sun.group);

  /* ---- 지구: 자전축을 23.4도 기울여 북반구가 살짝 보이게 ---- */
  const earthPosition = new THREE.Vector3(1.0, 0, 0);
  const earthRadius = 1.45;
  const sunDirection = sunPosition.clone().sub(earthPosition).normalize();

  const tilt = new THREE.Group();
  tilt.position.copy(earthPosition);
  tilt.rotation.x = THREE.MathUtils.degToRad(23.4);
  scene.add(tilt);

  const earth = createEarth(earthRadius, sunDirection);
  earth.mesh.userData.body = {
    id: "earth",
    title: "🌏 지구",
    text: "우리가 사는 행성이에요. 하루에 한 바퀴 자전하고, 1년에 한 바퀴 태양 둘레를 돌아요. 자전축은 약 23.5도 기울어져 있어요.",
  };
  tilt.add(earth.mesh, earth.atmosphere);

  const seoul = createPin(latLonToVector3(SEOUL.lat, SEOUL.lon, earthRadius));
  earth.mesh.add(seoul.pin);

  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt.quaternion);
  const seoulDir = new THREE.Vector3();
  const tipWorld = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  const seoulAngle = () => {
    earth.mesh.updateWorldMatrix(true, true);
    seoul.pin.getWorldPosition(seoulDir).sub(earthPosition);
    return signedAngleAround(sunDirection, seoulDir, axis);
  };
  earth.mesh.rotation.y += angleForHour(START_HOUR) - seoulAngle();

  /* ---- 화면 위 글씨 ---- */
  const labels = {
    day: createLabel(overlay, "☀️ 낮", "day"),
    night: createLabel(overlay, "🌙 밤", "night"),
    seoul: createLabel(overlay, "서울", "pin"),
  };
  const dayAnchor = new THREE.Vector3();
  const nightAnchor = new THREE.Vector3();

  const hud = document.createElement("div");
  hud.className = "hud hud--clock";
  hud.innerHTML = `
    <span class="hud__icon" aria-hidden="true"></span>
    <div>
      <p class="hud__place">📍 지금 서울은</p>
      <p class="hud__value"></p>
      <p class="hud__sub"></p>
    </div>`;
  overlay.append(hud);
  const hudIcon = hud.querySelector(".hud__icon");
  const hudValue = hud.querySelector(".hud__value");
  const hudSub = hud.querySelector(".hud__sub");
  let hudText = "";

  let spun = 0;
  let wasDay = true;

  return {
    scene,
    camera,
    controls,
    pickTargets: [earth.mesh, sun.mesh],

    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyResponsiveFraming(camera, controls, width, height, framing);
    },

    update(dt, state) {
      if (!state.paused) {
        const step = dt * EARTH_SPIN * state.speed;
        earth.mesh.rotation.y += step;
        earth.drift(step * 0.004);
        spun += step;
      }
      controls.update();

      /* 서울의 시각과 낮·밤 */
      const hour = solarHour(seoulAngle());
      const isDay = seoulDir.dot(sunDirection) > 0;
      const days = Math.floor(spun / TAU);
      if (wasDay && !isDay) complete("seoul-night");
      if (days >= 1) complete("one-day");
      wasDay = isDay;

      const text = describeHour(hour);
      const next = `${text}|${isDay}|${days}`;
      if (next !== hudText) {
        hudText = next;
        hudIcon.textContent = !isDay ? "🌙" : hour < 9 ? "🌅" : hour >= 16 ? "🌇" : "☀️";
        hudValue.textContent = `${text} · ${isDay ? "해가 떠 있어요" : "해가 졌어요"}`;
        hudSub.textContent = days ? `지구가 ${days}바퀴 돌았어요 = ${days}일` : "지구가 한 바퀴 돌면 하루가 지나요";
        hud.dataset.phase = isDay ? "day" : "night";
      }

      /* 이름표 위치 */
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      dayAnchor
        .copy(earthPosition)
        .addScaledVector(sunDirection, earthRadius * 0.95)
        .addScaledVector(DAY_OFFSET, earthRadius);
      nightAnchor
        .copy(earthPosition)
        .addScaledVector(sunDirection, -earthRadius * 1.05)
        .addScaledVector(NIGHT_OFFSET, earthRadius);
      labels.day.place(dayAnchor, camera, width, height);
      labels.night.place(nightAnchor, camera, width, height);

      seoul.tip.getWorldPosition(tipWorld);
      toCamera.copy(camera.position).sub(tipWorld);
      const facing = seoulDir.dot(toCamera) > 0;
      labels.seoul.place(tipWorld, camera, width, height, facing);
    },
  };
}
