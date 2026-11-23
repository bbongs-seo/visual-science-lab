/* 화면 속 천체 위치로 시각·물높이를 계산하는 순수 함수 모음 (three.js 없이 테스트 가능) */

const TAU = Math.PI * 2;

/** from 을 axis 둘레로 얼마나 돌려야 to 방향이 되는지 (라디안, -π~π, 오른손 법칙 +) */
export function signedAngleAround(from, to, axis) {
  const project = (v) => {
    const d = v.x * axis.x + v.y * axis.y + v.z * axis.z;
    return { x: v.x - axis.x * d, y: v.y - axis.y * d, z: v.z - axis.z * d };
  };
  const a = project(from);
  const b = project(to);
  const cross = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
  const sin = cross.x * axis.x + cross.y * axis.y + cross.z * axis.z;
  const cos = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.atan2(sin, cos);
}

/**
 * 태양 쪽 자오선에서 자전 방향으로 잰 각 → 그 지점의 태양시(0 이상 24 미만).
 * 태양을 정면으로 보면 낮 12시, 자전 방향으로 90도 더 돌면 저녁 6시.
 */
export function solarHour(angleFromNoon) {
  const turns = (((angleFromNoon / TAU) % 1) + 1) % 1;
  return (12 + turns * 24) % 24;
}

/** 원하는 시각이 되려면 태양 자오선에서 몇 라디안 떨어져 있어야 하는지 */
export function angleForHour(hour) {
  return ((hour - 12) / 24) * TAU;
}

/** 초등학생이 읽기 쉬운 시각 표현: 새벽 3시, 아침 7시, 오전 10시, 낮 12시, 오후 3시, 저녁 6시, 밤 10시 */
export function describeHour(hour) {
  const h = Math.floor(hour) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const word =
    h < 1 ? "밤" : h < 5 ? "새벽" : h < 8 ? "아침" : h < 12 ? "오전" : h < 13 ? "낮" : h < 17 ? "오후" : h < 20 ? "저녁" : "밤";
  return `${word} ${h12}시`;
}

/** 관측 지점이 달 방향에서 벌어진 각 → 물높이 (-1 썰물 ~ 1 밀물). 부푼 곳이 두 군데라 2배 각을 쓴다 */
export function tideLevel(angleToMoon) {
  return Math.cos(2 * angleToMoon);
}

/** 물높이와 그 변화 방향으로 바닷가 상태를 고른다 */
export function describeTide(level, rising) {
  if (level > 0.65) return { key: "high", text: "밀물 · 바닷물이 가득 들어왔어요" };
  if (level < -0.65) return { key: "low", text: "썰물 · 갯벌이 넓게 드러났어요" };
  return rising
    ? { key: "rising", text: "바닷물이 들어오고 있어요" }
    : { key: "falling", text: "바닷물이 빠져나가고 있어요" };
}
