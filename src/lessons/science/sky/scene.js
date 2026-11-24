import * as THREE from "three";
import {
  applyResponsiveFraming,
  createLabel,
  createOrbitControls,
} from "../../../shared/three/stage.js";
import { createPin, createStars, createSun } from "../../../shared/three/space.js";
import { airMass, scatterOdds, skyColors, sunColor, transmitted } from "../../../shared/optics.js";

const PLANET_RADIUS = 30;
const AIR_THICKNESS = 4; // 실제(지구 반지름의 약 1.5%)보다 아주 두껍게
const SUN_DISTANCE = 40;
const PARTICLES = 380;
const SPAWN_PER_SECOND = 220;
const PARTICLE_LIFE = 1.6;
const PARTICLE_COLORS = {
  r: new THREE.Color(1, 0.3, 0.22),
  g: new THREE.Color(0.35, 1, 0.4),
  b: new THREE.Color(0.35, 0.6, 1),
};

const SKY_SVG = `
  <svg class="gauge" viewBox="0 0 200 96" role="img" aria-label="땅에서 올려다본 하늘과 해">
    <defs>
      <linearGradient id="sky-view" x1="0" y1="0" x2="0" y2="1">
        <stop class="sky-view__top" offset="0"/><stop class="sky-view__bottom" offset="1"/>
      </linearGradient>
    </defs>
    <rect width="200" height="96" fill="url(#sky-view)"/>
    <circle class="sky-view__sun" cx="60" r="9"/>
    <rect class="sky-view__ground" y="82" width="200" height="14"/>
    <text x="150" y="80" font-size="16">🧒</text>
  </svg>`;

/** 동그란 빛 알갱이 모양 */
function dotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const toCss = ({ r, g, b }, k = 1) =>
  `rgb(${Math.round(r * k * 255)}, ${Math.round(g * k * 255)}, ${Math.round(b * k * 255)})`;

export function createScene({ canvas, overlay, complete }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = createOrbitControls(camera, canvas, { minDistance: 8, maxDistance: 45 });
  const framing = {
    direction: new THREE.Vector3(0.05, 0.3, 1).normalize(),
    wideTargetX: -4.5,
    narrowTargetX: -2.5,
    wideDistance: 21,
    narrowDistance: 34,
    targetY: 1.6,
    narrowTargetY: 3,
  };

  scene.add(createStars(83));

  /* ---- 땅(지구 겉면 일부)과 공기층 ---- */
  const center = new THREE.Vector3(0, -PLANET_RADIUS, 0);
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 160, 80),
    new THREE.MeshStandardMaterial({ color: 0x2c6b58, roughness: 0.95 })
  );
  ground.position.copy(center);
  scene.add(ground);

  const airMaterial = new THREE.MeshBasicMaterial({
    color: 0x6fb6ff,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const air = new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS + AIR_THICKNESS, 160, 80), airMaterial);
  air.position.copy(center);
  air.renderOrder = 2;
  scene.add(air);

  const hemi = new THREE.HemisphereLight(0x9cc8ff, 0x0b1424, 0.5);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2);
  scene.add(sunLight);

  /* ---- 나(관찰자) ---- */
  const observer = createPin(new THREE.Vector3(0, 0, 0), { color: 0xffc83d, height: 0.2 });
  observer.pin.scale.setScalar(4);
  scene.add(observer.pin);

  /* ---- 해 ---- */
  const sun = createSun(1.6);
  sun.mesh.userData.body = {
    id: "sun",
    title: "☀️ 햇빛",
    text: "햇빛은 하얗게 보이지만, 빨강·주황·노랑·초록·파랑·남색·보라 여러 색 빛이 섞여 있어요. 공기를 지나면서 이 색들이 서로 다르게 흩어져요.",
  };
  scene.add(sun.group);

  /* ---- 햇빛 한 줄기: 길을 따라 색이 바뀐다 ---- */
  const beamGeometry = new THREE.CylinderGeometry(0.13, 0.13, 1, 12, 80, true);
  const beamColors = new Float32Array(beamGeometry.attributes.position.count * 3);
  beamGeometry.setAttribute("color", new THREE.BufferAttribute(beamColors, 3));
  const beam = new THREE.Mesh(
    beamGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })
  );
  beam.renderOrder = 3;
  scene.add(beam);

  /* ---- 흩어지는 빛 알갱이 ---- */
  const positions = new Float32Array(PARTICLES * 3);
  const colors = new Float32Array(PARTICLES * 4); // rgba: 투명한 캔버스에 검은 점이 남지 않게 알파로 사라지게 한다
  const pool = Array.from({ length: PARTICLES }, () => ({
    life: 0,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    color: new THREE.Color(),
  }));
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pointsGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  const points = new THREE.Points(
    pointsGeometry,
    new THREE.PointsMaterial({
      size: 0.62,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    })
  );
  points.renderOrder = 4;
  points.frustumCulled = false;
  scene.add(points);

  /* ---- 화면 위 글씨 ---- */
  const labels = {
    me: createLabel(overlay, "나", "pin"),
    air: createLabel(overlay, "공기층", "air"),
  };
  const airAnchor = new THREE.Vector3(-9, 0, 0);
  airAnchor.y = Math.sqrt((PLANET_RADIUS + AIR_THICKNESS) ** 2 - 81) - PLANET_RADIUS - 0.7;

  const hud = document.createElement("div");
  hud.className = "hud hud--sky";
  hud.innerHTML = `
    <p class="hud__place">🧒 내가 올려다본 하늘</p>
    ${SKY_SVG}
    <p class="hud__value"></p>
    <p class="hud__sub"></p>`;
  overlay.append(hud);
  const skyTop = hud.querySelector(".sky-view__top");
  const skyBottom = hud.querySelector(".sky-view__bottom");
  const skySun = hud.querySelector(".sky-view__sun");
  const skyGround = hud.querySelector(".sky-view__ground");
  const hudValue = hud.querySelector(".hud__value");
  const hudSub = hud.querySelector(".hud__sub");

  const dir = new THREE.Vector3();
  const beamStart = new THREE.Vector3();
  const beamEnd = new THREE.Vector3(0, 0.6, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const tipWorld = new THREE.Vector3();
  let altitude = null;
  let entry = 1; // 관찰자에서 공기층 바깥까지 거리
  let spawnDebt = 0;

  /** 해 높이가 바뀌면 해·빛줄기·조명·하늘 그림을 다시 맞춘다 */
  function setAltitude(h) {
    altitude = h;
    const rad = THREE.MathUtils.degToRad(h);
    dir.set(-Math.cos(rad), Math.sin(rad), 0);
    sun.group.position.copy(dir).multiplyScalar(SUN_DISTANCE);
    sunLight.position.copy(dir).multiplyScalar(20);

    // 관찰자에서 해 쪽으로 가다 공기층 바깥을 만나는 거리: t² + 2Rt·sin h - (2R·A + A²) = 0
    const outer = PLANET_RADIUS + AIR_THICKNESS;
    const b = PLANET_RADIUS * Math.sin(rad);
    entry = -b + Math.sqrt(b * b + outer * outer - PLANET_RADIUS * PLANET_RADIUS);

    beamStart.copy(dir).multiplyScalar(SUN_DISTANCE - 2).add(beamEnd);
    const length = beamStart.distanceTo(beamEnd);
    beam.position.copy(beamStart).add(beamEnd).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(up, dir);
    beam.scale.set(1, length, 1);

    // 빛줄기 색: 공기 밖은 하얀 햇빛, 공기 속은 지나온 길이만큼 흩어지고 남은 색
    const mass = airMass(h);
    const pos = beamGeometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const fromObserver = (pos.getY(i) + 0.5) * length; // +0.5 쪽 끝이 해 쪽
      const fraction = Math.min(Math.max(1 - fromObserver / entry, 0), 1);
      const left = transmitted(mass * fraction);
      const max = Math.max(left.r, left.g, left.b);
      const k = (0.35 + 0.65 * max) / max;
      beamColors.set([left.r * k, left.g * k, left.b * k], i * 3);
    }
    beamGeometry.attributes.color.needsUpdate = true;

    const sunNow = sunColor(h);
    const sky = skyColors(h);
    sunLight.color.setRGB(sunNow.r, sunNow.g, sunNow.b);
    sunLight.intensity = 0.4 + 2.4 * Math.max(Math.sin(rad), 0);
    hemi.color.setRGB(sky.zenith.r, sky.zenith.g, sky.zenith.b);
    hemi.intensity = 0.2 + 0.5 * sky.brightness;
    airMaterial.color.setRGB(
      sky.zenith.r * sky.brightness,
      sky.zenith.g * sky.brightness,
      sky.zenith.b * sky.brightness
    );

    skyTop.setAttribute("stop-color", toCss(sky.zenith, sky.brightness));
    skyBottom.setAttribute("stop-color", toCss(sky.horizon, Math.min(1, sky.brightness + 0.15)));
    skySun.setAttribute("cy", (82 - Math.sin(rad) * 70).toFixed(1));
    skySun.setAttribute("fill", toCss(sunNow));
    skyGround.setAttribute("fill", toCss({ r: 0.2, g: 0.42, b: 0.3 }, 0.35 + 0.65 * sky.brightness));

    hud.dataset.time = h < 5 ? "sunset" : "day";
    hudValue.textContent =
      h >= 40
        ? "한낮 · 하늘은 파랗고 해는 하얘요"
        : h >= 15
          ? "오후 · 하늘이 조금 옅어져요"
          : h >= 5
            ? "저녁 · 해가 노랗게 물들어요"
            : "해 질 녘 · 해와 하늘이 붉게 물들어요";
    hudSub.textContent = `햇빛이 지나는 공기: 한낮의 ${mass < 9.95 ? mass.toFixed(1) : Math.round(mass)}배`;

    if (h >= 75) complete("noon");
    if (h <= 3) complete("sunset");
  }

  function spawn() {
    const p = pool.find((item) => item.life <= 0);
    if (!p) return;
    const fraction = Math.random();
    const odds = scatterOdds(fraction, altitude);
    if (Math.random() > odds.strength) return; // 빛이 많이 줄어든 곳일수록 덜 흩어진다
    const roll = Math.random();
    const key = roll < odds.b ? "b" : roll < odds.b + odds.g ? "g" : "r";
    p.pos.copy(beamEnd).addScaledVector(dir, entry * (1 - fraction));
    p.vel.randomDirection().multiplyScalar(2.2);
    p.color.copy(PARTICLE_COLORS[key]);
    p.life = PARTICLE_LIFE;
  }

  return {
    scene,
    camera,
    controls,
    pickTargets: [sun.mesh],

    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyResponsiveFraming(camera, controls, width, height, framing);
    },

    update(dt, state) {
      if (state.slider !== altitude) setAltitude(state.slider);
      controls.update();

      if (!state.paused) {
        spawnDebt += dt * SPAWN_PER_SECOND;
        while (spawnDebt >= 1) {
          spawn();
          spawnDebt -= 1;
        }
        pool.forEach((p) => {
          if (p.life > 0) {
            p.life -= dt;
            p.pos.addScaledVector(p.vel, dt);
          }
        });
      }
      pool.forEach((p, i) => {
        const fade = Math.max(p.life / PARTICLE_LIFE, 0);
        positions.set([p.pos.x, p.pos.y, p.pos.z], i * 3);
        colors.set([p.color.r, p.color.g, p.color.b, fade], i * 4);
      });
      pointsGeometry.attributes.position.needsUpdate = true;
      pointsGeometry.attributes.color.needsUpdate = true;

      /* 이름표 위치 */
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      labels.me.place(observer.tip.getWorldPosition(tipWorld), camera, width, height);
      labels.air.place(airAnchor, camera, width, height);
    },
  };
}
