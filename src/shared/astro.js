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

/* ---------------------------------------------------------
   계절: 날짜(1월 1일 = 0일째) → 지구의 공전 위치와 서울의 해
   --------------------------------------------------------- */

export const AXIAL_TILT = 23.44; // 자전축 기울기(도)
export const YEAR_DAYS = 365;
const SUMMER_SOLSTICE = 171; // 6월 21일 (0일째부터 센 날)
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DEG = Math.PI / 180;

/** 하지에서부터 공전 방향(위에서 보면 시계 반대)으로 잰 지구 위치 각(라디안) */
export function orbitAngle(day) {
  return ((day - SUMMER_SOLSTICE) / YEAR_DAYS) * TAU;
}

/** 태양이 적도에서 남북으로 얼마나 올라와 있는지(도). 하지 +23.44, 동지 -23.44, 춘분·추분 0 */
export function sunDeclination(day) {
  return Math.asin(Math.sin(AXIAL_TILT * DEG) * Math.cos(orbitAngle(day))) / DEG;
}

/** 한낮(남중) 태양 높이(도) */
export function noonAltitude(lat, declination) {
  return 90 - lat + declination;
}

/** 해가 떠 있는 시간(시간). 극지방의 백야·극야는 24·0 */
export function dayLength(lat, declination) {
  const x = -Math.tan(lat * DEG) * Math.tan(declination * DEG);
  return (2 * Math.acos(Math.min(1, Math.max(-1, x)))) / DEG / 15;
}

/** 0~364일째 → { month: 1~12, date: 1~31 } */
export function dayToDate(day) {
  let rest = Math.floor((((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS));
  let month = 0;
  while (rest >= MONTH_DAYS[month]) rest -= MONTH_DAYS[month++];
  return { month: month + 1, date: rest + 1 };
}

const TURNING_POINTS = [
  [79, "춘분"],
  [171, "하지"],
  [265, "추분"],
  [355, "동지"],
];

/** 날짜 표시: "6월 21일 하지", "8월 15일" */
export function describeDay(day) {
  const { month, date } = dayToDate(day);
  const point = TURNING_POINTS.find(([at]) => Math.abs(Math.floor(day) - at) <= 1);
  return `${month}월 ${date}일${point ? ` ${point[1]}` : ""}`;
}

/** 우리나라 계절 (3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울) */
export function seasonOf(day) {
  const { month } = dayToDate(day);
  return ["겨울", "봄", "여름", "가을"][Math.floor((month % 12) / 3)];
}

/** "14시간 35분" */
export function describeDuration(hours) {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}시간 ${total % 60}분`;
}

/* ---------------------------------------------------------
   일식·월식: 달 위치각(0도 = 태양 쪽, 삭) → 식의 종류
   그림자 원뿔은 장면용 단순 모델이고, 지구·달 셰이더(space.js)도 같은 값을 쓴다
   --------------------------------------------------------- */

// 실제처럼 달 본그림자가 지구 표면에 겨우 닿고(개기일식은 좁은 띠), 지구 본그림자는 달보다 훨씬 크게
export const SHADOW_TAPER = 0.055; // 거리 1당 본그림자가 줄어드는 정도
export const SHADOW_SPREAD = 0.055; // 거리 1당 반그림자가 넓어지는 정도

/** 반지름 radius 인 구가 distance 떨어진 곳에 드리우는 본그림자·반그림자 반지름 */
export function shadowRadii(radius, distance) {
  return {
    umbra: Math.max(radius - distance * SHADOW_TAPER, 0),
    penumbra: radius + distance * SHADOW_SPREAD,
  };
}

/** 지구에서 본 달 모양 이름 (위치각 0도 = 삭, 공전 방향으로 증가) */
export function moonPhaseName(deg) {
  const a = ((deg % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return "삭";
  if (a < 67.5) return "초승달";
  if (a < 135) return "상현달";
  if (a < 225) return "보름달";
  if (a < 292.5) return "하현달";
  return "그믐달";
}

/**
 * 태양은 지구의 -x 쪽 멀리, 달은 지구 둘레 orbit 거리에서 같은 평면을 돈다고 볼 때.
 * - 일식: 달 그림자가 '해를 마주한 지구 한가운데'에 닿는지. reveal 0 = 해가 다 가려짐 ~ 1 = 가장자리만 닿음
 * - 월식: 지구 본그림자가 달을 얼마나 덮는지. offset·umbra 는 달 반지름 단위가 아닌 장면 거리
 */
export function eclipseAt(deg, { orbit, earthRadius, moonRadius }) {
  const a = deg * DEG;
  const along = orbit * Math.cos(a); // + 면 태양 쪽
  const offset = Math.abs(orbit * Math.sin(a)); // 태양-지구를 잇는 선에서 비켜난 거리

  if (along > 0) {
    const { umbra, penumbra } = shadowRadii(moonRadius, along - earthRadius);
    const kind = offset < umbra ? "total" : offset < penumbra ? "partial" : null;
    const reveal = Math.min(Math.max((offset - umbra) / (penumbra - umbra), 0), 1);
    return { type: "solar", kind, reveal };
  }

  const { umbra } = shadowRadii(earthRadius, -along);
  const kind = offset + moonRadius < umbra ? "total" : offset - moonRadius < umbra ? "partial" : null;
  return { type: "lunar", kind, offset, umbra };
}
