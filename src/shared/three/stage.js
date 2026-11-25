/* 3D 무대 공통 도구: 렌더러 하나를 모든 레슨이 돌려 쓰고, 카메라·라벨·정리 함수를 제공한다 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let renderer = null;

/** WebGL 컨텍스트를 레슨마다 새로 만들지 않도록 렌더러 하나를 공유한다 (모바일 컨텍스트 개수 제한 대비) */
export function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "stage__canvas";
  }
  return renderer;
}

export function createOrbitControls(camera, canvas, { minDistance, maxDistance }) {
  const controls = new OrbitControls(camera, canvas);
  // 한 손가락: 돌리기, 두 손가락: 벌리고 오므려 확대 + 끌어서 화면 옮기기 (마우스는 오른쪽 버튼으로 옮기기)
  controls.enablePan = true;
  controls.maxTargetRadius = maxDistance / 2; // 옮기다 장면을 잃어버리지 않게 중심(원점)에서 이만큼까지만
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;
  controls.minDistance = minDistance;
  controls.maxDistance = maxDistance;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = Math.PI - 0.6;
  return controls;
}

/** 화면이 좁으면 카메라를 뒤로 빼고 중심을 옮겨 천체가 잘리지 않게 한다 */
export function applyResponsiveFraming(camera, controls, width, height, options) {
  const aspect = width / height;
  const wide = THREE.MathUtils.clamp((aspect - 0.85) / 0.75, 0, 1);
  const targetX = THREE.MathUtils.lerp(options.narrowTargetX, options.wideTargetX, wide);
  const distance = THREE.MathUtils.lerp(options.narrowDistance, options.wideDistance, wide);
  const targetY = options.targetY || 0;
  const narrowTargetY = options.narrowTargetY ?? targetY;

  controls.target.set(targetX, THREE.MathUtils.lerp(narrowTargetY, targetY, wide), 0);
  camera.position.copy(controls.target).addScaledVector(options.direction, distance);
  controls.framedDistance = distance;
  controls.update();
}

/** 처음 화면보다 factor 배 넘게 물러났는지(줌 아웃). 작아진 물체를 덮는 이름표를 숨길 때 쓴다 */
export function isZoomedOut(controls, factor = 1.2) {
  return controls.getDistance() > controls.framedDistance * factor;
}

/** 작은 천체(달)를 손가락으로 누르기 쉽게 보이지 않는 큰 구를 붙인다. Raycaster 는 visible=false 도 맞힌다 */
export function addTouchTarget(mesh, radius) {
  const hit = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial());
  hit.visible = false;
  hit.userData.body = mesh.userData.body;
  mesh.add(hit);
  return hit;
}

/** 3D 위치를 따라다니는 HTML 이름표 */
export function createLabel(parent, text, modifier = "") {
  const el = document.createElement("div");
  el.className = modifier ? `label label--${modifier}` : "label";
  el.textContent = text;
  el.setAttribute("aria-hidden", "true");
  parent.append(el);
  const projected = new THREE.Vector3();

  return {
    el,
    x: 0,
    y: 0, // 마지막으로 놓인 화면 위치(px). 이름표끼리 겹침을 피할 때 쓴다
    /** dy: 화면에서 아래로 더 내릴 거리(px) */
    place(worldPosition, camera, width, height, visible = true, dy = 0) {
      projected.copy(worldPosition).project(camera);
      this.x = (projected.x * 0.5 + 0.5) * width;
      this.y = (-projected.y * 0.5 + 0.5) * height + dy;
      el.style.transform = `translate(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px) translate(-50%, -50%)`;
      el.classList.toggle("is-visible", visible && projected.z < 1);
    },
  };
}

/** label 이 other 이름표와 겹치면 other 바로 위로 올린다. 같은 프레임에 둘 다 place 한 뒤 부른다.
   (CSS margin-top 으로 띄운 이름표가 있어 offsetTop 까지 더해 실제로 보이는 위치를 비교한다) */
export function liftAbove(label, other) {
  if (!other.el.classList.contains("is-visible")) return;
  const a = label.el;
  const b = other.el;
  const gap = (a.offsetHeight + b.offsetHeight) / 2 + 4;
  const otherY = other.y + b.offsetTop;
  if (Math.abs(label.x - other.x) >= (a.offsetWidth + b.offsetWidth) / 2) return;
  if (Math.abs(label.y + a.offsetTop - otherY) >= gap) return;
  label.y = otherY - gap - a.offsetTop;
  a.style.transform = `translate(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px) translate(-50%, -50%)`;
}

/** 반지름 radius 인 구가 position 에 있을 때 화면에서 보이는 반지름(px) */
export function projectedRadius(position, radius, camera, height) {
  const distance = camera.position.distanceTo(position);
  return (radius / (distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (height / 2);
}

/** 천체가 화면 밖에 있을 때 가장자리에 붙는 버튼. 누르면 onPress, 화면 안에 들어오면 숨는다.
   place 의 reach(px): 중심이 화면 밖이어도 이만큼 안쪽까지 보이면 화면 안으로 친다 */
export function createEdgePointer(parent, text, onPress, signal) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "edge-pointer";
  el.hidden = true;
  parent.append(el);
  el.addEventListener("click", onPress, { signal });
  const projected = new THREE.Vector3();
  const MARGIN = 12;
  let shown = "";

  return {
    el,
    place(worldPosition, camera, width, height, reach = 0) {
      projected.copy(worldPosition).project(camera);
      if (projected.z > 1) projected.multiplyScalar(-1); // 카메라 뒤에 있으면 방향이 뒤집힌다
      let x = (projected.x * 0.5 + 0.5) * width;
      let y = (-projected.y * 0.5 + 0.5) * height;
      const inside =
        projected.z <= 1 && x >= -reach && x <= width + reach && y >= -reach && y <= height + reach;
      el.hidden = inside;
      if (inside) return;

      const side = x < 0 ? "◀" : x > width ? "▶" : y < 0 ? "▲" : "▼";
      const label = side === "▶" || side === "▼" ? `${text} ${side}` : `${side} ${text}`;
      if (label !== shown) el.textContent = shown = label;
      const w = el.offsetWidth / 2 + MARGIN;
      const h = el.offsetHeight / 2 + MARGIN;
      x = THREE.MathUtils.clamp(x, w, width - w);
      y = THREE.MathUtils.clamp(y, h, height - h);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    },
  };
}

const sightRay = new THREE.Ray();
const sightHit = new THREE.Vector3();

/** 카메라에서 point 를 바라보는 시선이 구(행성)에 먼저 가로막히는지 */
export function isBehindSphere(point, camera, sphere) {
  sightRay.origin.copy(camera.position);
  sightRay.direction.copy(point).sub(camera.position);
  const distance = sightRay.direction.length();
  sightRay.direction.normalize();
  const hit = sightRay.intersectSphere(sphere, sightHit);
  return hit !== null && camera.position.distanceTo(hit) < distance;
}

/** 레슨을 떠날 때 GPU 자원을 돌려준다. 공유 텍스처(캐시)는 material.dispose()로 지워지지 않는다 */
export function disposeScene(scene) {
  scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material && material.dispose());
  });
}
