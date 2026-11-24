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
  controls.enablePan = false;
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
  controls.update();
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
    place(worldPosition, camera, width, height, visible = true) {
      projected.copy(worldPosition).project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      el.classList.toggle("is-visible", visible && projected.z < 1);
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
