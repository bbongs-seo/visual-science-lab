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
  SCALE,
} from "../../../shared/three/space.js";
import {
  AXIAL_TILT,
  YEAR_DAYS,
  dayLength,
  describeDay,
  describeDuration,
  noonAltitude,
  orbitAngle,
  seasonOf,
  sunDeclination,
} from "../../../shared/astro.js";

const SEOUL = { lat: 37.57, lon: 126.98 };
const DAYS_PER_SECOND = 10; // '보통' 속도에서 약 36초에 1년
const EARTH_SPIN = 1.2; // 자전은 실제 비율 대신 돌고 있다는 것만 보이게 천천히
// 궤도 한 바퀴를 한 화면에 담으려고 다른 레슨보다 궤도는 줄이고 지구는 키웠다 (그래도 태양이 지구의 약 3배)
const ORBIT_RADIUS = 13;
const EARTH_RADIUS = SCALE.earthRadius * 1.6;
const START_DAY = 110; // 4월 21일: 조금 기다리면 여름으로 들어간다
const TAU = Math.PI * 2;

// 이름표를 궤도 바깥에 두면 좁은 화면에서 잘리거나 앞쪽 지구를 가리므로, 뒤쪽(추분) 말고는 지구가 설 자리 바로 아래에 둔다
const TURNING_POINTS = [
  { day: 171, text: "6월 · 하지", out: 0, down: EARTH_RADIUS + 0.75 },
  { day: 265, text: "9월 · 추분", out: 2.2, down: 0 },
  { day: 355, text: "12월 · 동지", out: 0, down: EARTH_RADIUS + 0.75 },
  { day: 79, text: "3월 · 춘분", out: 0, down: EARTH_RADIUS + 0.75 },
];

const GAUGE_SVG = `
  <svg class="gauge" viewBox="0 0 200 96" role="img" aria-label="서울의 한낮 해 높이와 막대 그림자">
    <defs>
      <linearGradient id="gauge-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5aa9ea"/><stop offset="1" stop-color="#cbe9ff"/>
      </linearGradient>
    </defs>
    <rect width="200" height="96" fill="url(#gauge-sky)"/>
    <path d="M 52 84 A 72 72 0 0 1 196 84" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-dasharray="3 4"/>
    <rect y="84" width="200" height="12" fill="#6fae5a"/>
    <path class="gauge__shadow" d="M124 84 H124" stroke="#2c3e2a" stroke-opacity="0.55" stroke-width="5" stroke-linecap="round"/>
    <line x1="124" y1="84" x2="124" y2="56" stroke="#7a4a22" stroke-width="4" stroke-linecap="round"/>
    <line class="gauge__ray" x1="124" y1="56" x2="124" y2="56" stroke="#ffd34d" stroke-width="1.5" stroke-dasharray="2 3"/>
    <circle class="gauge__sun" r="9" fill="#ffd34d" stroke="#ff9a1f" stroke-width="2"/>
    <text x="8" y="80" font-size="10" fill="#1d4f7a">남쪽</text>
  </svg>`;

export function createScene({ canvas, overlay, complete }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = createOrbitControls(camera, canvas, { minDistance: 8, maxDistance: 64 });
  const framing = {
    direction: new THREE.Vector3(0, 0.68, 1).normalize(),
    wideTargetX: 0,
    narrowTargetX: 0,
    wideDistance: 34,
    narrowDistance: 60,
    targetY: -4.5,
    narrowTargetY: 5, // 세로 화면: 위쪽 정보판에 가리지 않게 궤도를 아래로 내린다
  };

  scene.add(createStars(47));

  /* ---- 태양: 가운데 ---- */
  const sun = createSun(SCALE.sunRadius);
  sun.mesh.userData.body = {
    id: "sun",
    title: "☀️ 태양",
    text: "지구는 1년에 한 바퀴 태양 둘레를 돌아요. 신기하게도 지구가 태양과 가장 가까운 때는 우리나라가 추운 1월이에요. 거리 때문에 계절이 생기는 게 아니랍니다.",
  };
  scene.add(sun.group);

  /* ---- 공전 궤도와 계절 표시 ---- */
  const orbitLine = new THREE.Mesh(
    new THREE.RingGeometry(ORBIT_RADIUS - 0.015, ORBIT_RADIUS + 0.015, 200),
    new THREE.MeshBasicMaterial({
      color: 0xbcd4ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  orbitLine.rotation.x = -Math.PI / 2;
  scene.add(orbitLine);

  const orbitPosition = (day, radius, target) => {
    const angle = orbitAngle(day);
    return target.set(Math.cos(angle) * radius, 0, -Math.sin(angle) * radius);
  };
  const markers = TURNING_POINTS.map((point) => ({
    label: createLabel(overlay, point.text, "season"),
    position: orbitPosition(point.day, ORBIT_RADIUS + point.out, new THREE.Vector3()).setY(-point.down),
  }));

  /* ---- 지구: 자전축은 공전하는 내내 같은 쪽을 가리킨다 ---- */
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(AXIAL_TILT); // 북극이 하지 쪽(태양이 있는 -x)으로 기운다
  earthGroup.add(tilt);

  const sunDirection = new THREE.Vector3(-1, 0, 0);
  const earth = createEarth(EARTH_RADIUS, sunDirection);
  const sharedSunDirection = earth.mesh.material.uniforms.sunDirection.value; // 대기와 함께 쓰는 벡터
  earth.mesh.userData.body = {
    id: "earth",
    title: "🌏 기울어진 지구",
    text: "지구의 자전축은 약 23.5도 기울어져 있어요. 태양 둘레를 도는 동안에도 늘 같은 쪽으로 기울어 있어서, 북쪽이 태양 쪽으로 기울 때는 우리나라가 여름, 반대로 기울 때는 겨울이 돼요.",
  };
  tilt.add(earth.mesh, earth.atmosphere);

  const axisLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, EARTH_RADIUS * 3.1, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe6a0 })
  );
  tilt.add(axisLine);

  const seoul = createPin(latLonToVector3(SEOUL.lat, SEOUL.lon, EARTH_RADIUS), { height: 0.16 });
  earth.mesh.add(seoul.pin);

  /* ---- 화면 위 글씨 ---- */
  const labels = {
    pole: createLabel(overlay, "북극", "pole"),
    seoul: createLabel(overlay, "서울", "pin"),
  };

  const hud = document.createElement("div");
  hud.className = "hud hud--season";
  hud.innerHTML = `
    <p class="hud__place">📍 서울 · <span data-date></span></p>
    <p class="hud__value"></p>
    ${GAUGE_SVG}
    <p class="hud__sub"></p>`;
  overlay.append(hud);
  const hudDate = hud.querySelector("[data-date]");
  const hudValue = hud.querySelector(".hud__value");
  const hudSub = hud.querySelector(".hud__sub");
  const gaugeSun = hud.querySelector(".gauge__sun");
  const gaugeShadow = hud.querySelector(".gauge__shadow");
  const gaugeRay = hud.querySelector(".gauge__ray");
  let hudText = "";

  const earthPosition = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const tipWorld = new THREE.Vector3();
  const seoulDir = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt.quaternion);
  let day = START_DAY;

  const near = (target) => {
    const gap = Math.abs(day - target) % YEAR_DAYS;
    return Math.min(gap, YEAR_DAYS - gap) <= 2;
  };

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
      if (state.paused) {
        day = state.slider ?? day;
      } else {
        day = (day + dt * DAYS_PER_SECOND * state.speed) % YEAR_DAYS;
        earth.mesh.rotation.y = (earth.mesh.rotation.y + dt * EARTH_SPIN * state.speed) % TAU;
        earth.drift(dt * 0.004);
        state.slider = day;
      }

      orbitPosition(day, ORBIT_RADIUS, earthPosition);
      earthGroup.position.copy(earthPosition);
      sharedSunDirection.copy(earthPosition).negate().normalize();
      controls.update();

      /* 서울의 한낮 해 높이 · 낮 길이 */
      if (near(171)) complete("summer");
      if (near(355)) complete("winter");

      const declination = sunDeclination(day);
      const altitude = noonAltitude(SEOUL.lat, declination);
      const next = `${describeDay(day)}|${Math.round(altitude)}`;
      if (next !== hudText) {
        hudText = next;
        const season = seasonOf(day);
        const hours = dayLength(SEOUL.lat, declination);
        hud.dataset.season = season;
        hudDate.textContent = describeDay(day);
        hudValue.textContent = `${season} · 낮 ${describeDuration(hours)}`;
        hudSub.textContent = `한낮 해 높이 ${Math.round(altitude)}° · 그림자 ${altitude > 60 ? "짧아요" : altitude < 38 ? "길어요" : "중간이에요"}`;

        const rad = THREE.MathUtils.degToRad(altitude);
        const sx = 124 - Math.cos(rad) * 72;
        const sy = 84 - Math.sin(rad) * 72;
        gaugeSun.setAttribute("cx", sx.toFixed(1));
        gaugeSun.setAttribute("cy", sy.toFixed(1));
        // 햇빛 한 줄기: 그림자 끝에서 막대 꼭대기를 지나 태양 쪽으로
        const shadow = Math.min(28 / Math.tan(rad), 74); // 막대 높이 28
        const tipX = 124 + shadow;
        const reach = Math.hypot(shadow, 28) + 22;
        gaugeRay.setAttribute("x1", tipX.toFixed(1));
        gaugeRay.setAttribute("y1", "84");
        gaugeRay.setAttribute("x2", (tipX - Math.cos(rad) * reach).toFixed(1));
        gaugeRay.setAttribute("y2", (84 - Math.sin(rad) * reach).toFixed(1));
        gaugeShadow.setAttribute("d", `M124 84 H${tipX.toFixed(1)}`);
      }

      /* 이름표 위치 */
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      markers.forEach((marker) => marker.label.place(marker.position, camera, width, height));

      anchor.copy(earthPosition).addScaledVector(axis, EARTH_RADIUS * 1.75);
      labels.pole.place(anchor, camera, width, height);

      earth.mesh.updateWorldMatrix(true, true);
      seoul.tip.getWorldPosition(tipWorld);
      seoulDir.copy(tipWorld).sub(earthPosition);
      toCamera.copy(camera.position).sub(tipWorld);
      labels.seoul.place(tipWorld, camera, width, height, seoulDir.dot(toCamera) > 0);
    },
  };
}
