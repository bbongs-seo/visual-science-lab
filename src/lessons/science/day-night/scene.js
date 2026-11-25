import * as THREE from "three";
import {
  applyResponsiveFraming,
  createEdgePointer,
  createLabel,
  createOrbitControls,
  liftAbove,
  projectedRadius,
} from "../../../shared/three/stage.js";
import {
  createEarth,
  createPin,
  createStars,
  createSun,
  latLonToVector3,
  SCALE,
} from "../../../shared/three/space.js";
import { angleForHour, describeHour, signedAngleAround, solarHour } from "../../../shared/astro.js";

const SEOUL = { lat: 37.57, lon: 126.98 };
const EARTH_SPIN = 0.32; // '보통' 속도에서 초당 회전(라디안): 약 20초에 하루
const START_HOUR = 7; // 서울의 아침에서 출발해 낮 → 저녁 → 밤을 차례로 보여 준다
const TAU = Math.PI * 2;
const DAY_OFFSET = new THREE.Vector3(0, 0.95, 0.4);
const NIGHT_OFFSET = new THREE.Vector3(0, -0.75, 0.4);
// 줌 아웃으로 지구가 화면에서 이만큼(반지름 px)보다 작아지면 이름표가 지구를 덮으므로 숨긴다
const SEOUL_LABEL_MIN_PX = 45;
const DAY_NIGHT_LABEL_MIN_PX = 22;

export function createScene({ canvas, overlay, complete, signal, pick }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = createOrbitControls(camera, canvas, { minDistance: 5, maxDistance: 45 });
  // 넓은 화면: 왼쪽 끝에 커다란 태양 일부가 걸리게. 좁은 화면: 지구에 맞추고 태양은 빛무리만
  const framing = {
    direction: new THREE.Vector3(-1.2, 1.6, 11.5).normalize(),
    wideTargetX: -5,
    narrowTargetX: -0.3,
    wideDistance: 13.5,
    narrowDistance: 10,
    targetY: 0.05,
  };

  scene.add(createStars(11));

  /* ---- 태양 ---- */
  const sunPosition = new THREE.Vector3(-SCALE.sunDistance, 0.3, 0);
  const sun = createSun(SCALE.sunRadius);
  sun.group.position.copy(sunPosition);
  sun.mesh.userData.body = {
    id: "sun",
    title: "☀️ 태양",
    text: "스스로 빛과 열을 내는 별이에요. 지름이 지구의 약 109배나 돼요. 태양 빛이 지구까지 오는 데는 약 8분 20초가 걸려요.",
  };
  scene.add(sun.group);

  /* ---- 지구: 자전축을 23.4도 기울여 북반구가 살짝 보이게 ---- */
  const earthPosition = new THREE.Vector3(0, 0, 0);
  const earthRadius = SCALE.earthRadius;
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
  // 휴대폰처럼 좁은 화면에서는 태양이 화면 밖이라 가장자리 버튼으로 대신 누른다
  const sunPointer = createEdgePointer(overlay, "☀️ 태양", () => pick(sun.mesh.userData.body), signal);
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
      } else {
        earth.mesh.rotation.y += angleForHour(state.slider) - seoulAngle(); // 시각 막대가 가리키는 시각으로 돌려 둔다
      }
      controls.update();

      /* 서울의 시각과 낮·밤 */
      const hour = solarHour(seoulAngle());
      if (!state.paused) state.slider = hour;
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
      const earthPx = projectedRadius(earthPosition, earthRadius, camera, height);
      labels.day.place(dayAnchor, camera, width, height, earthPx >= DAY_NIGHT_LABEL_MIN_PX);
      labels.night.place(nightAnchor, camera, width, height, earthPx >= DAY_NIGHT_LABEL_MIN_PX);

      seoul.tip.getWorldPosition(tipWorld);
      toCamera.copy(camera.position).sub(tipWorld);
      const facing = seoulDir.dot(toCamera) > 0;
      labels.seoul.place(tipWorld, camera, width, height, facing && earthPx >= SEOUL_LABEL_MIN_PX);
      liftAbove(labels.day, labels.seoul);
      // 태양 원반이 화면에 걸려 있으면(넓은 화면) 직접 누를 수 있으니 버튼을 숨긴다
      sunPointer.place(sunPosition, camera, width, height, projectedRadius(sunPosition, SCALE.sunRadius * 0.8, camera, height));
    },
  };
}
